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
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth/require-role';
import { requireSupportWrite } from '@/lib/impersonate/support';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

const overridePatchSchema = z
  .strictObject({
    stable_key: z.string().regex(/^[a-z][a-z0-9_]{2,119}$/),
    display_name: z.string().trim().min(1).max(200).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (value) => value.display_name !== undefined || value.metadata !== undefined || value.is_active !== undefined,
    { message: 'Informe ao menos um campo de override.', path: ['stable_key'] },
  );

export async function PATCH(request: Request): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole('manager', { requestId, resource: 'previdenciario_catalog_override' });
  if (!authz.ok) return authz.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('invalid_request', 'Body JSON inválido.', 400, { requestId });
  }

  const parsed = overridePatchSchema.safeParse(body);
  if (!parsed.success) {
    return fail('validation_failed', 'Override inválido.', 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const supabase = await createClient();
  const { stable_key, display_name, metadata, is_active } = parsed.data;
  const { data: item, error: itemError } = await supabase
    .from('previdenciario_catalog_items')
    .select(PREVIDENCIARIO_CATALOG_ITEM_COLUMNS)
    .eq('stable_key', stable_key)
    .eq('is_active', true)
    .maybeSingle();
  if (itemError) {
    return fail('internal_error', 'Falha ao localizar o item do catálogo.', 500, { requestId });
  }
  if (!item) {
    return fail('not_found', 'Item do catálogo previdenciário não encontrado.', 404, { requestId });
  }

  const { data: current, error: currentError } = await supabase
    .from('previdenciario_catalog_overrides')
    .select(PREVIDENCIARIO_CATALOG_OVERRIDE_COLUMNS)
    .eq('organization_id', authz.org.orgId)
    .eq('catalog_item_id', item.id)
    .maybeSingle();
  if (currentError) {
    return fail('internal_error', 'Falha ao carregar o override atual.', 500, { requestId });
  }

  const nextOverride = {
    organization_id: authz.org.orgId,
    catalog_item_id: item.id,
    display_name: display_name !== undefined ? display_name : current ? current.display_name : null,
    metadata: (metadata !== undefined ? metadata : current?.metadata ?? {}) as Json,
    is_active: is_active !== undefined ? is_active : current?.is_active ?? true,
  };

  const { data: saved, error: saveError } = await supabase
    .from('previdenciario_catalog_overrides')
    .upsert(nextOverride, { onConflict: 'organization_id,catalog_item_id' })
    .select(PREVIDENCIARIO_CATALOG_OVERRIDE_COLUMNS)
    .single();
  if (saveError || !saved) {
    return fail('internal_error', 'Falha ao salvar o override do catálogo.', 500, { requestId });
  }

  const changedFields = Object.keys(parsed.data).filter((field) => field !== 'stable_key');
  void audit({
    action: 'previdenciario.catalog_override_updated',
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: 'previdenciario_catalog_override',
    resourceId: saved.id,
    requestId,
    metadata: { stable_key, changed_fields: changedFields },
  });

  return ok(
    effectiveCatalogItem(item as CatalogItemRow, saved as CatalogOverrideRow),
    { requestId },
  );
}
