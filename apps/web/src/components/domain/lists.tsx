'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, CheckCircle2, Clock, FileText } from 'lucide-react';
import {
  CROPS,
  INVOICE_KIND_LABELS,
  type BookingSummary,
  type HarvestDto,
  type InvoiceDto,
  type OfferDto,
} from '@harvestslot/contracts';
import { Badge } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { DateOnly, DemoTag, Kg, Money, Price, StatusBadge, When, Window } from './display';

/** Where a booking stands, from agreed terms to payment (derived from the booking summary). */
export function bookingSteps(b: BookingSummary) {
  const agreed = ['CONFIRMED', 'ACTIVE', 'COMPLETED'].includes(b.status);
  const pay = b.plan.payment;
  const paid = Boolean(pay && pay.outstandingKobo <= 0 && pay.reportedPendingKobo <= 0);
  return [
    { label: 'Plan agreed', done: agreed },
    { label: 'Handed over and weighed', done: Boolean(b.plan.weighed) || b.status === 'COMPLETED' },
    { label: 'Payment reported', done: Boolean(pay && (pay.reportedPendingKobo > 0 || pay.confirmedPaidKobo > 0)) },
    { label: 'Payment received', done: paid },
  ];
}

const cardClass =
  'flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-line-strong/40 hover:shadow-[var(--shadow-raised)]';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

function StepBar({ steps }: { steps: Array<{ label: string; done: boolean }> }) {
  const current = steps.findIndex((s) => !s.done);
  return (
    <div>
      <div className="flex gap-1" aria-hidden>
        {steps.map((s, i) => (
          <span
            key={s.label}
            className={cn(
              'h-1 flex-1 rounded-full',
              s.done ? 'bg-forest' : i === current ? 'bg-leaf-100' : 'bg-line',
            )}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {current === -1
          ? 'All steps complete'
          : `Step ${current + 1} of ${steps.length}: ${steps[current]!.label}`}
      </p>
    </div>
  );
}

export function BookingCards({
  items,
  perspective,
  linkSuffix = '',
}: {
  items: BookingSummary[];
  perspective: 'farmer' | 'processor' | 'transporter' | 'cooperative' | 'admin';
  linkSuffix?: string;
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {items.map((b) => {
        const closed = ['CANCELLED', 'EXPIRED'].includes(b.status);
        const deadline = b.confirmationDeadline && ['DRAFT', 'AWAITING_CONFIRMATIONS'].includes(b.status);
        return (
          <li key={b.id}>
            <Link href={`/bookings/${b.id}${linkSuffix}`} className={cardClass}>
              <div className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold text-ink">{b.reference}</span>
                    <StatusBadge kind="booking" status={b.status} />
                    {b.status === 'CONFIRMED' || b.status === 'ACTIVE' ? (
                      b.ready ? (
                        <Badge tone="success">
                          <CheckCircle2 className="size-3.5" aria-hidden /> Ready
                        </Badge>
                      ) : (
                        <Badge tone="warning">Not ready</Badge>
                      )
                    ) : null}
                    {b.isDemo ? <DemoTag /> : null}
                  </div>
                  <span className="shrink-0 text-right text-lg font-semibold tracking-tight text-ink">
                    <Kg kg={b.quantityKg} />
                    <span className="block text-xs font-medium text-muted">{CROPS[b.crop].label}</span>
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted">
                    {perspective === 'farmer'
                      ? 'Buyer'
                      : perspective === 'processor'
                        ? 'Farmer'
                        : 'Farmer → processor'}
                  </p>
                  <p className="mt-0.5 truncate text-[15px] font-semibold text-ink">
                    {perspective === 'farmer'
                      ? b.processorName
                      : perspective === 'processor'
                        ? b.farmerName
                        : `${b.farmerName} → ${b.processorName}`}
                  </p>
                  <p className="truncate text-[13px] text-muted">{b.facilityName}</p>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-canvas/70 p-3.5 sm:grid-cols-3">
                  <Fact label="Price">
                    <Price kobo={b.priceKoboPerKg} />
                  </Fact>
                  <Fact label="Harvest date">
                    <DateOnly date={b.plannedHarvestDate} />
                  </Fact>
                  <Fact label="Pickup">
                    <Window start={b.pickupWindow.start} end={b.pickupWindow.end} />
                  </Fact>
                  <Fact label="Handover">{b.transportStatus}</Fact>
                  {b.receivingStatus ? (
                    <Fact label="Receiving">
                      <StatusBadge kind="receiving" status={b.receivingStatus} />
                    </Fact>
                  ) : null}
                </dl>
                {closed ? null : <StepBar steps={bookingSteps(b)} />}
              </div>
              {b.nextAction || deadline ? (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line bg-canvas/50 px-5 py-3 text-sm">
                  {b.nextAction ? (
                    <span className="flex items-center gap-1.5 font-medium text-forest">
                      <ArrowRight className="size-4 shrink-0" aria-hidden /> {b.nextAction}
                    </span>
                  ) : (
                    <span />
                  )}
                  {deadline ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-amber-ink">
                      <Clock className="size-3.5" aria-hidden /> Confirm by{' '}
                      <When at={b.confirmationDeadline} relative />
                    </span>
                  ) : null}
                </div>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function HarvestCards({
  items,
  hrefFor,
}: {
  items: HarvestDto[];
  hrefFor: (h: HarvestDto) => string;
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {items.map((h) => (
        <li key={h.id}>
          <Link href={hrefFor(h)} className={cardClass}>
            <div className="flex flex-1 flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] font-semibold text-ink">{h.reference}</span>
                  <StatusBadge kind="harvest" status={h.status} />
                  {h.isDemo ? <DemoTag /> : null}
                </div>
                <span className="shrink-0 text-right text-lg font-semibold tracking-tight text-ink">
                  <Kg kg={h.eligibleQuantityKg} tonnes />
                  <span className="block text-xs font-medium text-muted">{CROPS[h.crop].label}</span>
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted">Farm</p>
                <p className="mt-0.5 truncate text-[15px] font-semibold text-ink">{h.farmLocation.label}</p>
                <p className="truncate text-[13px] text-muted">
                  {h.farmLocation.community ? `${h.farmLocation.community}, ` : ''}
                  {h.farmLocation.lga}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-canvas/70 p-3.5">
                <Fact label="Harvest window">
                  <DateOnly date={h.earliestHarvestDate} /> – <DateOnly date={h.latestHarvestDate} />
                </Fact>
                <Fact label="Minimum price">
                  {h.minPriceKoboPerKg !== null ? <Price kobo={h.minPriceKoboPerKg} /> : 'Open to offers'}
                </Fact>
              </dl>
              <AllocationBar allocated={h.allocation.allocatedKg} eligible={h.allocation.eligibleKg} />
            </div>
            {h.openOffers ? (
              <div className="flex items-center justify-between gap-3 border-t border-line bg-amber-50 px-5 py-3 text-sm">
                <span className="font-medium text-amber-ink">
                  {h.openOffers} open offer{h.openOffers > 1 ? 's' : ''} to review
                </span>
                <ArrowRight className="size-4 text-amber-ink" aria-hidden />
              </div>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function AllocationBar({ allocated, eligible }: { allocated: string; eligible: string }) {
  const pct =
    Number(eligible) > 0 ? Math.min(100, Math.round((Number(allocated) / Number(eligible)) * 100)) : 0;
  return (
    <div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-leaf-100"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Share of the harvest already booked"
      >
        <div className="h-full rounded-full bg-forest" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">
        <Kg kg={allocated} /> of <Kg kg={eligible} /> booked ({pct}%)
      </p>
    </div>
  );
}

export function OfferCards({
  items,
  perspective,
}: {
  items: OfferDto[];
  perspective: 'farmer' | 'processor';
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {items.map((o) => {
        const yourTurn = o.awaiting === (perspective === 'farmer' ? 'FARMER' : 'PROCESSOR');
        const live = ['OPEN', 'COUNTERED'].includes(o.status);
        return (
          <li key={o.id}>
            <Link href={`/offers/${o.id}`} className={cardClass}>
              <div className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <StatusBadge kind="offer" status={o.status} />
                    {yourTurn && live ? <Badge tone="accent">Your response needed</Badge> : null}
                    {o.isDemo ? <DemoTag /> : null}
                  </div>
                  <span className="shrink-0 text-lg font-semibold tracking-tight text-ink">
                    <Price kobo={o.current.priceKoboPerKg} />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted">
                    {perspective === 'farmer' ? 'Processor' : `Farmer · request ${o.harvestReference}`}
                  </p>
                  <p className="mt-0.5 truncate text-[15px] font-semibold text-ink">
                    {perspective === 'farmer' ? o.processorName : o.farmerName}
                  </p>
                  <p className="truncate text-[13px] text-muted">{o.facility.name}</p>
                </div>
                <dl className="grid grid-cols-3 gap-x-4 gap-y-3 rounded-xl bg-canvas/70 p-3.5">
                  <Fact label="Quantity">
                    <Kg kg={o.current.quantityKg} tonnes />
                  </Fact>
                  <Fact label="Harvest">
                    <DateOnly date={o.current.plannedHarvestDate} />
                  </Fact>
                  <Fact label="Est. value">
                    <Money kobo={o.current.estimatedProduceAmountKobo} />
                  </Fact>
                </dl>
              </div>
              {live ? (
                <div
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line px-5 py-3 text-sm',
                    yourTurn ? 'bg-amber-50' : 'bg-canvas/50',
                  )}
                >
                  <span className={cn('font-medium', yourTurn ? 'text-amber-ink' : 'text-muted')}>
                    {yourTurn ? 'Waiting for your answer' : 'Waiting for the other party'}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Clock className="size-3.5" aria-hidden /> Expires <When at={o.expiresAt} relative />
                  </span>
                </div>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function InvoiceRows({ items }: { items: InvoiceDto[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
      {items.map((i) => (
        <li key={i.id}>
          <Link
            href={`/invoices/${i.id}`}
            className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-canvas/60 sm:flex-row sm:items-center sm:gap-4"
          >
            <span
              className={cn(
                'hidden size-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset sm:grid',
                i.overdue
                  ? 'bg-danger-50 text-danger ring-danger/15'
                  : i.status === 'PAID'
                    ? 'bg-leaf-50 text-forest ring-leaf-100'
                    : 'bg-canvas text-muted ring-line',
              )}
              aria-hidden
            >
              <FileText className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[13px] font-semibold text-ink">{i.number}</span>
                <Badge tone="neutral">{INVOICE_KIND_LABELS[i.kind]}</Badge>
                <StatusBadge kind="invoice" status={i.status} />
                {i.overdue ? <Badge tone="danger">Overdue</Badge> : null}
                {i.disputed ? <Badge tone="warning">Disputed</Badge> : null}
                {i.isDemo ? <DemoTag /> : null}
              </div>
              <p className="mt-1 text-[13px] text-muted">
                <span className="font-medium text-ink">{i.payer.name}</span> pays{' '}
                <span className="font-medium text-ink">{i.payee.name}</span> · booking {i.bookingReference} ·
                due <DateOnly date={i.dueAt} />
              </p>
            </div>
            <div className="flex items-baseline justify-between gap-4 sm:block sm:text-right">
              <p className="text-base font-semibold tabular text-ink">
                <Money kobo={i.totalKobo} />
              </p>
              <p
                className={cn(
                  'text-[13px] tabular',
                  i.outstandingKobo > 0 ? (i.overdue ? 'text-danger' : 'text-muted') : 'text-forest',
                )}
              >
                {i.outstandingKobo > 0 ? (
                  <>
                    <Money kobo={i.outstandingKobo} /> outstanding
                  </>
                ) : (
                  'Settled'
                )}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
