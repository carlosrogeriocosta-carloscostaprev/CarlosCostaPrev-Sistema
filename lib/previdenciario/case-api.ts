import type { SupabaseClient } from '@supabase/supabase-js';

import { audit } from '@/lib/audit';
import type { AuditAction } from '@/lib/audit/actions';
import type { Database, Json } from '@/lib/database.types';

import {
  PREVIDENCIARIO_CASE_COLUMNS,
  PREVIDENCIARIO_CASE_DOCUMENT_COLUMNS,
  PREVIDENCIARIO_CASE_EVENT_COLUMNS,
  PREVIDENCIARIO_CASE_PENDENCY_COLUMNS,
  PREVIDENCIARIO_CASE_DEADLINE_COLUMNS,
  PREVIDENCIARIO_CASE_STAGE_COLUMNS,
  deriveCaseCompleteness,
  type PrevidenciarioCaseDocumentRow,
  type PrevidenciarioCaseEventRow,
  type PrevidenciarioCaseRow,
} from './case-workflow';
import { effectiveCatalogItem, type EffectiveCatalogItem } from './catalog-api';

type Client = SupabaseClient<Database>;

type CaseLookupError = { code: string; message: string; status: number };
export type CaseLookupResult = { row: PrevidenciarioCaseRow | null; error: CaseLookupError | null };

export async function getCaseRow(client: Client, organizationId: string, caseId: string): Promise<CaseLookupResult> {
  const { data, error } = await client
    .from('previdenciario_cases')
    .select(PREVIDENCIARIO_CASE_COLUMNS)
    .eq('organization_id', organizationId)
    .eq('id', caseId)
    .maybeSingle();
  if (error) return { row: null, error: { code: 'internal_error', message: error.message, status: 500 } };
  return { row: (data as PrevidenciarioCaseRow | null) ?? null, error: null };
}

export type CaseRefsInput = { contactId?: string | null; leadId?: string | null; responsibleUserId?: string | null };

/**
 * Confere que contato, lead e responsável do caso pertencem à MESMA organização.
 *
 * Por que existe: as FKs de `previdenciario_cases` e `previdenciario_case_deadlines` apontam só para
 * `contacts(id)`, `crm_leads(id)` e `auth.users(id)`, sem `organization_id`, e a FK confere existência com
 * privilégio de dono, não com a RLS. Sem esta conferência, quem soubesse o UUID de um contato de OUTRA
 * organização amarrava o caso a ele (e, pelo `on delete restrict`, travava a exclusão do contato alheio).
 *
 * `client` é a sessão de quem chama (a RLS já esconde linhas alheias) e o filtro por organização é explícito
 * mesmo assim. `admin` só lê `user_organizations`: a RLS dessa tabela mostra a um agente apenas a linha dele,
 * então a pertinência de OUTRA pessoa não se confere pela sessão. A organização vem de `requireRole`, nunca do corpo.
 * A mensagem é a mesma para "não existe" e "é de outra organização", para não confirmar a existência do UUID.
 */
export async function validateCaseRefs(client: Client, admin: Client, organizationId: string, refs: CaseRefsInput): Promise<CaseLookupError | null> {
  const invalido = (message: string): CaseLookupError => ({ code: 'validation_failed', message, status: 422 });
  const falha: CaseLookupError = { code: 'internal_error', message: 'Falha ao validar as referências do caso.', status: 500 };
  if (refs.contactId) {
    const { data, error } = await client.from('contacts').select('id').eq('organization_id', organizationId).eq('id', refs.contactId).maybeSingle();
    if (error) return falha;
    if (!data) return invalido('Contato inválido para esta organização.');
  }
  if (refs.leadId) {
    const { data, error } = await client.from('crm_leads').select('id').eq('organization_id', organizationId).eq('id', refs.leadId).maybeSingle();
    if (error) return falha;
    if (!data) return invalido('Lead inválido para esta organização.');
  }
  if (refs.responsibleUserId) {
    const { data, error } = await admin.from('user_organizations').select('user_id').eq('organization_id', organizationId).eq('user_id', refs.responsibleUserId).is('revoked_at', null).maybeSingle();
    if (error) return falha;
    if (!data) return invalido('Responsável inválido para esta organização.');
  }
  return null;
}

export type InsertCaseEventInput = {
  organizationId: string;
  caseId: string;
  kind: string;
  actorUserId?: string | null;
  actorKind?: 'user' | 'system' | 'agent' | 'client' | 'integration';
  source?: string;
  fromStageId?: string | null;
  toStageId?: string | null;
  body?: string | null;
  metadata?: Record<string, unknown>;
};

export async function insertCaseEvent(client: Client, input: InsertCaseEventInput): Promise<CaseLookupError | null> {
  const { error } = await client.from('previdenciario_case_events').insert({
    organization_id: input.organizationId,
    case_id: input.caseId,
    kind: input.kind,
    actor_kind: input.actorKind ?? (input.actorUserId ? 'user' : 'system'),
    actor_user_id: input.actorUserId ?? null,
    source: input.source ?? 'api',
    from_stage_id: input.fromStageId ?? null,
    to_stage_id: input.toStageId ?? null,
    body: input.body ?? null,
    metadata: (input.metadata ?? {}) as Json,
  });
  return error ? { code: 'internal_error', message: error.message, status: 500 } : null;
}

export function emitCaseAudit(action: AuditAction, actorUserId: string | null, organizationId: string, caseId: string, requestId: string, metadata: Record<string, unknown> = {}): void {
  void audit({ action, actorUserId, organizationId, resourceType: 'previdenciario_case', resourceId: caseId, requestId, metadata });
}

export async function resolveCatalogRefs(client: Client, organizationId: string, benefitKey?: string | null, serviceKey?: string | null): Promise<{ benefit: EffectiveCatalogItem | null; service: EffectiveCatalogItem | null; error: CaseLookupError | null }> {
  const keys = [benefitKey, serviceKey].filter((key): key is string => Boolean(key));
  if (keys.length === 0) return { benefit: null, service: null, error: null };
  const { data: items, error } = await client.from('previdenciario_catalog_items').select('id, stable_key, kind, display_name, official_codes, source_kind, source_ref, source_version, review_status, metadata, is_active, created_at, updated_at').in('stable_key', keys);
  if (error) return { benefit: null, service: null, error: { code: 'internal_error', message: error.message, status: 500 } };
  const ids = (items ?? []).map((item) => item.id);
  const { data: overrides, error: overrideError } = ids.length ? await client.from('previdenciario_catalog_overrides').select('id, organization_id, catalog_item_id, display_name, metadata, is_active, created_at, updated_at').eq('organization_id', organizationId).in('catalog_item_id', ids) : { data: [], error: null };
  if (overrideError) return { benefit: null, service: null, error: { code: 'internal_error', message: overrideError.message, status: 500 } };
  const projected = (items ?? []).map((item) => effectiveCatalogItem(item, overrides?.find((override) => override.catalog_item_id === item.id)));
  const benefit = projected.find((item) => item.stable_key === benefitKey && item.kind === 'benefit') ?? null;
  const service = projected.find((item) => item.stable_key === serviceKey && item.kind === 'service') ?? null;
  if ((benefitKey && !benefit) || (serviceKey && !service)) return { benefit: null, service: null, error: { code: 'validation_failed', message: 'Benefício ou serviço não encontrado no catálogo ativo.', status: 422 } };
  return { benefit, service, error: null };
}

export type CaseBundle = PrevidenciarioCaseRow & {
  stage: Record<string, unknown> | null;
  benefit: EffectiveCatalogItem | null;
  service: EffectiveCatalogItem | null;
  benefit_key: string | null;
  service_key: string | null;
  pending_count: number;
  completeness: ReturnType<typeof deriveCaseCompleteness>;
  pendencies: Record<string, unknown>[];
  deadlines: Record<string, unknown>[];
  documents: PrevidenciarioCaseDocumentRow[];
  events: PrevidenciarioCaseEventRow[];
};

export async function loadCaseBundle(client: Client, organizationId: string, caseId: string): Promise<{ data: CaseBundle | null; error: CaseLookupError | null }> {
  const current = await getCaseRow(client, organizationId, caseId);
  if (current.error || !current.row) return { data: null, error: current.error };
  const row = current.row;
  const [stageResult, pendencyResult, deadlineResult, documentResult, eventResult] = await Promise.all([
    client.from('previdenciario_case_stages').select(PREVIDENCIARIO_CASE_STAGE_COLUMNS).eq('organization_id', organizationId).eq('id', row.stage_id).maybeSingle(),
    client.from('previdenciario_case_pendencies').select(PREVIDENCIARIO_CASE_PENDENCY_COLUMNS).eq('organization_id', organizationId).eq('case_id', caseId).order('created_at', { ascending: false }),
    client.from('previdenciario_case_deadlines').select(PREVIDENCIARIO_CASE_DEADLINE_COLUMNS).eq('organization_id', organizationId).eq('case_id', caseId).order('due_at', { ascending: true }),
    client.from('previdenciario_case_documents').select(PREVIDENCIARIO_CASE_DOCUMENT_COLUMNS).eq('organization_id', organizationId).eq('case_id', caseId).order('uploaded_at', { ascending: false }),
    client.from('previdenciario_case_events').select(PREVIDENCIARIO_CASE_EVENT_COLUMNS).eq('organization_id', organizationId).eq('case_id', caseId).order('created_at', { ascending: true }),
  ]);
  const failed = [stageResult, pendencyResult, deadlineResult, documentResult, eventResult].find((result) => result.error);
  if (failed?.error) return { data: null, error: { code: 'internal_error', message: failed.error.message, status: 500 } };
  const benefitKey = row.benefit_catalog_item_id ? (await client.from('previdenciario_catalog_items').select('stable_key').eq('id', row.benefit_catalog_item_id).maybeSingle()).data?.stable_key ?? null : null;
  const serviceKey = row.service_catalog_item_id ? (await client.from('previdenciario_catalog_items').select('stable_key').eq('id', row.service_catalog_item_id).maybeSingle()).data?.stable_key ?? null : null;
  const refs = await resolveCatalogRefs(client, organizationId, benefitKey, serviceKey);
  if (refs.error) return { data: null, error: refs.error };
  const pendencies = (pendencyResult.data ?? []) as unknown as Record<string, unknown>[];
  const openCount = pendencies.filter((pendency) => pendency.status === 'open').length;
  return {
    data: {
      ...row,
      stage: (stageResult.data as Record<string, unknown> | null) ?? null,
      benefit: refs.benefit,
      service: refs.service,
      benefit_key: benefitKey,
      service_key: serviceKey,
      pending_count: openCount,
      completeness: deriveCaseCompleteness(row, openCount),
      pendencies,
      deadlines: (deadlineResult.data ?? []) as unknown as Record<string, unknown>[],
      documents: (documentResult.data ?? []) as unknown as PrevidenciarioCaseDocumentRow[],
      events: (eventResult.data ?? []) as unknown as PrevidenciarioCaseEventRow[],
    },
    error: null,
  };
}
