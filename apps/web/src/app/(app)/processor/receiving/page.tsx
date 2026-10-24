'use client';

import { OrgGate } from '@/components/domain/org-gate';
import { PageHeader } from '@/components/domain/states';
import { IntakeTable } from '@/components/domain/intake-table';

export default function ReceivingListPage() {
  return (
    <OrgGate kind="processor">
      {(w) => (
        <div className="flex flex-col gap-6">
          <PageHeader title="Receiving" description="Trucks on the way or at the gate, and records awaiting the farmer’s review. Open one to weigh, add evidence and record the quality decision." />
          <IntakeTable orgId={w.orgId} receivingOnly />
        </div>
      )}
    </OrgGate>
  );
}
