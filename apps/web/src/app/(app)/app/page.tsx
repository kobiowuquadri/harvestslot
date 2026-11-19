'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { CooperativeDashboard } from '@/components/dashboards/cooperative';
import { FarmerDashboard } from '@/components/dashboards/farmer';
import { ProcessorDashboard } from '@/components/dashboards/processor';
import { TransporterDashboard } from '@/components/dashboards/transporter';
import { Alert } from '@/components/ui/primitives';
import { useSession } from '@/lib/session';

export default function DashboardPage() {
  const { workspace } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    if (workspace?.kind === 'admin') router.replace('/admin');
  }, [workspace, router]);
  return (
    <>
      {params.get('welcome') ? (
        <Alert tone="success" title="Welcome to HarvestSlot" className="mb-6">
          Your account is ready. Check your email for a verification link.
        </Alert>
      ) : null}
      {workspace?.kind === 'farmer' ? <FarmerDashboard /> : null}
      {workspace?.kind === 'processor' ? <ProcessorDashboard w={workspace} /> : null}
      {workspace?.kind === 'transporter' ? <TransporterDashboard w={workspace} /> : null}
      {workspace?.kind === 'cooperative' ? <CooperativeDashboard w={workspace} /> : null}
    </>
  );
}
