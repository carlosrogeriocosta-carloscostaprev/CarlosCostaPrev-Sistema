import { redirect } from 'next/navigation';

import { requireAuth, resolveActiveOrg } from '@/lib/auth/server';
import { PrevidenciarioCasesClient } from './_client';

export const dynamic = 'force-dynamic';

export default async function PrevidenciarioPage() {
  const user = await requireAuth();
  const organization = await resolveActiveOrg(user);
  if (!organization) redirect('/get-started');
  return <PrevidenciarioCasesClient />;
}
