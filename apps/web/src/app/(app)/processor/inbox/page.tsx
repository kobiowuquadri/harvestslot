'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CalendarDays, MapPin, Send } from 'lucide-react';
import { CROPS, formatKg, type InboxItem, type OfferDto } from '@harvestslot/contracts';
import { ReasonActionDialog } from '@/components/domain/dialogs';
import { DateOnly, Price } from '@/components/domain/display';
import { OfferForm } from '@/components/domain/offer-form';
import { OrgGate } from '@/components/domain/org-gate';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Dialog, DialogContent, Segmented } from '@/components/ui/primitives';
import { can, useApi } from '@/lib/hooks';
import type { Workspace } from '@/lib/session';
import { cn } from '@/lib/utils';

type Filter = 'answer' | 'sent' | 'all';
const needsAnswer = (i: InboxItem) => !i.offer || ['DRAFT', 'EXPIRED', 'DECLINED', 'WITHDRAWN', 'LAPSED', 'COUNTERED'].includes(i.offer.status);

function OfferDialog({ w, item, onClose }: { w: Extract<Workspace, { kind: 'processor' }>; item: InboxItem; onClose: () => void }) {
  const draftId = item.offer?.status === 'DRAFT' ? item.offer.id : null;
  const draft = useApi<OfferDto>(['offer', draftId ?? ''], draftId ? `/offers/${draftId}` : null);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Offer to ${item.farmerName}`} description="The farmer sees exactly these terms. Sending reserves the capacity until they answer." wide>
        {draftId && !draft.data ? (
          <p className="text-sm text-muted">Loading your draft…</p>
        ) : (
          <OfferForm
            orgId={w.orgId}
            existing={draft.data}
            request={{
              harvestRequestId: item.harvestRequestId,
              crop: item.crop,
              reference: item.reference,
              farmerName: item.farmerName,
              farmLabel: item.farmLabel,
              lga: item.lga,
              remainingKg: item.remainingKg,
              earliestHarvestDate: item.earliestHarvestDate,
              latestHarvestDate: item.latestHarvestDate,
              bestSlotId: item.bestSlot?.slotId,
            }}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RequestCard({ w, i, highlighted, onReview }: { w: Extract<Workspace, { kind: 'processor' }>; i: InboxItem; highlighted: boolean; onReview: () => void }) {
  const commercial = can(w, 'processor.offer.manage');
  const status = i.offer?.status;
  return (
    <li className={cn('flex flex-col gap-4 rounded-2xl border bg-surface p-5 shadow-[var(--shadow-card)]', highlighted ? 'border-forest ring-1 ring-forest' : 'border-line')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-ink">{i.farmerName}</span>
            <Badge>{CROPS[i.crop].label}</Badge>
            {i.request ? <Badge tone="accent">Asked you directly</Badge> : null}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted">
            <MapPin className="size-3.5" aria-hidden /> {i.community ? `${i.community}, ` : ''}
            {i.lga} · about {Math.round(i.bestFacility.straightLineKm)} km from {i.bestFacility.facilityName}
          </p>
        </div>
        <p className="text-right">
          <span className="block text-xl font-semibold tracking-tight text-ink">{formatKg(i.remainingKg)}</span>
          <span className="text-xs text-muted">{i.reference}</span>
        </p>
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-4 text-muted" aria-hidden /> Ready <DateOnly date={i.earliestHarvestDate} /> – <DateOnly date={i.latestHarvestDate} />
        </span>
        {i.minPriceKoboPerKg ? (
          <span>
            Wants at least <Price kobo={i.minPriceKoboPerKg} />
          </span>
        ) : null}
      </p>
      <div className={cn('rounded-xl px-3.5 py-2.5 text-sm font-medium', needsAnswer(i) ? 'bg-amber-50 text-amber-ink' : 'bg-canvas text-ink')}>{i.nextStep}</div>
      {commercial ? (
        <div className="flex flex-wrap gap-2">
          {status === 'ACCEPTED' && i.offer?.bookingId ? (
            <Button asChild>
              <Link href={`/bookings/${i.offer.bookingId}`}>Open the booking</Link>
            </Button>
          ) : status === 'OPEN' || status === 'COUNTERED' ? (
            <Button asChild variant={status === 'COUNTERED' ? 'primary' : 'outline'}>
              <Link href={`/offers/${i.offer!.id}`}>{status === 'COUNTERED' ? 'Answer the farmer' : 'View your offer'}</Link>
            </Button>
          ) : (
            <Button onClick={onReview}>
              <Send className="size-4" aria-hidden /> {status === 'DRAFT' ? 'Finish and send offer' : 'Review and send offer'}
            </Button>
          )}
          {i.request && !i.offer ? (
            <ReasonActionDialog
              trigger="Can’t buy this time"
              title="Tell the farmer you can’t buy this harvest?"
              description="They are told straight away, so they can ask another buyer."
              confirmLabel="Send reply"
              reasonLabel="Reason the farmer will see"
              path={`/organisations/${w.orgId}/requests/${i.harvestRequestId}/decline`}
              body={{}}
              invalidate={[['inbox', w.orgId]]}
              success="The farmer has been told"
              tone="primary"
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Requests({ w }: { w: Extract<Workspace, { kind: 'processor' }> }) {
  const params = useSearchParams();
  const highlighted = params.get('request');
  const q = useApi<InboxItem[]>(['inbox', w.orgId], `/organisations/${w.orgId}/inbox`);
  const [filter, setFilter] = useState<Filter>('answer');
  const [reviewing, setReviewing] = useState<InboxItem | null>(null);
  // Arriving from a notification: open that request straight away.
  useEffect(() => {
    if (highlighted && q.data) {
      const item = q.data.find((i) => i.harvestRequestId === highlighted);
      if (item && needsAnswer(item) && can(w, 'processor.offer.manage')) setReviewing(item);
    }
  }, [highlighted, q.data, w]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Requests" description="Farmers with produce to sell that fit your buying slots. Review a request and send an offer — or tell the farmer you can’t buy this time." />
      {w.status !== 'APPROVED' ? <Alert tone="warning">HarvestSlot is reviewing your business. You can prepare offers as drafts now and send them once the review is done.</Alert> : null}
      <QueryView
        query={q}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState title="No requests right now" action={<Button asChild><Link href="/processor/capacity">Publish a buying slot</Link></Button>}>
            Requests appear when farmers near your buying slots list a harvest, or ask you directly.
          </EmptyState>
        }
      >
        {(items) => {
          const shown = items.filter((i) => (filter === 'all' ? true : filter === 'answer' ? needsAnswer(i) : !needsAnswer(i)));
          return (
            <>
              <Segmented<Filter>
                label="Show"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'answer', label: `Needs your answer (${items.filter(needsAnswer).length})` },
                  { value: 'sent', label: `Offers sent (${items.filter((i) => !needsAnswer(i)).length})` },
                  { value: 'all', label: 'All' },
                ]}
              />
              {shown.length === 0 ? (
                <p className="text-sm text-muted">Nothing here.</p>
              ) : (
                <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {shown.map((i) => (
                    <RequestCard key={i.harvestRequestId} w={w} i={i} highlighted={highlighted === i.harvestRequestId} onReview={() => setReviewing(i)} />
                  ))}
                </ul>
              )}
            </>
          );
        }}
      </QueryView>
      {reviewing ? <OfferDialog w={w} item={reviewing} onClose={() => setReviewing(null)} /> : null}
    </div>
  );
}

export default function RequestsPage() {
  return <OrgGate kind="processor">{(w) => <Requests w={w} />}</OrgGate>;
}
