'use client';

import { AnalyticsView } from '@/components/domain/analytics-view';
import { EmptyState, PageHeader } from '@/components/domain/states';
import { useSession } from '@/lib/session';

export default function ReportsPage() {
  const { workspace } = useSession();
  const path = workspace && 'orgId' in workspace ? `/analytics/organisations/${workspace.orgId}` : workspace?.kind === 'farmer' ? `/analytics/farmers/${workspace.farmerProfileId}` : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" description="Operational measures computed from records on HarvestSlot. They describe this platform’s activity only — not wider impact." />
      {path ? <AnalyticsView path={path} /> : <EmptyState title="No reports for this workspace" />}
    </div>
  );
}
