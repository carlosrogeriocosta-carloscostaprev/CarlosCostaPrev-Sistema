import { randomUUID } from 'node:crypto';

export const PREVIDENCIARIO_DOCUMENT_BUCKET = 'previdenciario-documents' as const;
export const PREVIDENCIARIO_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
export const PREVIDENCIARIO_DOCUMENT_SIGNED_URL_TTL_SECONDS = 10 * 60;

export const PREVIDENCIARIO_DOCUMENT_MIME_TYPES = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;

export type PrevidenciarioDocumentExtension = keyof typeof PREVIDENCIARIO_DOCUMENT_MIME_TYPES;

export function resolvePrevidenciarioDocumentExtension(fileName: string, mimeType: string): PrevidenciarioDocumentExtension | null {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'pdf' || extension === 'jpeg' || extension === 'jpg' || extension === 'png' || extension === 'webp') {
    return extension === 'jpg' ? 'jpeg' : extension;
  }
  if (mimeType === PREVIDENCIARIO_DOCUMENT_MIME_TYPES.pdf) return 'pdf';
  if (mimeType === PREVIDENCIARIO_DOCUMENT_MIME_TYPES.jpeg) return 'jpeg';
  if (mimeType === PREVIDENCIARIO_DOCUMENT_MIME_TYPES.png) return 'png';
  if (mimeType === PREVIDENCIARIO_DOCUMENT_MIME_TYPES.webp) return 'webp';
  return null;
}

export function isAllowedPrevidenciarioDocumentMime(mimeType: string): boolean {
  return Object.values(PREVIDENCIARIO_DOCUMENT_MIME_TYPES).includes(mimeType as (typeof PREVIDENCIARIO_DOCUMENT_MIME_TYPES)[PrevidenciarioDocumentExtension]);
}

export function safePrevidenciarioDocumentFileName(fileName: string): string {
  const withoutPath = fileName.replaceAll('\\', '/').split('/').pop() ?? 'documento';
  const normalized = withoutPath.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return normalized.slice(0, 255) || 'documento';
}

export function buildPrevidenciarioDocumentStoragePath(organizationId: string, caseId: string, extension: PrevidenciarioDocumentExtension): string {
  return `${organizationId}/${caseId}/${randomUUID()}.${extension}`;
}
