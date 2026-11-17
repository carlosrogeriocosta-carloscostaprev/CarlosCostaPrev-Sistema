import { redirect } from 'next/navigation';

import { requireAuth, resolveActiveOrg } from '@/lib/auth/server';
import { PrevidenciarioKnowledgeClient } from './_client';

export const dynamic = 'force-dynamic';

export default async function PrevidenciarioKnowledgePage() {
  const user = await requireAuth();
  const organization = await resolveActiveOrg(user);
  if (!organization) redirect('/get-started');
  return <PrevidenciarioKnowledgeClient isPlatformAdmin={Boolean(user.is_platform_admin)} />;
}
