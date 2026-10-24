'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { INVOICE_KIND_LABELS, type BookingSummary, type HarvestDto, type InvoiceDto, type OfferDto } from '@harvestslot/contracts';
import { Badge } from '@/components/ui/primitives';
import { DateOnly, DemoTag, Kg, Money, Price, StatusBadge, When, Window } from './display';

export function BookingCards({ items, perspective, linkSuffix = '' }: { items: BookingSummary[]; perspective: 'farmer' | 'processor' | 'transporter' | 'cooperative' | 'admin'; linkSuffix?: string }) {
  return (
    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {items.map((b) => (
        <li key={b.id}>
          <Link href={`/bookings/${b.id}${linkSuffix}`} className="block rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] hover:border-leaf">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-forest">{b.reference}</span>
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
            <p className="mt-2 text-sm">
              {perspective === 'farmer' ? (
                <>
                  Selling to <strong>{b.processorName}</strong> · {b.facilityName}
                </>
              ) : perspective === 'processor' ? (
                <>
                  From <strong>{b.farmerName}</strong> · {b.facilityName}
                </>
              ) : (
                <>
                  <strong>{b.farmerName}</strong> → {b.processorName} ({b.facilityName})
                </>
              )}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div>
                <dt className="text-xs text-muted">Quantity</dt>
                <dd>
                  <Kg kg={b.quantityKg} tonnes />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Price</dt>
                <dd>
                  <Price kobo={b.priceKoboPerKg} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Harvest date</dt>
                <dd>
                  <DateOnly date={b.plannedHarvestDate} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Pickup</dt>
                <dd>
                  <Window start={b.pickupWindow.start} end={b.pickupWindow.end} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Transport</dt>
                <dd>{b.transportStatus}</dd>
              </div>
              {b.receivingStatus ? (
                <div>
                  <dt className="text-xs text-muted">Receiving</dt>
                  <dd>
                    <StatusBadge kind="receiving" status={b.receivingStatus} />
                  </dd>
                </div>
              ) : null}
            </dl>
            {b.nextAction ? (
              <p className="mt-3 flex items-center gap-1 text-sm font-medium text-leaf">
                <ArrowRight className="size-4" aria-hidden /> {b.nextAction}
              </p>
            ) : null}
            {b.confirmationDeadline && ['DRAFT', 'AWAITING_CONFIRMATIONS'].includes(b.status) ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-amber-ink">
                <Clock className="size-3.5" aria-hidden /> Confirm by <When at={b.confirmationDeadline} relative />
              </p>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function HarvestCards({ items, hrefFor }: { items: HarvestDto[]; hrefFor: (h: HarvestDto) => string }) {
  return (
    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {items.map((h) => (
        <li key={h.id}>
          <Link href={hrefFor(h)} className="block rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] hover:border-leaf">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-forest">{h.reference}</span>
              <StatusBadge kind="harvest" status={h.status} />
              {h.openOffers ? <Badge tone="accent">{h.openOffers} open offer{h.openOffers > 1 ? 's' : ''}</Badge> : null}
              {h.isDemo ? <DemoTag /> : null}
            </div>
            <p className="mt-2 text-sm">
              <Kg kg={h.eligibleQuantityKg} tonnes /> for sale from {h.farmLocation.label} ({h.farmLocation.lga})
            </p>
            <p className="text-sm text-muted">
              Harvest between <DateOnly date={h.earliestHarvestDate} /> and <DateOnly date={h.latestHarvestDate} />
            </p>
            <div className="mt-3">
              <AllocationBar allocated={h.allocation.allocatedKg} eligible={h.allocation.eligibleKg} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function AllocationBar({ allocated, eligible }: { allocated: string; eligible: string }) {
  const pct = Number(eligible) > 0 ? Math.min(100, Math.round((Number(allocated) / Number(eligible)) * 100)) : 0;
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Share of the harvest already booked">
        <div className="h-full bg-leaf" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">
        <Kg kg={allocated} /> of <Kg kg={eligible} /> booked ({pct}%)
      </p>
    </div>
  );
}

export function OfferCards({ items, perspective }: { items: OfferDto[]; perspective: 'farmer' | 'processor' }) {
  return (
    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {items.map((o) => (
        <li key={o.id}>
          <Link href={`/offers/${o.id}`} className="block rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] hover:border-leaf">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge kind="offer" status={o.status} />
              {o.awaiting === (perspective === 'farmer' ? 'FARMER' : 'PROCESSOR') ? <Badge tone="accent">Your response needed</Badge> : null}
              {o.isDemo ? <DemoTag /> : null}
            </div>
            <p className="mt-2 text-sm">
              {perspective === 'farmer' ? (
                <>
                  <strong>{o.processorName}</strong> · {o.facility.name}
                </>
              ) : (
                <>
                  <strong>{o.farmerName}</strong> · request {o.harvestReference}
                </>
              )}
            </p>
            <p className="text-sm">
              <Kg kg={o.current.quantityKg} tonnes /> at <Price kobo={o.current.priceKoboPerKg} /> · harvest <DateOnly date={o.current.plannedHarvestDate} />
            </p>
            <p className="text-sm text-muted">
              Estimated produce value <Money kobo={o.current.estimatedProduceAmountKobo} />
            </p>
            {['OPEN', 'COUNTERED'].includes(o.status) ? (
              <p className="mt-1 text-xs text-amber-ink">
                Expires <When at={o.expiresAt} relative />
              </p>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function InvoiceRows({ items }: { items: InvoiceDto[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((i) => (
        <li key={i.id}>
          <Link href={`/invoices/${i.id}`} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 hover:border-leaf sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-forest">{i.number}</span>
                <Badge tone="neutral">{INVOICE_KIND_LABELS[i.kind]}</Badge>
                <StatusBadge kind="invoice" status={i.status} />
                {i.overdue ? <Badge tone="danger">Overdue</Badge> : null}
                {i.disputed ? <Badge tone="warning">Disputed</Badge> : null}
                {i.isDemo ? <DemoTag /> : null}
              </div>
              <p className="mt-1 text-sm text-muted">
                {i.payer.name} pays {i.payee.name} · booking {i.bookingReference} · due <DateOnly date={i.dueAt} />
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">
                <Money kobo={i.totalKobo} />
              </p>
              <p className="text-muted">
                Outstanding <Money kobo={i.outstandingKobo} />
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
