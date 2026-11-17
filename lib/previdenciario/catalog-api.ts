import type { Database, Json } from '@/lib/database.types';
import { primeiroPreenchido } from '@/lib/previdenciario/primeiro-preenchido';

export type CatalogItemRow = Database['public']['Tables']['previdenciario_catalog_items']['Row'];
export type CatalogOverrideRow = Database['public']['Tables']['previdenciario_catalog_overrides']['Row'];

export const PREVIDENCIARIO_CATALOG_ITEM_COLUMNS =
  'id, stable_key, kind, display_name, official_codes, source_kind, source_ref, source_version, review_status, metadata, is_active, created_at, updated_at';

export const PREVIDENCIARIO_CATALOG_OVERRIDE_COLUMNS =
  'id, organization_id, catalog_item_id, display_name, metadata, is_active, created_at, updated_at';

export type EffectiveCatalogItem = {
  stable_key: string;
  kind: string;
  display_name: string;
  official_codes: string[];
  source_kind: string;
  source_ref: string | null;
  source_version: string | null;
  review_status: string;
  metadata: Json;
  is_active: boolean;
};

function jsonObject(value: Json): Record<string, Json | undefined> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, Json | undefined>;
  }
  return {};
}

export function effectiveCatalogItem(
  item: CatalogItemRow,
  override?: CatalogOverrideRow | null,
): EffectiveCatalogItem {
  const baseMetadata = jsonObject(item.metadata);
  const overrideMetadata = override ? jsonObject(override.metadata) : {};

  return {
    stable_key: item.stable_key,
    kind: item.kind,
    display_name: primeiroPreenchido(override?.display_name, item.display_name),
    official_codes: item.official_codes,
    source_kind: item.source_kind,
    source_ref: item.source_ref,
    source_version: item.source_version,
    review_status: item.review_status,
    metadata: { ...baseMetadata, ...overrideMetadata },
    is_active: item.is_active && (override?.is_active ?? true),
  };
}
