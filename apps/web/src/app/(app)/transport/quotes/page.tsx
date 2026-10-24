'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { DriverDto, QuoteDto } from '@harvestslot/contracts';
import { ReasonActionDialog } from '@/components/domain/dialogs';
import { Money, StatusBadge, When, Window } from '@/components/domain/display';
import { OrgGate } from '@/components/domain/org-gate';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { Alert, Card, CardContent } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';

function AssignDriver({ q, orgId }: { q: QuoteDto; orgId: string }) {
  const drivers = useApi<DriverDto[]>(['drivers', orgId], `/organisations/${orgId}/drivers`);
  const [driverId, setDriverId] = useState(q.driver?.id ?? '');
  const accept = useAction({ request: () => ({ path: '/assignments/accept', body: { quoteId: q.id, driverId } }), invalidate: [['transport-quotes', orgId], ['jobs', orgId]], success: 'Assignment confirmed — the job is in your jobs list' });
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select aria-label="Driver" value={driverId} onChange={(e) => setDriverId(e.target.value)} className="sm:w-56">
        <option value="">Choose a driver…</option>
        {drivers.data
          ?.filter((d) => d.status === 'ACTIVE')
          .map((d) => (
            <option key={d.id} value={d.id}>
              {d.displayName}
            </option>
          ))}
      </Select>
      <Button size="sm" onClick={() => accept.mutate()} loading={accept.isPending} disabled={!driverId}>
        Confirm vehicle and driver
      </Button>
      <ReasonActionDialog trigger="Decline assignment" triggerSize="sm" title="Decline this assignment?" description="The vehicle hold is released and the payer can choose another transporter." confirmLabel="Decline" path={`/quotes/${q.id}/decline-assignment`} invalidate={[['transport-quotes', orgId]]} success="Assignment declined" />
    </div>
  );
}

function Quotes({ orgId }: { orgId: string }) {
  const q = useApi<QuoteDto[]>(['transport-quotes', orgId], `/organisations/${orgId}/quotes`);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Quotes" description="When a payer accepts your quote, the vehicle is held for you. Confirm the driver to complete the agreement." />
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No quotes yet" />}>
        {(items) => (
          <div className="flex flex-col gap-3">
            {items.map((x) => (
              <Card key={x.id} className={x.trip?.status === 'HELD' ? 'border-forest ring-1 ring-forest' : ''}>
                <CardContent className="flex flex-col gap-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/bookings/${x.bookingId}`} className="font-mono font-semibold text-leaf underline">
                      {x.bookingReference}
                    </Link>
                    <StatusBadge kind="generic" status={x.status} />
                    {x.trip ? <StatusBadge kind="generic" status={x.trip.status} label={`Vehicle hold: ${x.trip.status.toLowerCase()}`} /> : null}
                    <span className="ml-auto font-semibold">
                      <Money kobo={x.priceKobo} />
                    </span>
                  </div>
                  <p>
                    {x.vehicle.plate} · {x.driver ? `driver ${x.driver.name}` : 'no driver yet'} · pickup <Window start={x.pickupWindowStart} end={x.pickupWindowEnd} />
                  </p>
                  <p className="text-muted">
                    Sent <When at={x.createdAt} /> · valid until <When at={x.validUntil} />
                    {x.decisionReason ? ` · ${x.decisionReason}` : ''}
                  </p>
                  {x.trip?.status === 'HELD' ? (
                    <>
                      <Alert tone="warning" title="Accepted — confirm your driver">
                        Hold expires {x.trip.expiresAt ? <When at={x.trip.expiresAt} relative /> : 'soon'}. Until then the booking is not ready to harvest.
                      </Alert>
                      <AssignDriver q={x} orgId={orgId} />
                    </>
                  ) : null}
                  {x.status === 'SUBMITTED' ? (
                    <div>
                      <ReasonActionDialog trigger="Withdraw quote" triggerSize="sm" title="Withdraw this quote?" confirmLabel="Withdraw" path={`/quotes/${x.id}/withdraw`} reasonOptional invalidate={[['transport-quotes', orgId]]} success="Quote withdrawn" />
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}

export default function QuotesPage() {
  return <OrgGate kind="transporter">{(w) => <Quotes orgId={w.orgId} />}</OrgGate>;
}
