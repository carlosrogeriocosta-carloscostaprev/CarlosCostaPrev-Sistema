import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import {
  effectiveCatalogItem,
  PREVIDENCIARIO_CATALOG_ITEM_COLUMNS,
  PREVIDENCIARIO_CATALOG_OVERRIDE_COLUMNS,
  type CatalogItemRow,
  type CatalogOverrideRow,
} from '@/lib/previdenciario/catalog-api';
import { fail, ok } from '@/lib/api/wrappers';
import { requireRole } from '@/lib/auth/require-role';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ key: string }> };

const stableKeySchema = z.string().regex(/^[a-z][a-z0-9_]{2,119}$/, 'stable_key inválida.');

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole('viewer', { requestId, resource: 'previdenciario_catalog' });
  if (!authz.ok) return authz.response;

  const parsedKey = stableKeySchema.safeParse((await context.params).key);
  if (!parsedKey.success) {
    return fail('validation_failed', 'stable_key inválida.', 422, {
      requestId,
      details: parsedKey.error.flatten(),
    });
  }

  const supabase = await createClient();
  const { data: item, error: itemError } = await supabase
    .from('previdenciario_catalog_items')
    .select(PREVIDENCIARIO_CATALOG_ITEM_COLUMNS)
    .eq('stable_key', parsedKey.data)
    .eq('is_active', true)
    .maybeSingle();
  if (itemError) {
    return fail('internal_error', 'Falha ao carregar o item do catálogo.', 500, { requestId });
  }
  if (!item) {
    return fail('not_found', 'Item do catálogo previdenciário não encontrado.', 404, { requestId });
  }

  const { data: override, error: overrideError } = await supabase
    .from('previdenciario_catalog_overrides')
    .select(PREVIDENCIARIO_CATALOG_OVERRIDE_COLUMNS)
    .eq('organization_id', authz.org.orgId)
    .eq('catalog_item_id', item.id)
    .maybeSingle();
  if (overrideError) {
    return fail('internal_error', 'Falha ao carregar a personalização do catálogo.', 500, {
      requestId,
    });
  }

  const effective = effectiveCatalogItem(item as CatalogItemRow, override as CatalogOverrideRow | null);
  if (!effective.is_active) {
    return fail('not_found', 'Item do catálogo indisponível nesta organização.', 404, { requestId });
  }

  return ok(effective, { requestId });
}
