'use client';

import Link from 'next/link';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { DELIVERY_STATUS_LABELS, type NotificationDto } from '@harvestslot/contracts';
import { When } from '@/components/domain/display';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/primitives';
import { get, post } from '@/lib/api';
import { useAction } from '@/lib/mutations';

type Page = { items: NotificationDto[]; nextCursor: string | null };

export default function NotificationsPage() {
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    queryFn: ({ pageParam, signal }) => get<Page>(`/notifications?limit=30${pageParam ? `&cursor=${pageParam}` : ''}`, signal),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const readAll = useAction({ request: () => ({ path: '/notifications/read-all', idempotent: false }), invalidate: [['notifications']], success: 'All marked as read' });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const markRead = (n: NotificationDto) => {
    if (n.readAt) return;
    void post(`/notifications/${n.id}/read`).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="In-app notifications are always kept. Email and SMS copies are shown with their delivery status."
        actions={
          <Button variant="outline" onClick={() => readAll.mutate()} loading={readAll.isPending}>
            Mark all as read
          </Button>
        }
      />
      {q.isLoading ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : items.length === 0 ? <EmptyState title="No notifications yet" /> : null}
      <ul className="flex flex-col gap-2">
        {items.map((n) => {
          const content = (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {!n.readAt ? <span className="size-2 rounded-full bg-danger" aria-label="Unread" /> : null}
                <span className="font-medium">{n.title}</span>
                <span className="text-xs text-muted">
                  <When at={n.createdAt} relative />
                </span>
              </div>
              <p className="text-sm text-muted">{n.body}</p>
              {n.deliveries.filter((d) => d.channel !== 'IN_APP').length ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {n.deliveries
                    .filter((d) => d.channel !== 'IN_APP')
                    .map((d, i) => (
                      <Badge key={i} tone={d.status === 'SENT' ? 'success' : d.status === 'CAPTURED_LOCALLY' ? 'accent' : d.status === 'FAILED' || d.status === 'DEAD' ? 'danger' : 'neutral'} title={d.detail}>
                        {d.channel === 'EMAIL' ? 'Email' : 'SMS'}: {DELIVERY_STATUS_LABELS[d.status]}
                      </Badge>
                    ))}
                </div>
              ) : null}
            </>
          );
          return (
            <li key={n.id}>
              {n.link ? (
                <Link href={n.link} onClick={() => markRead(n)} className={`block rounded-xl border p-4 transition-[border-color,box-shadow] hover:border-line-strong/40 hover:shadow-[var(--shadow-raised)] ${n.readAt ? 'border-line bg-surface' : 'border-leaf-100 bg-leaf-50'}`}>
                  {content}
                </Link>
              ) : (
                <button type="button" onClick={() => markRead(n)} className={`block w-full rounded-xl border p-4 text-left ${n.readAt ? 'border-line bg-surface' : 'border-leaf-100 bg-leaf-50'}`}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {q.hasNextPage ? (
        <Button variant="outline" className="self-center" onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}
