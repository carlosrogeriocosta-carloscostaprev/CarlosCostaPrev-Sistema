import { requireAuth, resolveActiveOrg } from '@/lib/auth/server';
import { redirect } from 'next/navigation';

import { PrevidenciarioCaseDetailClient } from './_client';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ id: string }> };

export default async function PrevidenciarioCasePage({ params }: PageProps) {
  const user = await requireAuth();
  const organization = await resolveActiveOrg(user);
  if (!organization) redirect('/get-started');
  const { id } = await params;
  return <PrevidenciarioCaseDetailClient caseId={id} />;
}
