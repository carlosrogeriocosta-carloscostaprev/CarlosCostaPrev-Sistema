import { describe, expect, it } from 'vitest';

import {
  buildPrevidenciarioDocumentStoragePath,
  isAllowedPrevidenciarioDocumentMime,
  PREVIDENCIARIO_DOCUMENT_BUCKET,
  PREVIDENCIARIO_DOCUMENT_MAX_BYTES,
  resolvePrevidenciarioDocumentExtension,
  safePrevidenciarioDocumentFileName,
} from './document-storage';

describe('document-storage', () => {
  it('mantém o bucket privado e o limite contratado', () => {
    expect(PREVIDENCIARIO_DOCUMENT_BUCKET).toBe('previdenciario-documents');
    expect(PREVIDENCIARIO_DOCUMENT_MAX_BYTES).toBe(25 * 1024 * 1024);
  });

  it('aceita somente extensões e MIME de documentos previstos', () => {
    expect(resolvePrevidenciarioDocumentExtension('cnis.pdf', 'application/pdf')).toBe('pdf');
    expect(resolvePrevidenciarioDocumentExtension('laudo.jpg', 'image/jpeg')).toBe('jpeg');
    expect(resolvePrevidenciarioDocumentExtension('arquivo.bin', 'application/pdf')).toBe('pdf');
    expect(resolvePrevidenciarioDocumentExtension('arquivo.bin', 'application/msword')).toBeNull();
    expect(isAllowedPrevidenciarioDocumentMime('application/pdf')).toBe(true);
    expect(isAllowedPrevidenciarioDocumentMime('application/msword')).toBe(false);
  });

  it('remove caminho e controles do nome exibido sem permitir nome vazio', () => {
    expect(safePrevidenciarioDocumentFileName('../laudo\u0000-final.pdf')).toBe('laudo-final.pdf');
    expect(safePrevidenciarioDocumentFileName('')).toBe('documento');
  });

  it('gera caminho não enumerável com prefixo da organização e do caso', () => {
    const path = buildPrevidenciarioDocumentStoragePath('org-1', 'case-1', 'pdf');
    expect(path).toMatch(/^org-1\/case-1\/[0-9a-f-]{36}\.pdf$/);
  });
});
