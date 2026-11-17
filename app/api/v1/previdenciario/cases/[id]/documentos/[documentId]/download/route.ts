import { randomUUID } from 'node:crypto';

import { type NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api/wrappers';
import { requireRole } from '@/lib/auth/require-role';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCaseRow } from '@/lib/previdenciario/case-api';
import {
  PREVIDENCIARIO_CASE_DOCUMENT_COLUMNS,
  type PrevidenciarioCaseDocumentRow,
} from '@/lib/previdenciario/case-workflow';
import {
  PREVIDENCIARIO_DOCUMENT_BUCKET,
  PREVIDENCIARIO_DOCUMENT_SIGNED_URL_TTL_SECONDS,
} from '@/lib/previdenciario/document-storage';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string; documentId: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole('viewer', { requestId, resource: 'previdenciario_case_documents' });
  if (!authz.ok) return authz.response;
  const { id: caseId, documentId } = await ctx.params;

  const supabase = await createClient();
  const current = await getCaseRow(supabase, authz.org.orgId, caseId);
  if (current.error || !current.row) {
    return fail(current.error?.code ?? 'not_found', current.error?.message ?? 'Caso não encontrado.', current.error?.status ?? 404, { requestId });
  }

  const { data, error } = await supabase
    .from('previdenciario_case_documents')
    .select(PREVIDENCIARIO_CASE_DOCUMENT_COLUMNS)
    .eq('id', documentId)
    .eq('organization_id', authz.org.orgId)
    .eq('case_id', caseId)
    .maybeSingle();
  if (error) return fail('internal_error', 'Falha ao localizar o documento.', 500, { requestId });
  if (!data) return fail('not_found', 'Documento não encontrado.', 404, { requestId });

  const document = data as unknown as PrevidenciarioCaseDocumentRow;
  if (document.storage_bucket !== PREVIDENCIARIO_DOCUMENT_BUCKET || !document.storage_path.startsWith(`${authz.org.orgId}/${caseId}/`)) {
    return fail('forbidden', 'Documento fora do escopo do caso.', 403, { requestId });
  }

  const { data: signed, error: signedError } = await createAdminClient()
    .storage
    .from(PREVIDENCIARIO_DOCUMENT_BUCKET)
    .createSignedUrl(document.storage_path, PREVIDENCIARIO_DOCUMENT_SIGNED_URL_TTL_SECONDS);
  if (signedError || !signed?.signedUrl) return fail('not_found', 'Arquivo não disponível no Storage.', 404, { requestId });

  return ok({
    document_id: document.id,
    file_name: document.file_name,
    url: signed.signedUrl,
    expires_at: new Date(Date.now() + PREVIDENCIARIO_DOCUMENT_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  }, { requestId });
}
