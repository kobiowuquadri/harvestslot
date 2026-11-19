'use client';

import Link from 'next/link';
import type { JobDto } from '@harvestslot/contracts';
import { Kg, StatusBadge, Window } from '@/components/domain/display';
import { OrgGate } from '@/components/domain/org-gate';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { useApi } from '@/lib/hooks';

function Jobs({ orgId }: { orgId: string }) {
  const q = useApi<JobDto[]>(['jobs', orgId], `/organisations/${orgId}/jobs`, { refetchInterval: 30_000 });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Jobs" description="Confirmed transport jobs. Open one to record each step." />
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No jobs yet" />}>
        {(jobs) => (
          <ul className="flex flex-col gap-3">
            {jobs.map((j) => (
              <li key={j.shipmentId}>
                <Link href={`/transport/jobs/${j.shipmentId}`} className="block rounded-2xl border border-line bg-surface p-4 transition-[border-color,box-shadow] hover:border-line-strong/40 hover:shadow-[var(--shadow-raised)]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-ink">{j.bookingReference}</span>
                    <StatusBadge kind="shipment" status={j.status} />
                  </div>
                  <p className="mt-2 text-base font-medium">
                    {j.pickup.community ? `${j.pickup.community}, ` : ''}
                    {j.pickup.lga} → {j.destination.facilityName}
                  </p>
                  <p className="text-sm">
                    <Kg kg={j.quantityKg} tonnes /> · pickup <Window start={j.pickupWindow.start} end={j.pickupWindow.end} />
                  </p>
                  <p className="text-sm text-muted">
                    {j.vehicle.plate} · {j.driver.name}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}

export default function JobsPage() {
  return <OrgGate kind="transporter">{(w) => <Jobs orgId={w.orgId} />}</OrgGate>;
}
