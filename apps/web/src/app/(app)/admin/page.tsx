'use client';

import Link from 'next/link';
import { BOOKING_STATUS_LABELS, type BookingStatus } from '@harvestslot/contracts';
import { When } from '@/components/domain/display';
import { PageHeader, QueryView } from '@/components/domain/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';

type Overview = {
  attention: Record<'pendingOrgs' | 'openDisputes' | 'overdueReviews' | 'openIncidents' | 'deadOutbox' | 'failedDeliveries' | 'paymentMismatches' | 'pendingDataRequests', number>;
  bookings: { live: Record<string, number>; demo: Record<string, number> };
  generatedAt: string;
};

const ATTENTION: Array<{ key: keyof Overview['attention']; label: string; href: string }> = [
  { key: 'pendingOrgs', label: 'Organisations awaiting review', href: '/admin/organisations' },
  { key: 'openDisputes', label: 'Open disputes', href: '/admin/disputes' },
  { key: 'overdueReviews', label: 'Receiving reviews overdue', href: '/admin/incidents' },
  { key: 'openIncidents', label: 'Open booking problems', href: '/admin/incidents' },
  { key: 'deadOutbox', label: 'Failed background events', href: '/admin/outbox' },
  { key: 'failedDeliveries', label: 'Failed email/SMS deliveries', href: '/admin/outbox' },
  { key: 'paymentMismatches', label: 'Payment amount mismatches', href: '/admin/outbox' },
  { key: 'pendingDataRequests', label: 'Privacy requests to handle', href: '/admin/data-requests' },
];

function StatusCounts({ title, counts }: { title: string; counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title} ({total})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted">None.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-1 text-sm">
            {Object.entries(counts).map(([s, n]) => (
              <li key={s}>
                {BOOKING_STATUS_LABELS[s as BookingStatus] ?? s}: <strong>{n}</strong>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminOverview() {
  const q = useApi<Overview>(['admin', 'overview'], '/admin/overview', { refetchInterval: 60_000 });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Operations overview" description="What needs an administrator’s attention." />
      <QueryView query={q}>
        {(o) => (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {ATTENTION.map((a) => (
                <Link key={a.key} href={a.href} className={`rounded-xl border p-4 transition-[border-color,box-shadow] hover:border-line-strong/40 hover:shadow-[var(--shadow-raised)] ${o.attention[a.key] ? 'border-amber-100 bg-amber-50' : 'border-line bg-surface'}`}>
                  <p className="text-sm text-muted">{a.label}</p>
                  <p className="mt-1 text-3xl font-semibold tabular text-ink">{o.attention[a.key]}</p>
                </Link>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <StatusCounts title="Live bookings" counts={o.bookings.live} />
              <StatusCounts title="Demo bookings (fictional)" counts={o.bookings.demo} />
            </div>
            <p className="text-xs text-muted">
              Generated <When at={o.generatedAt} />
            </p>
          </>
        )}
      </QueryView>
    </div>
  );
}
