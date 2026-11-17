import { randomUUID } from 'node:crypto';

import { type NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api/wrappers';
import { requireRole } from '@/lib/auth/require-role';
import { createClient } from '@/lib/supabase/server';
import { updatePrevidenciarioPendencySchema } from '@/lib/previdenciario/case-workflow';
import { emitCaseAudit, getCaseRow, insertCaseEvent } from '@/lib/previdenciario/case-api';

type RouteContext = { params: Promise<{ id: string; pendencyId: string }> };
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole('agent', { requestId, resource: 'previdenciario_case_pendency' });
  if (!authz.ok) return authz.response;
  const { id, pendencyId } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); } catch { return fail('body_malformed', 'JSON inválido.', 400, { requestId }); }
  const parsed = updatePrevidenciarioPendencySchema.safeParse(body);
  if (!parsed.success) return fail('validation_failed', 'Atualização de pendência inválida.', 422, { requestId, details: parsed.error.flatten() });
  const supabase = await createClient();
  const current = await getCaseRow(supabase, authz.org.orgId, id);
  if (current.error || !current.row) return fail(current.error?.code ?? 'not_found', current.error?.message ?? 'Caso não encontrado.', current.error?.status ?? 404, { requestId });
  const { data: existing, error: existingError } = await supabase.from('previdenciario_case_pendencies').select('id, status').eq('organization_id', authz.org.orgId).eq('case_id', id).eq('id', pendencyId).maybeSingle();
  if (existingError) return fail('internal_error', existingError.message, 500, { requestId });
  if (!existing) return fail('not_found', 'Pendência não encontrada.', 404, { requestId });
  const { data, error } = await supabase.from('previdenciario_case_pendencies').update({ status: parsed.data.status, resolved_at: new Date().toISOString(), resolved_by_user_id: authz.user.id }).eq('organization_id', authz.org.orgId).eq('case_id', id).eq('id', pendencyId).select('*').single();
  if (error || !data) return fail('internal_error', error?.message ?? 'Falha ao atualizar a pendência.', 500, { requestId });
  const eventError = await insertCaseEvent(supabase, { organizationId: authz.org.orgId, caseId: id, kind: 'pendency_updated', actorUserId: authz.user.id, body: parsed.data.note ?? null, metadata: { pendency_id: pendencyId, status: parsed.data.status } });
  if (eventError) return fail(eventError.code, eventError.message, eventError.status, { requestId });
  emitCaseAudit('previdenciario.case_pendency_updated', authz.user.id, authz.org.orgId, id, requestId, { pendency_id: pendencyId, status: parsed.data.status });
  return ok(data, { requestId });
}
