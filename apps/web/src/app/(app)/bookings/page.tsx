'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { BOOKING_STATUS_LABELS, BookingStatusE, type BookingStatus, type BookingSummary } from '@harvestslot/contracts';
import { BookingCards } from '@/components/domain/lists';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { get } from '@/lib/api';
import { useFarmerContext } from '@/lib/hooks';
import { useSession } from '@/lib/session';

type Page = { items: BookingSummary[]; nextCursor: string | null };

export default function BookingsPage() {
  const { workspace } = useSession();
  const farmer = useFarmerContext();
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const view = workspace?.kind ?? 'farmer';
  const base = new URLSearchParams({ view, limit: '25' });
  if (workspace && 'orgId' in workspace) base.set('organisationId', workspace.orgId);
  // A representative opening a member's bookings (?farmer=) sees only that member.
  if (farmer?.acting) base.set('farmerProfileId', farmer.farmerProfileId);
  if (status) base.set('status', status);
  const q = useInfiniteQuery({
    queryKey: ['bookings', view, base.toString()],
    queryFn: ({ pageParam, signal }) => get<Page>(`/bookings?${base.toString()}${pageParam ? `&cursor=${pageParam}` : ''}`, signal),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(workspace),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const perspective = view === 'processor' ? 'processor' : view === 'farmer' ? 'farmer' : view === 'admin' ? 'admin' : view === 'transporter' ? 'transporter' : 'cooperative';
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={view === 'cooperative' ? 'Member bookings' : view === 'admin' ? 'All bookings' : view === 'farmer' ? 'My plans' : 'Bookings'}
        description={view === 'farmer' ? 'Each plan says who buys your produce, how much, and when and where it should be ready — and what happens next.' : 'Agreed purchases: from the plan, to the weight you accept, to the payment the farmer confirms.'}
        actions={
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as BookingStatus | '')} className="w-56">
            <option value="">All statuses</option>
            {BookingStatusE.values.map((s) => (
              <option key={s} value={s}>
                {BOOKING_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        }
      />
      {q.isLoading ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : items.length === 0 ? <EmptyState title="Nothing agreed yet">A plan appears here as soon as an offer is accepted.</EmptyState> : <BookingCards items={items} perspective={perspective} />}
      {q.hasNextPage ? (
        <Button variant="outline" onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage} className="self-center">
          Load more
        </Button>
      ) : null}
    </div>
  );
}
