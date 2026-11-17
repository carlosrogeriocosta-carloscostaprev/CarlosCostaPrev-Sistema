import { randomUUID } from 'node:crypto';

import { fail, ok } from '@/lib/api/wrappers';
import { requireRole } from '@/lib/auth/require-role';
import {
  PATHOLOGY_KNOWLEDGE_COLUMNS,
  PATHOLOGY_REVIEW_HISTORY_COLUMNS,
  serializePathology,
  serializeReviewHistory,
  type PathologyKnowledgeRow,
  type PathologyReviewHistoryRow,
} from '@/lib/previdenciario/knowledge-api';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ stableKey: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole('viewer', { requestId, resource: 'previdenciario_knowledge' });
  if (!authz.ok) return authz.response;

  const { stableKey } = await context.params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('previdenciario_pathology_knowledge')
    .select(PATHOLOGY_KNOWLEDGE_COLUMNS)
    .eq('stable_key', stableKey)
    .neq('review_status', 'archived')
    .maybeSingle();

  if (error) {
    return fail('internal_error', 'Falha ao carregar a patologia.', 500, { requestId });
  }
  if (!data) {
    return fail('not_found', 'Patologia não encontrada na base de conhecimento.', 404, {
      requestId,
    });
  }

  const { data: historyRows, error: historyError } = await supabase
    .from('previdenciario_pathology_review_history')
    .select(PATHOLOGY_REVIEW_HISTORY_COLUMNS)
    .eq('pathology_knowledge_id', data.id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (historyError) {
    return fail('internal_error', 'Falha ao carregar o histórico editorial.', 500, { requestId });
  }

  return ok(
    {
      item: serializePathology(data as PathologyKnowledgeRow),
      history: (historyRows ?? []).map((row) =>
        serializeReviewHistory(row as PathologyReviewHistoryRow),
      ),
      disclaimer:
        'Esta base não diagnostica, não calcula deficiência, não decide benefício e não substitui avaliação médica ou análise jurídica.',
    },
    { requestId },
  );
}
