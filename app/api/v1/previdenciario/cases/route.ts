import { randomUUID } from 'node:crypto';

import { type NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api/wrappers';
import { requireRole } from '@/lib/auth/require-role';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  createPrevidenciarioCaseSchema,
  initialPendencyInputs,
  previdenciarioCaseListQuerySchema,
  asJsonObject,
} from '@/lib/previdenciario/case-workflow';
import { emitCaseAudit, insertCaseEvent, loadCaseBundle, resolveCatalogRefs, validateCaseRefs } from '@/lib/previdenciario/case-api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole('viewer', { requestId, resource: 'previdenciario_cases' });
  if (!authz.ok) return authz.response;
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = previdenciarioCaseListQuerySchema.safeParse(params);
  if (!parsed.success) return fail('validation_failed', 'Filtros do caso inválidos.', 422, { requestId, details: parsed.error.flatten() });

  const supabase = await createClient();
  let query = supabase.from('previdenciario_cases').select('*').eq('organization_id', authz.org.orgId).order('updated_at', { ascending: false }).limit(parsed.data.limit);
  if (parsed.data.status) query = query.eq('status', parsed.data.status);
  if (parsed.data.stage_id) query = query.eq('stage_id', parsed.data.stage_id);
  if (parsed.data.search) query = query.ilike('title', `%${parsed.data.search}%`);
  const { data: rows, error } = await query;
  if (error) return fail('internal_error', 'Falha ao carregar os casos previdenciários.', 500, { requestId });

  const bundles = await Promise.all((rows ?? []).map((row) => loadCaseBundle(supabase, authz.org.orgId, row.id)));
  const failed = bundles.find((bundle) => bundle.error);
  if (failed?.error) return fail(failed.error.code, failed.error.message, failed.error.status, { requestId });
  const list = bundles.flatMap((bundle) => (bundle.data ? [bundle.data] : []));
  return ok(list, { requestId, meta: { total: list.length, has_more: false } });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole('agent', { requestId, resource: 'previdenciario_cases' });
  if (!authz.ok) return authz.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('body_malformed', 'JSON inválido.', 400, { requestId });
  }
  const parsed = createPrevidenciarioCaseSchema.safeParse(body);
  if (!parsed.success) return fail('validation_failed', 'Dados do caso inválidos.', 422, { requestId, details: parsed.error.flatten() });
  if (parsed.data.benefit_key && parsed.data.service_key) return fail('validation_failed', 'Informe benefício ou serviço, não os dois.', 422, { requestId });

  const supabase = await createClient();
  const refs = await resolveCatalogRefs(supabase, authz.org.orgId, parsed.data.benefit_key, parsed.data.service_key);
  if (refs.error) return fail(refs.error.code, refs.error.message, refs.error.status, { requestId });
  const { data: stages, error: stagesError } = await supabase.from('previdenciario_case_stages').select('id').eq('organization_id', authz.org.orgId).eq('is_active', true).order('position').limit(1);
  if (stagesError) return fail('internal_error', 'Falha ao resolver a etapa inicial.', 500, { requestId });
  const stageId = parsed.data.stage_id ?? stages?.[0]?.id;
  if (!stageId) return fail('invalid_state', 'A organização não possui uma etapa previdenciária ativa.', 409, { requestId });
  const { data: stage, error: stageError } = await supabase.from('previdenciario_case_stages').select('id').eq('organization_id', authz.org.orgId).eq('id', stageId).eq('is_active', true).maybeSingle();
  if (stageError) return fail('internal_error', 'Falha ao validar a etapa.', 500, { requestId });
  if (!stage) return fail('validation_failed', 'Etapa previdenciária inválida.', 422, { requestId });
  const refsError = await validateCaseRefs(supabase, createAdminClient(), authz.org.orgId, { contactId: parsed.data.contact_id, leadId: parsed.data.lead_id, responsibleUserId: parsed.data.responsible_user_id });
  if (refsError) return fail(refsError.code, refsError.message, refsError.status, { requestId });

  const completedAt = parsed.data.status === 'completed' ? new Date().toISOString() : null;
  const archivedAt = parsed.data.status === 'archived' ? new Date().toISOString() : null;
  const { data: created, error } = await supabase.from('previdenciario_cases').insert({
    organization_id: authz.org.orgId,
    contact_id: parsed.data.contact_id,
    lead_id: parsed.data.lead_id ?? null,
    benefit_catalog_item_id: refs.benefit ? (await supabase.from('previdenciario_catalog_items').select('id').eq('stable_key', refs.benefit.stable_key).eq('kind', 'benefit').maybeSingle()).data?.id ?? null : null,
    service_catalog_item_id: refs.service ? (await supabase.from('previdenciario_catalog_items').select('id').eq('stable_key', refs.service.stable_key).eq('kind', 'service').maybeSingle()).data?.id ?? null : null,
    stage_id: stageId,
    status: parsed.data.status,
    title: parsed.data.title,
    protocol_number: parsed.data.protocol_number ?? null,
    source: parsed.data.source,
    responsible_user_id: parsed.data.responsible_user_id ?? null,
    metadata: asJsonObject(parsed.data.metadata),
    completed_at: completedAt,
    archived_at: archivedAt,
    created_by_user_id: authz.user.id,
  }).select('*').single();
  if (error || !created) return fail('internal_error', error?.message ?? 'Falha ao criar o caso.', 500, { requestId });

  const pending = initialPendencyInputs(created, authz.org.orgId, created.id);
  if (pending.length) {
    const { error: pendingError } = await supabase.from('previdenciario_case_pendencies').insert(pending);
    if (pendingError) return fail('internal_error', 'Caso criado, mas as pendências iniciais não foram registradas.', 500, { requestId });
  }
  const eventError = await insertCaseEvent(supabase, { organizationId: authz.org.orgId, caseId: created.id, kind: 'created', actorUserId: authz.user.id, metadata: { title: created.title } });
  if (eventError) return fail(eventError.code, eventError.message, eventError.status, { requestId });
  emitCaseAudit('previdenciario.case_created', authz.user.id, authz.org.orgId, created.id, requestId, { title: created.title });
  const bundle = await loadCaseBundle(supabase, authz.org.orgId, created.id);
  if (bundle.error || !bundle.data) return fail(bundle.error?.code ?? 'internal_error', bundle.error?.message ?? 'Falha ao carregar o caso criado.', bundle.error?.status ?? 500, { requestId });
  return ok(bundle.data, { status: 201, requestId });
}
