import { randomUUID } from 'node:crypto';
import { type NextRequest } from 'next/server';
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

const catalogListQuerySchema = z.object({
  kind: z.enum(['benefit', 'service']).optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole('viewer', { requestId, resource: 'previdenciario_catalog' });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data: items, error: itemsError } = await supabase
    .from('previdenciario_catalog_items')
    .select(PREVIDENCIARIO_CATALOG_ITEM_COLUMNS)
    .eq('is_active', true)
    .order('kind', { ascending: true })
    .order('display_name', { ascending: true });
  if (itemsError) {
    return fail('internal_error', 'Falha ao carregar o catálogo previdenciário.', 500, {
      requestId,
    });
  }

  const { data: overrides, error: overridesError } = await supabase
    .from('previdenciario_catalog_overrides')
    .select(PREVIDENCIARIO_CATALOG_OVERRIDE_COLUMNS)
    .eq('organization_id', authz.org.orgId)
    .order('updated_at', { ascending: false });
  if (overridesError) {
    return fail('internal_error', 'Falha ao carregar as personalizações do catálogo.', 500, {
      requestId,
    });
  }

  const overridesByItemId = new Map<string, CatalogOverrideRow>();
  for (const override of (overrides ?? []) as CatalogOverrideRow[]) {
    overridesByItemId.set(override.catalog_item_id, override);
  }

  const effectiveItems = ((items ?? []) as CatalogItemRow[])
    .map((item) => effectiveCatalogItem(item, overridesByItemId.get(item.id)))
    .filter((item) => item.is_active);

  const query = catalogListQuerySchema.safeParse({
    kind: new URL(req.url).searchParams.get('kind') ?? undefined,
  });
  if (!query.success) {
    return fail('validation_failed', 'Filtro kind inválido.', 422, {
      requestId,
      details: query.error.flatten(),
    });
  }

  const filteredItems = query.data.kind
    ? effectiveItems.filter((item) => item.kind === query.data.kind)
    : effectiveItems;

  return ok(
    { items: filteredItems },
    { requestId, meta: { total: filteredItems.length, has_more: false } },
  );
}
