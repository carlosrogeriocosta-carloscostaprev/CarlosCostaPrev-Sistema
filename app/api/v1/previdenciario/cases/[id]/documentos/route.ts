import { createHash, randomUUID } from 'node:crypto';

import { type NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api/wrappers';
import { requireRole } from '@/lib/auth/require-role';
import { requireSupportWrite } from '@/lib/impersonate/support';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { emitCaseAudit, getCaseRow, insertCaseEvent } from '@/lib/previdenciario/case-api';
import {
  asJsonObject,
  PREVIDENCIARIO_CASE_DOCUMENT_COLUMNS,
  type PrevidenciarioCaseDocumentRow,
  uploadPrevidenciarioDocumentSchema,
} from '@/lib/previdenciario/case-workflow';
import {
  buildPrevidenciarioDocumentStoragePath,
  isAllowedPrevidenciarioDocumentMime,
  PREVIDENCIARIO_DOCUMENT_BUCKET,
  PREVIDENCIARIO_DOCUMENT_MAX_BYTES,
  PREVIDENCIARIO_DOCUMENT_MIME_TYPES,
  resolvePrevidenciarioDocumentExtension,
  safePrevidenciarioDocumentFileName,
} from '@/lib/previdenciario/document-storage';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

function parseJsonObject(value: FormDataEntryValue | null): Record<string, unknown> | null {
  if (typeof value !== 'string' || value.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function hasExpectedSignature(bytes: Buffer, extension: keyof typeof PREVIDENCIARIO_DOCUMENT_MIME_TYPES): boolean {
  if (extension === 'pdf') return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  if (extension === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === 'png') return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole('agent', { requestId, resource: 'previdenciario_case_documents' });
  if (!authz.ok) return authz.response;
  const { id: caseId } = await ctx.params;

  const declaredLength = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(declaredLength) && declaredLength > PREVIDENCIARIO_DOCUMENT_MAX_BYTES + 128 * 1024) {
    return fail('payload_too_large', 'O arquivo excede o limite de 25 MB.', 413, { requestId });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return fail('validation_failed', 'Falha ao processar multipart/form-data.', 422, { requestId });
  }

  const fileEntry = formData.get('file');
  if (!(fileEntry instanceof File)) {
    return fail('validation_failed', "O campo 'file' é obrigatório.", 422, { requestId });
  }
  if (fileEntry.size <= 0 || fileEntry.size > PREVIDENCIARIO_DOCUMENT_MAX_BYTES) {
    return fail('payload_too_large', 'O arquivo deve ter até 25 MB e não pode ser vazio.', 413, { requestId });
  }

  const extension = resolvePrevidenciarioDocumentExtension(fileEntry.name, fileEntry.type);
  const expectedMime = extension ? PREVIDENCIARIO_DOCUMENT_MIME_TYPES[extension] : null;
  const mimeType = fileEntry.type || expectedMime || '';
  if (!extension || !expectedMime || !isAllowedPrevidenciarioDocumentMime(mimeType) || (fileEntry.type && fileEntry.type !== expectedMime)) {
    return fail('unsupported_media_type', 'Tipo de arquivo não suportado. Envie PDF, JPEG, PNG ou WebP.', 415, { requestId });
  }

  const metadata = parseJsonObject(formData.get('metadata'));
  if (!metadata) {
    return fail('validation_failed', 'O campo metadata deve ser um objeto JSON.', 422, { requestId });
  }
  const parsed = uploadPrevidenciarioDocumentSchema.safeParse({
    kind: formData.get('kind'),
    source: formData.get('source') ?? undefined,
    metadata,
  });
  if (!parsed.success) {
    return fail('validation_failed', 'Dados do documento inválidos.', 422, { requestId, details: parsed.error.flatten() });
  }

  const fileName = safePrevidenciarioDocumentFileName(fileEntry.name);
  const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());
  if (!hasExpectedSignature(fileBuffer, extension)) {
    return fail('unsupported_media_type', 'O conteúdo do arquivo não corresponde ao tipo declarado.', 415, { requestId });
  }

  const supabase = await createClient();
  const current = await getCaseRow(supabase, authz.org.orgId, caseId);
  if (current.error || !current.row) {
    return fail(current.error?.code ?? 'not_found', current.error?.message ?? 'Caso não encontrado.', current.error?.status ?? 404, { requestId });
  }

  const storagePath = buildPrevidenciarioDocumentStoragePath(authz.org.orgId, caseId, extension);
  const sha256 = createHash('sha256').update(fileBuffer).digest('hex');
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage.from(PREVIDENCIARIO_DOCUMENT_BUCKET).upload(storagePath, fileBuffer, {
    contentType: expectedMime,
    upsert: false,
  });
  if (uploadError) {
    return fail('internal_error', 'Falha ao armazenar o documento.', 500, { requestId });
  }

  const { data, error } = await supabase
    .from('previdenciario_case_documents')
    .insert({
      organization_id: authz.org.orgId,
      case_id: caseId,
      contact_id: current.row.contact_id,
      kind: parsed.data.kind,
      file_name: fileName,
      storage_bucket: PREVIDENCIARIO_DOCUMENT_BUCKET,
      storage_path: storagePath,
      sha256,
      version: 1,
      source: parsed.data.source,
      review_status: 'needs_review',
      metadata: asJsonObject({
        ...parsed.data.metadata,
        mime_type: expectedMime,
        size_bytes: fileBuffer.byteLength,
      }),
    })
    .select(PREVIDENCIARIO_CASE_DOCUMENT_COLUMNS)
    .single();

  if (error) {
    await admin.storage.from(PREVIDENCIARIO_DOCUMENT_BUCKET).remove([storagePath]);
    if (error.code === '23505') {
      return fail('conflict', 'Este documento já está registrado para esta versão do caso.', 409, { requestId });
    }
    return fail('internal_error', 'Falha ao registrar os metadados do documento.', 500, { requestId });
  }
  const createdDocument = data as unknown as PrevidenciarioCaseDocumentRow;

  const eventError = await insertCaseEvent(supabase, {
    organizationId: authz.org.orgId,
    caseId,
    actorUserId: authz.user.id,
    kind: 'document_attached',
    metadata: {
      document_id: createdDocument.id,
      kind: createdDocument.kind,
      review_status: createdDocument.review_status,
      size_bytes: fileBuffer.byteLength,
      mime_type: expectedMime,
    },
  });
  if (eventError) return fail(eventError.code, eventError.message, eventError.status, { requestId });
  emitCaseAudit('previdenciario.case_document_updated', authz.user.id, authz.org.orgId, caseId, requestId, {
    document_id: createdDocument.id,
    operation: 'uploaded',
    size_bytes: fileBuffer.byteLength,
    mime_type: expectedMime,
  });

  return ok(data, { status: 201, requestId });
}
