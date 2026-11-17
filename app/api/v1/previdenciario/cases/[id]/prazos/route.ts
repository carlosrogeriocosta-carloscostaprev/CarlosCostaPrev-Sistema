import { randomUUID } from 'node:crypto';

import { type NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api/wrappers';
import { requireRole } from '@/lib/auth/require-role';
import { requireSupportWrite } from '@/lib/impersonate/support';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { asJsonObject, createPrevidenciarioDeadlineSchema } from '@/lib/previdenciario/case-workflow';
import { emitCaseAudit, getCaseRow, insertCaseEvent, validateCaseRefs } from '@/lib/previdenciario/case-api';

type RouteContext = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole('agent', { requestId, resource: 'previdenciario_case_deadline' });
  if (!authz.ok) return authz.response;
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); } catch { return fail('body_malformed', 'JSON inválido.', 400, { requestId }); }
  const parsed = createPrevidenciarioDeadlineSchema.safeParse(body);
  if (!parsed.success) return fail('validation_failed', 'Dados do prazo inválidos.', 422, { requestId, details: parsed.error.flatten() });
  const supabase = await createClient();
  const current = await getCaseRow(supabase, authz.org.orgId, id);
  if (current.error || !current.row) return fail(current.error?.code ?? 'not_found', current.error?.message ?? 'Caso não encontrado.', current.error?.status ?? 404, { requestId });
  const refsError = await validateCaseRefs(supabase, createAdminClient(), authz.org.orgId, { responsibleUserId: parsed.data.responsible_user_id });
  if (refsError) return fail(refsError.code, refsError.message, refsError.status, { requestId });
  const { data, error } = await supabase.from('previdenciario_case_deadlines').insert({
    organization_id: authz.org.orgId,
    case_id: id,
    kind: parsed.data.kind,
    title: parsed.data.title,
    reference_at: parsed.data.reference_at ?? null,
    due_at: parsed.data.due_at,
    timezone: parsed.data.timezone,
    responsible_user_id: parsed.data.responsible_user_id ?? null,
    source: parsed.data.source,
    rule_key: parsed.data.rule_key,
    rule_version: parsed.data.rule_version,
    metadata: asJsonObject(parsed.data.metadata),
  }).select('*').single();
  if (error || !data) return fail(error?.code === '23505' ? 'conflict' : 'internal_error', error?.code === '23505' ? 'Este prazo já foi registrado para esta regra.' : error?.message ?? 'Falha ao criar o prazo.', error?.code === '23505' ? 409 : 500, { requestId });
  const eventError = await insertCaseEvent(supabase, { organizationId: authz.org.orgId, caseId: id, kind: 'deadline_created', actorUserId: authz.user.id, metadata: { deadline_id: data.id, rule_key: data.rule_key } });
  if (eventError) return fail(eventError.code, eventError.message, eventError.status, { requestId });
  emitCaseAudit('previdenciario.case_deadline_updated', authz.user.id, authz.org.orgId, id, requestId, { deadline_id: data.id, operation: 'created' });
  return ok(data, { status: 201, requestId });
}
