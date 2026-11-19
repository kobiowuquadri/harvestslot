'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { CalendarDays, CheckCircle2, Clock, MapPin, Send, Truck, XCircle } from 'lucide-react';
import { formatKg, HANDOVER_ARRANGEMENT_LABELS, type HarvestDto, type MatchResponse, type MatchResult, type OfferDto } from '@harvestslot/contracts';
import { ConfirmActionButton, ReasonActionDialog } from '@/components/domain/dialogs';
import { DateOnly, DemoTag, Money, Price, ReviewedTag, StatusBadge, When } from '@/components/domain/display';
import { FarmerGate } from '@/components/domain/farmer-gate';
import { NextStepCard } from '@/components/domain/next-step';
import { PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/primitives';
import { farmerCan, useApi, withFarmer, type FarmerContext } from '@/lib/hooks';

const LIVE = ['OPEN', 'COUNTERED'];

function RequestState({ h, facilityId, canAsk, ctx }: { h: HarvestDto; facilityId: string; canAsk: boolean; ctx: FarmerContext }) {
  const req = h.requests.find((r) => r.facilityId === facilityId);
  const ask = (label: string) =>
    canAsk ? (
      <ConfirmActionButton
        label={
          <>
            <Send className="size-4" aria-hidden /> {label}
          </>
        }
        path={`/harvests/${h.id}/offer-requests`}
        body={{ facilityId }}
        invalidate={[['harvest', h.id], ['matches', h.id], ['harvests']]}
        success="Request sent. You will be told when the buyer replies."
      />
    ) : null;
  if (!req) return ask('Send request');
  if (req.status === 'WAITING_FOR_OFFER') {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-canvas px-3.5 py-2.5 text-sm font-medium text-ink">
        <Clock className="size-4 text-muted" aria-hidden /> Request sent — waiting for their offer
      </p>
    );
  }
  if (req.status === 'OFFER_RECEIVED' && req.offerId) {
    return (
      <Button asChild variant="secondary">
        <Link href={withFarmer(`/offers/${req.offerId}`, ctx)}>See their offer</Link>
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-start gap-2 text-sm text-muted">
        <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> They can’t buy this time{req.declineReason ? `: ${req.declineReason}` : '.'}
      </p>
      {ask('Ask again')}
    </div>
  );
}

function MatchCard({ m, h, canAsk, ctx }: { m: MatchResult; h: HarvestDto; canAsk: boolean; ctx: FarmerContext }) {
  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-ink">{m.processorName}</span>
            <ReviewedTag approved={m.processorReviewed} />
          </p>
          <p className="text-[13px] text-muted">
            {m.facilityName}, {m.lga} · {m.distance.label}
          </p>
        </div>
        {m.indicativePriceKoboPerKg ? (
          <p className="text-right text-sm">
            <span className="block text-xs text-muted">Usually pays</span>
            <span className="font-semibold text-ink">
              <Price kobo={m.indicativePriceKoboPerKg} />
            </span>
          </p>
        ) : null}
      </div>
      <p className="flex items-start gap-2 text-[15px] font-medium text-forest-800">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-forest" aria-hidden /> {m.headline}.
      </p>
      <RequestState h={h} facilityId={m.facilityId} canAsk={canAsk} ctx={ctx} />
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-muted hover:text-ink">Why this buyer?</summary>
        <ul className="mt-2 list-disc pl-5 text-muted">
          {m.explanation.map((e) => (
            <li key={e}>{e}</li>
          ))}
          <li>{m.costs.freightNote}</li>
          <li>
            Quality: delivered within {m.qualityCriteria.maxHoursHarvestToDelivery} h of harvest{m.qualityCriteria.soilAndStemsRemoved ? ', soil and stems removed' : ''}.
          </li>
          <li>{m.reliability.label}</li>
        </ul>
        <p className="mt-2 text-xs text-muted">
          Space checked <When at={m.availabilityAsOf} />. A request reserves nothing; the buyer replies with an offer.
        </p>
      </details>
    </li>
  );
}

function Buyers({ h, ctx }: { h: HarvestDto; ctx: FarmerContext }) {
  const q = useApi<MatchResponse>(['matches', h.id], h.status === 'PUBLISHED' ? `/harvests/${h.id}/matches` : null);
  const canAsk = farmerCan(ctx, 'harvest.edit');
  if (h.status !== 'PUBLISHED') return null;
  return (
    <section aria-labelledby="buyers" className="flex flex-col gap-3">
      <div>
        <h2 id="buyers" className="text-lg font-semibold text-ink">
          Buyers that fit
        </h2>
        <p className="text-[13px] text-muted">Location, buying dates and free space checked against your harvest.</p>
      </div>
      <QueryView query={q}>
        {(r) => {
          const shown = new Set(r.results.map((m) => m.facilityId));
          const otherRequests = h.requests.filter((x) => !shown.has(x.facilityId));
          return (
            <div className="flex flex-col gap-4">
              {r.results.length === 0 ? (
                <Alert tone="warning" title="No buyer fits right now — your harvest is still saved">
                  {r.infeasible?.reasons.length ? (
                    <ul className="list-disc pl-5">
                      {r.infeasible.reasons.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-2">
                    {r.infeasible?.suggestions[0]?.text ?? 'Changing the dates often helps.'} Buyers who publish new buying slots will see your harvest too.
                  </p>
                  {canAsk ? (
                    <Button asChild size="sm" variant="outline" className="mt-3">
                      <Link href={withFarmer(`/farmer/harvests/${h.id}/edit`, ctx)}>
                        <CalendarDays className="size-4" aria-hidden /> Change the dates
                      </Link>
                    </Button>
                  ) : null}
                </Alert>
              ) : (
                <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {r.results.map((m) => (
                    <MatchCard key={`${m.facilityId}-${m.slot.id}`} m={m} h={h} canAsk={canAsk} ctx={ctx} />
                  ))}
                </ul>
              )}
              {otherRequests.length ? (
                <div className="rounded-2xl border border-line bg-surface p-5">
                  <h3 className="text-[15px] font-semibold text-ink">Requests you sent</h3>
                  <ul className="mt-3 flex flex-col gap-3">
                    {otherRequests.map((x) => (
                      <li key={x.facilityId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-ink">{x.processorName}</span>
                        <RequestState h={h} facilityId={x.facilityId} canAsk={canAsk} ctx={ctx} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          );
        }}
      </QueryView>
    </section>
  );
}

function Offers({ h, ctx }: { h: HarvestDto; ctx: FarmerContext }) {
  const q = useApi<OfferDto[]>(['offers', 'harvest', h.id], `/harvests/${h.id}/offers`);
  const offers = q.data ?? [];
  if (!offers.length) return null;
  return (
    <section aria-labelledby="offers" className="flex flex-col gap-3">
      <h2 id="offers" className="text-lg font-semibold text-ink">
        Offers
      </h2>
      <ul className="flex flex-col gap-3">
        {offers.map((o) => {
          const live = LIVE.includes(o.status);
          return (
            <li key={o.id}>
              <Link
                href={withFarmer(`/offers/${o.id}`, ctx)}
                className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-line-strong/40 hover:shadow-[var(--shadow-raised)] sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold text-ink">{o.processorName}</span>
                    <StatusBadge kind="offer" status={o.status} />
                  </p>
                  <p className="mt-1 text-sm text-ink">
                    <Price kobo={o.current.priceKoboPerKg} /> for {formatKg(o.current.quantityKg)} · <DateOnly date={o.current.plannedHarvestDate} />
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
                    <Truck className="size-3.5" aria-hidden /> {o.current.handoverArrangement ? HANDOVER_ARRANGEMENT_LABELS[o.current.handoverArrangement] : 'Transport arranged separately'}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:block sm:text-right">
                  <p className="text-lg font-semibold tabular text-ink">
                    <Money kobo={o.current.estimatedProduceAmountKobo} />
                  </p>
                  <p className="text-[13px] text-muted">{live ? <>Answer before <When at={o.expiresAt} /></> : 'Estimated total'}</p>
                </div>
                {live ? <span className="inline-flex h-10 items-center justify-center rounded-lg bg-forest px-4 text-sm font-semibold text-white">Review offer</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HarvestDetail({ ctx }: { ctx: FarmerContext }) {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const q = useApi<HarvestDto>(['harvest', id], `/harvests/${id}`);
  const offers = useApi<OfferDto[]>(['offers', 'harvest', id], `/harvests/${id}/offers`);
  const editable = farmerCan(ctx, 'harvest.edit');
  return (
    <QueryView query={q}>
      {(h) => {
        const firstOpen = (offers.data ?? []).find((o) => LIVE.includes(o.status));
        const fullyBooked = h.allocation.state === 'FULL';
        const datesPassed = h.nextStep.stage === 'Harvest dates have passed';
        const action =
          h.status === 'DRAFT' && editable ? (
            <ConfirmActionButton
              label="Find buyers"
              size="lg"
              path={`/harvests/${h.id}/publish`}
              body={{ expectedVersion: h.version }}
              invalidate={[['harvest', id], ['harvests'], ['matches', id]]}
              success="Your harvest is listed. Buyers that fit are shown below."
            />
          ) : firstOpen ? (
            <Button asChild size="lg">
              <Link href={withFarmer(`/offers/${firstOpen.id}`, ctx)}>Review the offer</Link>
            </Button>
          ) : fullyBooked && h.bookings ? (
            <Button asChild size="lg">
              <Link href={withFarmer('/bookings', ctx)}>See your plan</Link>
            </Button>
          ) : datesPassed && editable ? (
            <Button asChild size="lg">
              <Link href={withFarmer(`/farmer/harvests/${h.id}/edit`, ctx)}>Change the dates</Link>
            </Button>
          ) : null;
        return (
          <div className="flex flex-col gap-6">
            <PageHeader
              eyebrow={
                <Link href={withFarmer('/farmer/harvests', ctx)} className="underline">
                  Your harvests
                </Link>
              }
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {formatKg(h.eligibleQuantityKg)} of cassava <StatusBadge kind="harvest" status={h.status} /> {h.isDemo ? <DemoTag /> : null}
                </span>
              }
              description={
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-4" aria-hidden /> {h.farmLocation.label}, {h.farmLocation.lga}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-4" aria-hidden /> Ready <DateOnly date={h.earliestHarvestDate} /> – <DateOnly date={h.latestHarvestDate} />
                  </span>
                  <span>{h.reference}</span>
                </span>
              }
            />
            {params.get('saved') ? (
              <Alert tone="success" title="Saved">
                {h.status === 'PUBLISHED' ? 'Your harvest is listed. Send a request to a buyer below.' : 'Saved. Choose “Find buyers” when you are ready.'}
              </Alert>
            ) : null}
            <NextStepCard stage={h.nextStep.stage} forYou={h.nextStep.forFarmer} action={action}>
              {h.allocation.state !== 'UNALLOCATED' ? (
                <p className="text-sm text-muted">
                  {formatKg(h.allocation.allocatedKg)} of {formatKg(h.allocation.eligibleKg)} booked · {formatKg(h.allocation.remainingKg)} still for sale
                </p>
              ) : null}
            </NextStepCard>
            <Offers h={h} ctx={ctx} />
            <Buyers h={h} ctx={ctx} />
            {editable && ['DRAFT', 'PUBLISHED', 'CLOSED'].includes(h.status) ? (
              <details className="rounded-2xl border border-line bg-surface p-5">
                <summary className="cursor-pointer text-sm font-medium text-ink">Change or stop this harvest</summary>
                <div className="mt-4 flex flex-wrap gap-2">
                  {['DRAFT', 'PUBLISHED'].includes(h.status) ? (
                    <Button asChild variant="outline">
                      <Link href={withFarmer(`/farmer/harvests/${h.id}/edit`, ctx)}>Change details or dates</Link>
                    </Button>
                  ) : null}
                  {h.status === 'PUBLISHED' ? (
                    <ReasonActionDialog
                      trigger="Stop taking offers"
                      title="Stop taking offers?"
                      description="Open offers lapse. Agreed plans are not affected."
                      confirmLabel="Stop taking offers"
                      path={`/harvests/${h.id}/close`}
                      body={{ expectedVersion: h.version }}
                      invalidate={[['harvest', id], ['harvests']]}
                      success="No new offers will come in"
                    />
                  ) : null}
                  {h.bookings === 0 ? (
                    <ReasonActionDialog
                      trigger="Remove this harvest"
                      title="Remove this harvest?"
                      description="Use this if the cassava is no longer for sale."
                      confirmLabel="Remove harvest"
                      path={`/harvests/${h.id}/withdraw`}
                      body={{ expectedVersion: h.version }}
                      invalidate={[['harvest', id], ['harvests']]}
                      success="Harvest removed"
                    />
                  ) : null}
                </div>
              </details>
            ) : null}
            {h.createdBy.viaCooperative ? <p className="text-xs text-muted">Added by {h.createdBy.displayName} for {h.farmerName}, via {h.createdBy.viaCooperative}.</p> : null}
          </div>
        );
      }}
    </QueryView>
  );
}

export default function HarvestDetailPage() {
  return <FarmerGate>{(ctx) => <HarvestDetail ctx={ctx} />}</FarmerGate>;
}
