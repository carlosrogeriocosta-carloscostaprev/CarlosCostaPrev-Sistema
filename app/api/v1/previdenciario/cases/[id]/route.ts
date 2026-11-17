import { randomUUID } from 'node:crypto';

import { type NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api/wrappers';
import { requireRole } from '@/lib/auth/require-role';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { asJsonObject, updatePrevidenciarioCaseSchema } from '@/lib/previdenciario/case-workflow';
import { emitCaseAudit, getCaseRow, insertCaseEvent, loadCaseBundle, resolveCatalogRefs, validateCaseRefs } from '@/lib/previdenciario/case-api';
import type { Database } from '@/lib/database.types';

type RouteContext = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole('viewer', { requestId, resource: 'previdenciario_case' });
  if (!authz.ok) return authz.response;
  const { id } = await ctx.params;
  const supabase = await createClient();
  const bundle = await loadCaseBundle(supabase, authz.org.orgId, id);
  if (bundle.error || !bundle.data) return fail(bundle.error?.code ?? 'not_found', bundle.error?.message ?? 'Caso não encontrado.', bundle.error?.status ?? 404, { requestId });
  return ok(bundle.data, { requestId });
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole('agent', { requestId, resource: 'previdenciario_case' });
  if (!authz.ok) return authz.response;
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('body_malformed', 'JSON inválido.', 400, { requestId });
  }
  const parsed = updatePrevidenciarioCaseSchema.safeParse(body);
  if (!parsed.success) return fail('validation_failed', 'Dados de atualização inválidos.', 422, { requestId, details: parsed.error.flatten() });
  const supabase = await createClient();
  const current = await getCaseRow(supabase, authz.org.orgId, id);
  if (current.error || !current.row) return fail(current.error?.code ?? 'not_found', current.error?.message ?? 'Caso não encontrado.', current.error?.status ?? 404, { requestId });
  if (parsed.data.benefit_key && parsed.data.service_key) return fail('validation_failed', 'Informe benefício ou serviço, não os dois.', 422, { requestId });
  const refsError = await validateCaseRefs(supabase, createAdminClient(), authz.org.orgId, { responsibleUserId: parsed.data.responsible_user_id });
  if (refsError) return fail(refsError.code, refsError.message, refsError.status, { requestId });

  const hasBenefit = Object.prototype.hasOwnProperty.call(parsed.data, 'benefit_key');
  const hasService = Object.prototype.hasOwnProperty.call(parsed.data, 'service_key');
  const nextBenefitKey = hasBenefit ? parsed.data.benefit_key : null;
  const nextServiceKey = hasService ? parsed.data.service_key : null;
  const refs = hasBenefit || hasService ? await resolveCatalogRefs(supabase, authz.org.orgId, nextBenefitKey, nextServiceKey) : { benefit: null, service: null, error: null };
  if (refs.error) return fail(refs.error.code, refs.error.message, refs.error.status, { requestId });
  const update: Database['public']['Tables']['previdenciario_cases']['Update'] = {};
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.protocol_number !== undefined) update.protocol_number = parsed.data.protocol_number;
  if (parsed.data.responsible_user_id !== undefined) update.responsible_user_id = parsed.data.responsible_user_id;
  if (parsed.data.metadata !== undefined) update.metadata = asJsonObject(parsed.data.metadata);
  if (parsed.data.status !== undefined) {
    update.status = parsed.data.status;
    update.completed_at = parsed.data.status === 'completed' ? new Date().toISOString() : null;
    update.archived_at = parsed.data.status === 'archived' ? new Date().toISOString() : null;
  }
  if (hasBenefit) {
    update.benefit_catalog_item_id = refs.benefit ? ((await supabase.from('previdenciario_catalog_items').select('id').eq('stable_key', refs.benefit.stable_key).eq('kind', 'benefit').maybeSingle()).data?.id ?? null) : null;
    update.service_catalog_item_id = null;
  }
  if (hasService) {
    update.service_catalog_item_id = refs.service ? ((await supabase.from('previdenciario_catalog_items').select('id').eq('stable_key', refs.service.stable_key).eq('kind', 'service').maybeSingle()).data?.id ?? null) : null;
    update.benefit_catalog_item_id = null;
  }
  const { error } = await supabase.from('previdenciario_cases').update(update).eq('organization_id', authz.org.orgId).eq('id', id);
  if (error) return fail('internal_error', 'Falha ao atualizar o caso.', 500, { requestId });
  const eventError = await insertCaseEvent(supabase, { organizationId: authz.org.orgId, caseId: id, kind: 'updated', actorUserId: authz.user.id, metadata: { fields: Object.keys(update) } });
  if (eventError) return fail(eventError.code, eventError.message, eventError.status, { requestId });
  emitCaseAudit('previdenciario.case_updated', authz.user.id, authz.org.orgId, id, requestId, { fields: Object.keys(update) });
  const bundle = await loadCaseBundle(supabase, authz.org.orgId, id);
  if (bundle.error || !bundle.data) return fail(bundle.error?.code ?? 'internal_error', bundle.error?.message ?? 'Falha ao carregar o caso.', bundle.error?.status ?? 500, { requestId });
  return ok(bundle.data, { requestId });
}
