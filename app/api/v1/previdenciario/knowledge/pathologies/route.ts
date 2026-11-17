import { randomUUID } from 'node:crypto';
import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { fail, ok } from '@/lib/api/wrappers';
import { requireRole } from '@/lib/auth/require-role';
import {
  matchesPathologySearch,
  PATHOLOGY_KNOWLEDGE_COLUMNS,
  serializePathology,
  type KnowledgeReviewStatus,
  type PathologyKnowledgeRow,
} from '@/lib/previdenciario/knowledge-api';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(80).optional(),
  reviewStatus: z.enum(['draft', 'needs_review', 'approved', 'rejected', 'archived']).optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole('viewer', { requestId, resource: 'previdenciario_knowledge' });
  if (!authz.ok) return authz.response;

  const parsed = querySchema.safeParse({
    search: new URL(req.url).searchParams.get('search') ?? undefined,
    category: new URL(req.url).searchParams.get('category') ?? undefined,
    reviewStatus: new URL(req.url).searchParams.get('reviewStatus') ?? undefined,
  });
  if (!parsed.success) {
    return fail('validation_failed', 'Filtros da base de patologias inválidos.', 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const supabase = await createClient();
  let query = supabase
    .from('previdenciario_pathology_knowledge')
    .select(PATHOLOGY_KNOWLEDGE_COLUMNS)
    .order('category', { ascending: true })
    .order('display_name', { ascending: true })
    .limit(100);

  if (parsed.data.category) query = query.eq('category', parsed.data.category.toLocaleLowerCase('pt-BR'));
  if (parsed.data.reviewStatus) query = query.eq('review_status', parsed.data.reviewStatus);
  else query = query.neq('review_status', 'archived');

  const { data, error } = await query;
  if (error) {
    return fail('internal_error', 'Falha ao carregar a base de patologias.', 500, {
      requestId,
    });
  }

  const rows = (data ?? []) as PathologyKnowledgeRow[];
  const filtered = parsed.data.search
    ? rows.filter((row) => matchesPathologySearch(row, parsed.data.search ?? ''))
    : rows;
  return ok(
    { items: filtered.map(serializePathology) },
    {
      requestId,
      meta: {
        total: filtered.length,
        has_more: false,
        review_status: (parsed.data.reviewStatus ?? 'non_archived') as KnowledgeReviewStatus | 'non_archived',
      },
    },
  );
}
