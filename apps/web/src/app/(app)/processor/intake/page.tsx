'use client';

import { IntakeTable } from '@/components/domain/intake-table';
import { OrgGate } from '@/components/domain/org-gate';
import { PageHeader } from '@/components/domain/states';

export default function IntakePage() {
  return (
    <OrgGate kind="processor">
      {(w) => (
        <div className="flex flex-col gap-6">
          <PageHeader title="Intake schedule" description="Confirmed and active bookings for the next 30 days, by delivery window. Refreshes every 30 seconds." />
          <IntakeTable orgId={w.orgId} />
        </div>
      )}
    </OrgGate>
  );
}

