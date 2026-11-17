import { describe, expect, it } from 'vitest';

import {
  effectiveCatalogItem,
  type CatalogItemRow,
  type CatalogOverrideRow,
} from '@/lib/previdenciario/catalog-api';

const baseItem: CatalogItemRow = {
  id: '00000000-0000-0000-0000-000000000001',
  stable_key: 'incapacidade_temporaria',
  kind: 'benefit',
  display_name: 'Auxílio por Incapacidade Temporária',
  official_codes: [],
  source_kind: 'internal',
  source_ref: null,
  source_version: null,
  review_status: 'needs_review',
  metadata: { requires_medical_evaluation: true },
  is_active: true,
  created_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
};

const override: CatalogOverrideRow = {
  id: '00000000-0000-0000-0000-000000000002',
  organization_id: '00000000-0000-0000-0000-000000000003',
  catalog_item_id: baseItem.id,
  display_name: 'Benefício temporário — revisão interna',
  metadata: { internal_label: 'incapacidade_curta' },
  is_active: true,
  created_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
};

describe('effectiveCatalogItem', () => {
  it('aplica nome e metadados do override sem alterar stable_key ou códigos oficiais', () => {
    expect(effectiveCatalogItem(baseItem, override)).toEqual({
      stable_key: 'incapacidade_temporaria',
      kind: 'benefit',
      display_name: 'Benefício temporário — revisão interna',
      official_codes: [],
      source_kind: 'internal',
      source_ref: null,
      source_version: null,
      review_status: 'needs_review',
      metadata: {
        requires_medical_evaluation: true,
        internal_label: 'incapacidade_curta',
      },
      is_active: true,
    });
  });

  it('mantém o nome base quando o override usa null para restaurar o padrão', () => {
    expect(effectiveCatalogItem(baseItem, { ...override, display_name: null }).display_name).toBe(
      baseItem.display_name,
    );
  });

  it('desativa o item somente na organização do override', () => {
    expect(effectiveCatalogItem(baseItem, { ...override, is_active: false }).is_active).toBe(false);
    expect(effectiveCatalogItem(baseItem, null).is_active).toBe(true);
  });
});
