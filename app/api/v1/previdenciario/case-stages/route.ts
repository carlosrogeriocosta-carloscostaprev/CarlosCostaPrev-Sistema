import { randomUUID } from 'node:crypto';

import { type NextRequest } from 'next/server';

import { fail, ok } from '@/lib/api/wrappers';
import { requireRole } from '@/lib/auth/require-role';
import { createClient } from '@/lib/supabase/server';
import { PREVIDENCIARIO_CASE_STAGE_COLUMNS } from '@/lib/previdenciario/case-workflow';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole('viewer', { requestId, resource: 'previdenciario_case_stages' });
  if (!authz.ok) return authz.response;
  const supabase = await createClient();
  const { data, error } = await supabase.from('previdenciario_case_stages').select(PREVIDENCIARIO_CASE_STAGE_COLUMNS).eq('organization_id', authz.org.orgId).eq('is_active', true).order('position', { ascending: true });
  if (error) return fail('internal_error', 'Falha ao carregar as etapas previdenciárias.', 500, { requestId });
  return ok(data ?? [], { requestId, meta: { total: data?.length ?? 0, has_more: false } });
}
