import { randomUUID } from 'node:crypto';

import { type NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api/wrappers';
import { requireRole } from '@/lib/auth/require-role';
import { createClient } from '@/lib/supabase/server';
import { transitionPrevidenciarioCaseSchema } from '@/lib/previdenciario/case-workflow';
import { emitCaseAudit, getCaseRow, insertCaseEvent, loadCaseBundle } from '@/lib/previdenciario/case-api';

type RouteContext = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole('agent', { requestId, resource: 'previdenciario_case_transition' });
  if (!authz.ok) return authz.response;
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); } catch { return fail('body_malformed', 'JSON inválido.', 400, { requestId }); }
  const parsed = transitionPrevidenciarioCaseSchema.safeParse(body);
  if (!parsed.success) return fail('validation_failed', 'Destino de etapa inválido.', 422, { requestId, details: parsed.error.flatten() });
  const supabase = await createClient();
  const current = await getCaseRow(supabase, authz.org.orgId, id);
  if (current.error || !current.row) return fail(current.error?.code ?? 'not_found', current.error?.message ?? 'Caso não encontrado.', current.error?.status ?? 404, { requestId });
  const { data: destination, error: destinationError } = await supabase.from('previdenciario_case_stages').select('id, is_terminal').eq('organization_id', authz.org.orgId).eq('id', parsed.data.to_stage_id).eq('is_active', true).maybeSingle();
  if (destinationError) return fail('internal_error', 'Falha ao validar a etapa de destino.', 500, { requestId });
  if (!destination) return fail('validation_failed', 'Etapa de destino inválida.', 422, { requestId });
  const { error } = await supabase.from('previdenciario_cases').update({ stage_id: destination.id }).eq('organization_id', authz.org.orgId).eq('id', id);
  if (error) return fail('internal_error', 'Falha ao mover o caso.', 500, { requestId });
  const eventError = await insertCaseEvent(supabase, { organizationId: authz.org.orgId, caseId: id, kind: 'stage_changed', actorUserId: authz.user.id, fromStageId: current.row.stage_id, toStageId: destination.id, body: parsed.data.note ?? null });
  if (eventError) return fail(eventError.code, eventError.message, eventError.status, { requestId });
  emitCaseAudit('previdenciario.case_stage_changed', authz.user.id, authz.org.orgId, id, requestId, { from_stage_id: current.row.stage_id, to_stage_id: destination.id });
  const bundle = await loadCaseBundle(supabase, authz.org.orgId, id);
  if (bundle.error || !bundle.data) return fail(bundle.error?.code ?? 'internal_error', bundle.error?.message ?? 'Falha ao carregar o caso.', bundle.error?.status ?? 500, { requestId });
  return ok(bundle.data, { requestId });
}
