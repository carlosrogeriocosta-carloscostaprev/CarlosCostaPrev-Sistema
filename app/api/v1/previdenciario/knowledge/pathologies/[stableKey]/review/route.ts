import { randomUUID } from 'node:crypto';

import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { fail, ok } from '@/lib/api/wrappers';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth/require-role';
import { falhaDaEscritaDePlatformAdmin, requirePlatformAdminEscrita } from '@/lib/auth/requirePlatformAdmin';
import { requireSupportWrite } from '@/lib/impersonate/support';
import {
  PATHOLOGY_KNOWLEDGE_COLUMNS,
  PATHOLOGY_REVIEW_HISTORY_COLUMNS,
  serializePathology,
  serializeReviewHistory,
  type PathologyKnowledgeRow,
  type PathologyReviewHistoryRow,
} from '@/lib/previdenciario/knowledge-api';
import { pathologyReviewUpdateSchema } from '@/lib/previdenciario/knowledge-schema';
import { parseBenefitHypotheses } from '@/lib/previdenciario/knowledge-api';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const rpcResultSchema = z.object({
  pathology_id: z.string().uuid(),
  history_id: z.string().uuid(),
  stable_key: z.string(),
  previous_status: z.string(),
  next_status: z.string(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ stableKey: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole('admin', {
    requestId,
    resource: 'previdenciario_pathology_knowledge',
    allowPlatformAdmin: true,
  });
  if (!authz.ok) return authz.response;
  if (!authz.user.is_platform_admin) {
    return fail(
      'forbidden_role',
      'A revisão global da base requer administrador de plataforma.',
      403,
      { requestId },
    );
  }
  try {
    await requirePlatformAdminEscrita();
  } catch (err) {
    return falhaDaEscritaDePlatformAdmin(err, requestId);
  }

  const parsed = pathologyReviewUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail('validation_failed', 'Dados de revisão inválidos.', 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const { stableKey } = await context.params;
  const supabase = await createClient();
  const { data: previous, error: previousError } = await supabase
    .from('previdenciario_pathology_knowledge')
    .select('id,review_status,clinical_content,benefit_hypotheses,review_note')
    .eq('stable_key', stableKey)
    .limit(1)
    .maybeSingle();
  if (previousError) {
    return fail('internal_error', 'Falha ao carregar a revisão atual.', 500, { requestId });
  }
  if (!previous) {
    return fail('not_found', 'Patologia não encontrada na base de conhecimento.', 404, {
      requestId,
    });
  }

  const hasEditorialSummary = Object.prototype.hasOwnProperty.call(parsed.data, 'editorialSummary');
  const hasBenefitHypotheses = Object.prototype.hasOwnProperty.call(parsed.data, 'benefitHypotheses');
  const hasReviewNote = Object.prototype.hasOwnProperty.call(parsed.data, 'reviewNote');
  const currentClinicalContent = previous.clinical_content;
  const currentSummary =
    typeof currentClinicalContent === 'object' &&
    currentClinicalContent !== null &&
    !Array.isArray(currentClinicalContent) &&
    typeof currentClinicalContent.educationalSummary === 'string'
      ? currentClinicalContent.educationalSummary
      : null;
  const editorialSummary = hasEditorialSummary
    ? parsed.data.editorialSummary ?? null
    : currentSummary;
  const benefitHypotheses = hasBenefitHypotheses
    ? parsed.data.benefitHypotheses ?? []
    : parseBenefitHypotheses(previous.benefit_hypotheses);
  const reviewNote = hasReviewNote ? parsed.data.reviewNote ?? null : previous.review_note;

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'fn_previdenciario_review_pathology',
    {
      p_stable_key: stableKey,
      p_next_status: parsed.data.reviewStatus,
      p_editorial_summary: editorialSummary,
      p_benefit_hypotheses: benefitHypotheses,
      p_review_note: reviewNote,
      p_request_id: requestId,
    } as never,
  );
  if (rpcError) {
    const status = rpcError.message.includes('pathology_not_found') ? 404 : 500;
    return fail(
      status === 404 ? 'not_found' : 'internal_error',
      status === 404 ? 'Patologia não encontrada na base de conhecimento.' : 'Falha ao salvar a revisão da patologia.',
      status,
      { requestId },
    );
  }
  const rpcResult = rpcResultSchema.safeParse(rpcData);
  if (!rpcResult.success) {
    return fail('internal_error', 'Resposta inválida da revisão editorial.', 500, { requestId });
  }

  const { data, error } = await supabase
    .from('previdenciario_pathology_knowledge')
    .select(PATHOLOGY_KNOWLEDGE_COLUMNS)
    .eq('id', rpcResult.data.pathology_id)
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    return fail('internal_error', 'Falha ao carregar a patologia revisada.', 500, { requestId });
  }

  const { data: history, error: historyError } = await supabase
    .from('previdenciario_pathology_review_history')
    .select(PATHOLOGY_REVIEW_HISTORY_COLUMNS)
    .eq('id', rpcResult.data.history_id)
    .limit(1)
    .maybeSingle();
  if (historyError || !history) {
    return fail('internal_error', 'A revisão foi salva, mas o histórico não pôde ser carregado.', 500, {
      requestId,
    });
  }

  void audit({
    action: hasEditorialSummary || hasBenefitHypotheses
      ? 'previdenciario.knowledge_editorial_updated'
      : 'previdenciario.knowledge_reviewed',
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: 'previdenciario_pathology_knowledge',
    resourceId: data.id,
    requestId,
    metadata: {
      stable_key: stableKey,
      previous_status: rpcResult.data.previous_status,
      review_status: rpcResult.data.next_status,
      editorial_summary_changed: hasEditorialSummary,
      benefit_hypotheses_changed: hasBenefitHypotheses,
    },
  });

  return ok(
    {
      item: serializePathology(data as PathologyKnowledgeRow),
      history: serializeReviewHistory(history as PathologyReviewHistoryRow),
    },
    { requestId },
  );
}
