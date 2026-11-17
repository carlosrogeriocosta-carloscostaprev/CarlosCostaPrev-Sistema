import { randomUUID } from 'node:crypto';

import { type NextRequest } from 'next/server';
import { z } from 'zod';

import { fail, ok } from '@/lib/api/wrappers';
import { audit } from '@/lib/audit';
import { requireRole } from '@/lib/auth/require-role';
import { falhaDaEscritaDePlatformAdmin, requirePlatformAdminEscrita } from '@/lib/auth/requirePlatformAdmin';
import { requireSupportWrite } from '@/lib/impersonate/support';
import { pathologyBulkReviewSchema } from '@/lib/previdenciario/knowledge-schema';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const rpcResultSchema = z.object({
  updated_count: z.number().int().min(1).max(100),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      stable_key: z.string(),
      previous_status: z.string(),
      next_status: z.string(),
      editorial_summary: z.string().nullable(),
      benefit_hypotheses: z.unknown(),
    }),
  ),
});

export async function PATCH(request: NextRequest): Promise<Response> {
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

  const parsed = pathologyBulkReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail('validation_failed', 'Dados da revisão em lote inválidos.', 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    'fn_previdenciario_review_pathologies',
    {
      p_stable_keys: parsed.data.stableKeys,
      p_next_status: parsed.data.reviewStatus,
      p_editorial_summary: parsed.data.editorialSummary ?? null,
      p_review_note: parsed.data.reviewNote ?? null,
      p_request_id: requestId,
    } as never,
  );
  if (error) {
    const isNotFound = error.message.includes('pathology_not_found');
    const isDuplicate = error.message.includes('duplicate_stable_keys');
    return fail(
      isNotFound ? 'not_found' : isDuplicate ? 'validation_failed' : 'internal_error',
      isNotFound
        ? 'Uma ou mais patologias não foram encontradas.'
        : isDuplicate
          ? 'A lista contém chaves repetidas.'
          : 'Falha ao executar a revisão em lote.',
      isNotFound || isDuplicate ? 422 : 500,
      { requestId },
    );
  }

  const parsedResult = rpcResultSchema.safeParse(data);
  if (!parsedResult.success) {
    return fail('internal_error', 'Resposta inválida da revisão em lote.', 500, { requestId });
  }

  void audit({
    action: 'previdenciario.knowledge_batch_reviewed',
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: 'previdenciario_pathology_knowledge',
    requestId,
    metadata: {
      stable_keys: parsed.data.stableKeys,
      updated_count: parsedResult.data.updated_count,
      review_status: parsed.data.reviewStatus,
      editorial_summary_changed: parsed.data.editorialSummary !== undefined,
      review_note_changed: parsed.data.reviewNote !== undefined,
    },
  });

  return ok(
    {
      updatedCount: parsedResult.data.updated_count,
      items: parsedResult.data.items,
    },
    { requestId },
  );
}
