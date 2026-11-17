import { randomUUID } from 'node:crypto';
import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { fail, ok } from '@/lib/api/wrappers';
import { requireRole } from '@/lib/auth/require-role';
import {
  IFBRA_ITEM_COLUMNS,
  IFBRA_QUALIFIER_COLUMNS,
  type IfbraItemRow,
  type IfbraQualifierRow,
} from '@/lib/previdenciario/knowledge-api';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  instrumentVersion: z.string().trim().max(100).optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole('viewer', { requestId, resource: 'previdenciario_knowledge' });
  if (!authz.ok) return authz.response;

  const parsed = querySchema.safeParse({
    instrumentVersion: new URL(req.url).searchParams.get('instrumentVersion') ?? undefined,
  });
  if (!parsed.success) {
    return fail('validation_failed', 'Filtro do instrumento IFBrA inválido.', 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const supabase = await createClient();
  let itemsQuery = supabase
    .from('previdenciario_ifbra_items')
    .select(IFBRA_ITEM_COLUMNS)
    .neq('review_status', 'archived')
    .order('domain_key', { ascending: true })
    .order('code', { ascending: true })
    .limit(200);
  let qualifiersQuery = supabase
    .from('previdenciario_ifbra_qualifiers')
    .select(IFBRA_QUALIFIER_COLUMNS)
    .neq('review_status', 'archived')
    .order('value', { ascending: true })
    .limit(10);

  if (parsed.data.instrumentVersion) {
    itemsQuery = itemsQuery.eq('instrument_version', parsed.data.instrumentVersion);
    qualifiersQuery = qualifiersQuery.eq('source_path', 'frontend/src/lib/ifbra-items.ts');
  }

  const [{ data: items, error: itemsError }, { data: qualifiers, error: qualifiersError }] =
    await Promise.all([itemsQuery, qualifiersQuery]);
  if (itemsError || qualifiersError) {
    return fail('internal_error', 'Falha ao carregar o catálogo IFBrA.', 500, { requestId });
  }

  const domains = new Map<string, {
    key: string;
    label: string;
    description: string;
    items: Array<{ code: string; label: string; reviewStatus: string }>;
  }>();
  for (const item of (items ?? []) as IfbraItemRow[]) {
    const existing = domains.get(item.domain_key);
    if (existing) {
      existing.items.push({ code: item.code, label: item.label, reviewStatus: item.review_status });
      continue;
    }
    domains.set(item.domain_key, {
      key: item.domain_key,
      label: item.domain_label,
      description: item.domain_description,
      items: [{ code: item.code, label: item.label, reviewStatus: item.review_status }],
    });
  }

  return ok(
    {
      instrumentVersion: parsed.data.instrumentVersion ?? (items?.[0] as IfbraItemRow | undefined)?.instrument_version ?? null,
      domains: [...domains.values()],
      qualifiers: ((qualifiers ?? []) as IfbraQualifierRow[]).map((qualifier) => ({
        value: qualifier.value,
        label: qualifier.label,
        range: qualifier.range_label,
        reviewStatus: qualifier.review_status,
      })),
      disclaimer:
        'Catálogo de referência do instrumento; não calcula grau de deficiência nem substitui avaliação biopsicossocial.',
    },
    { requestId, meta: { total: items?.length ?? 0, has_more: false } },
  );
}
