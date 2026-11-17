import { randomUUID } from 'node:crypto';

import { type NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api/wrappers';
import { requireRole } from '@/lib/auth/require-role';
import { createClient } from '@/lib/supabase/server';
import { updatePrevidenciarioDocumentSchema } from '@/lib/previdenciario/case-workflow';
import { emitCaseAudit, getCaseRow, insertCaseEvent } from '@/lib/previdenciario/case-api';

type RouteContext = { params: Promise<{ id: string; documentId: string }> };
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole('agent', { requestId, resource: 'previdenciario_case_document' });
  if (!authz.ok) return authz.response;
  const { id, documentId } = await ctx.params;
  let body: unknown;
  try { body = await req.json(); } catch { return fail('body_malformed', 'JSON inválido.', 400, { requestId }); }
  const parsed = updatePrevidenciarioDocumentSchema.safeParse(body);
  if (!parsed.success) return fail('validation_failed', 'Estado de revisão inválido.', 422, { requestId, details: parsed.error.flatten() });
  const supabase = await createClient();
  const current = await getCaseRow(supabase, authz.org.orgId, id);
  if (current.error || !current.row) return fail(current.error?.code ?? 'not_found', current.error?.message ?? 'Caso não encontrado.', current.error?.status ?? 404, { requestId });
  const { data, error } = await supabase.from('previdenciario_case_documents').update({ review_status: parsed.data.review_status, reviewed_at: new Date().toISOString(), reviewed_by_user_id: authz.user.id }).eq('organization_id', authz.org.orgId).eq('case_id', id).eq('id', documentId).select('*').maybeSingle();
  if (error) return fail('internal_error', error.message, 500, { requestId });
  if (!data) return fail('not_found', 'Documento não encontrado.', 404, { requestId });
  const eventError = await insertCaseEvent(supabase, { organizationId: authz.org.orgId, caseId: id, kind: 'document_reviewed', actorUserId: authz.user.id, body: parsed.data.note ?? null, metadata: { document_id: documentId, review_status: parsed.data.review_status } });
  if (eventError) return fail(eventError.code, eventError.message, eventError.status, { requestId });
  emitCaseAudit('previdenciario.case_document_updated', authz.user.id, authz.org.orgId, id, requestId, { document_id: documentId, operation: 'reviewed', review_status: parsed.data.review_status });
  return ok(data, { requestId });
}
