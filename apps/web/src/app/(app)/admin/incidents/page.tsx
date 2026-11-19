'use client';

import Link from 'next/link';
import { INCIDENT_KIND_LABELS, PARTY_LABELS, type BookingParty, type IncidentKind } from '@harvestslot/contracts';
import { DemoTag, StatusBadge, When } from '@/components/domain/display';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';

type Incidents = {
  incidents: Array<{ id: string; bookingId: string; bookingReference: string; bookingStatus: string; kind: IncidentKind; blocking: boolean; description: string; openedByParty: BookingParty; createdAt: string; isDemo: boolean }>;
  overdueReviews: Array<{ bookingId: string; bookingReference: string; reviewDeadline: string | null; escalatedAt: string | null }>;
};

export default function AdminIncidents() {
  const q = useApi<Incidents>(['admin', 'incidents'], '/admin/incidents');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Incidents and escalations" description="Open booking problems, and receiving decisions the farmer has not answered in time (never auto-accepted)." />
      <QueryView query={q}>
        {(d) => (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Overdue receiving reviews ({d.overdueReviews.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {d.overdueReviews.length === 0 ? (
                  <p className="text-sm text-muted">None.</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {d.overdueReviews.map((r) => (
                      <li key={r.bookingId}>
                        <Link className="font-mono text-leaf underline" href={`/bookings/${r.bookingId}/receiving`}>
                          {r.bookingReference}
                        </Link>{' '}
                        · deadline <When at={r.reviewDeadline} /> {r.escalatedAt ? <>· escalated <When at={r.escalatedAt} /></> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            {d.incidents.length === 0 ? <EmptyState title="No open incidents" /> : null}
            <ul className="flex flex-col gap-2">
              {d.incidents.map((i) => (
                <li key={i.id} className="rounded-2xl border border-line bg-surface p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link className="font-mono font-semibold text-leaf underline" href={`/bookings/${i.bookingId}`}>
                      {i.bookingReference}
                    </Link>
                    <StatusBadge kind="booking" status={i.bookingStatus} />
                    <Badge tone="neutral">{INCIDENT_KIND_LABELS[i.kind]}</Badge>
                    {i.blocking ? <Badge tone="danger">Blocking</Badge> : null}
                    {i.isDemo ? <DemoTag /> : null}
                    <span className="ml-auto text-muted">
                      by {PARTY_LABELS[i.openedByParty]} · <When at={i.createdAt} relative />
                    </span>
                  </div>
                  <p className="mt-1">{i.description}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryView>
    </div>
  );
}
