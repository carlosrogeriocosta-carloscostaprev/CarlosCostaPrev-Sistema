import { randomUUID } from 'node:crypto';

import { type NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api/wrappers';
import { requireRole } from '@/lib/auth/require-role';
import { createClient } from '@/lib/supabase/server';
import { asJsonObject, createPrevidenciarioPendencySchema } from '@/lib/previdenciario/case-workflow';
import { emitCaseAudit, getCaseRow, insertCaseEvent } from '@/lib/previdenciario/case-api';

type RouteContext = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole('agent', { requestId, resource: 'previdenciario_case_pendency' });
  if (!authz.ok) return authz.response;
  const { id } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); } catch { return fail('body_malformed', 'JSON inválido.', 400, { requestId }); }
  const parsed = createPrevidenciarioPendencySchema.safeParse(body);
  if (!parsed.success) return fail('validation_failed', 'Dados da pendência inválidos.', 422, { requestId, details: parsed.error.flatten() });
  const supabase = await createClient();
  const current = await getCaseRow(supabase, authz.org.orgId, id);
  if (current.error || !current.row) return fail(current.error?.code ?? 'not_found', current.error?.message ?? 'Caso não encontrado.', current.error?.status ?? 404, { requestId });
  const { data, error } = await supabase.from('previdenciario_case_pendencies').insert({
    organization_id: authz.org.orgId,
    case_id: id,
    kind: parsed.data.kind,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    action: parsed.data.action,
    due_at: parsed.data.due_at ?? null,
    source: parsed.data.source,
    metadata: asJsonObject(parsed.data.metadata),
  }).select('*').single();
  if (error || !data) return fail('internal_error', error?.message ?? 'Falha ao criar a pendência.', 500, { requestId });
  const eventError = await insertCaseEvent(supabase, { organizationId: authz.org.orgId, caseId: id, kind: 'pendency_created', actorUserId: authz.user.id, metadata: { pendency_id: data.id, title: data.title } });
  if (eventError) return fail(eventError.code, eventError.message, eventError.status, { requestId });
  emitCaseAudit('previdenciario.case_pendency_updated', authz.user.id, authz.org.orgId, id, requestId, { pendency_id: data.id, operation: 'created' });
  return ok(data, { status: 201, requestId });
}
