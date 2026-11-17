import { randomUUID } from 'node:crypto';
import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { fail, ok } from '@/lib/api/wrappers';
import { requireRole } from '@/lib/auth/require-role';
import {
  LEGAL_CROSSWALK_COLUMNS,
  LEGAL_SOURCE_COLUMNS,
  type LegalCrosswalkRow,
  type LegalSourceRow,
} from '@/lib/previdenciario/knowledge-api';
import { PREVIDENCIARIO_BENEFIT_KEYS } from '@/lib/previdenciario/catalog';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  benefitKey: z.enum(PREVIDENCIARIO_BENEFIT_KEYS).optional(),
  reviewStatus: z.enum(['draft', 'needs_review', 'approved', 'rejected', 'archived']).optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole('viewer', { requestId, resource: 'previdenciario_knowledge' });
  if (!authz.ok) return authz.response;

  const parsed = querySchema.safeParse({
    benefitKey: new URL(req.url).searchParams.get('benefitKey') ?? undefined,
    reviewStatus: new URL(req.url).searchParams.get('reviewStatus') ?? undefined,
  });
  if (!parsed.success) {
    return fail('validation_failed', 'Filtros legislativos inválidos.', 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const supabase = await createClient();
  let benefitId: string | null = null;
  if (parsed.data.benefitKey) {
    const { data: benefit, error: benefitError } = await supabase
      .from('previdenciario_catalog_items')
      .select('id')
      .eq('stable_key', parsed.data.benefitKey)
      .eq('kind', 'benefit')
      .limit(1)
      .maybeSingle();
    if (benefitError) {
      return fail('internal_error', 'Falha ao resolver o benefício legislativo.', 500, { requestId });
    }
    if (!benefit) {
      return fail('not_found', 'Benefício não encontrado no catálogo previdenciário.', 404, {
        requestId,
      });
    }
    benefitId = benefit.id;
  }

  let crosswalkQuery = supabase
    .from('previdenciario_legal_crosswalk')
    .select(LEGAL_CROSSWALK_COLUMNS)
    .order('benefit_catalog_item_id', { ascending: true })
    .order('provision_ref', { ascending: true })
    .limit(100);
  if (benefitId) crosswalkQuery = crosswalkQuery.eq('benefit_catalog_item_id', benefitId);
  if (parsed.data.reviewStatus) crosswalkQuery = crosswalkQuery.eq('review_status', parsed.data.reviewStatus);
  else crosswalkQuery = crosswalkQuery.neq('review_status', 'archived');

  const { data: crosswalk, error: crosswalkError } = await crosswalkQuery;
  if (crosswalkError) {
    return fail('internal_error', 'Falha ao carregar a matriz legislativa.', 500, { requestId });
  }

  const crosswalkRows = (crosswalk ?? []) as LegalCrosswalkRow[];
  const sourceIds = [...new Set(crosswalkRows.map((row) => row.legal_source_id))];
  const { data: sources, error: sourcesError } = sourceIds.length
    ? await supabase
        .from('previdenciario_legal_sources')
        .select(LEGAL_SOURCE_COLUMNS)
        .in('id', sourceIds)
        .limit(20)
    : { data: [], error: null };
  if (sourcesError) {
    return fail('internal_error', 'Falha ao carregar as fontes legislativas.', 500, { requestId });
  }

  const sourceById = new Map(
    ((sources ?? []) as LegalSourceRow[]).map((source) => [source.id, source]),
  );
  return ok(
    {
      items: crosswalkRows.map((row) => ({
        id: row.id,
        benefitCatalogItemId: row.benefit_catalog_item_id,
        legalSourceId: row.legal_source_id,
        provisionRef: row.provision_ref,
        relationType: row.relation_type,
        summary: row.summary,
        caseDateRule: row.case_date_rule,
        reviewStatus: row.review_status,
        confidence: row.confidence,
        review: {
          reviewerUserId: row.reviewer_user_id,
          reviewedAt: row.reviewed_at,
          note: row.review_note,
        },
        source: sourceById.get(row.legal_source_id)
          ? {
              key: sourceById.get(row.legal_source_id)?.source_key,
              title: sourceById.get(row.legal_source_id)?.title,
              type: sourceById.get(row.legal_source_id)?.source_type,
              officialUrl: sourceById.get(row.legal_source_id)?.official_url,
              accessedAt: sourceById.get(row.legal_source_id)?.accessed_at,
              version: sourceById.get(row.legal_source_id)?.source_version,
              reviewStatus: sourceById.get(row.legal_source_id)?.review_status,
            }
          : null,
      })),
      disclaimer:
        'Matriz preliminar de fontes oficiais. A relação não representa decisão de concessão e requer revisão pela data e pelas circunstâncias do caso.',
    },
    { requestId, meta: { total: crosswalkRows.length, has_more: false } },
  );
}
