'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { CalendarDays, CheckCircle2, Factory, MapPin, Scale, Truck, Wallet } from 'lucide-react';
import { formatKg, formatNaira, REJECTION_HANDLING_LABELS, type HarvestDto, type OfferDto } from '@harvestslot/contracts';
import { ActingForBanner } from '@/components/domain/banners';
import { ReasonActionDialog } from '@/components/domain/dialogs';
import { DateOnly, DemoTag, Price, ReviewedTag, StatusBadge, When, Window } from '@/components/domain/display';
import { NextStepCard } from '@/components/domain/next-step';
import { OfferForm } from '@/components/domain/offer-form';
import { PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Alert, Dialog, DialogContent } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';

const LIVE = ['OPEN', 'COUNTERED'];

/** Every material term on one screen, in the order a farmer weighs them. */
function OfferTerms({ o, asProcessor }: { o: OfferDto; asProcessor: boolean }) {
  const v = o.current;
  const collect = v.handoverArrangement === 'COLLECT_FROM_FARM';
  const window = collect ? { start: v.pickupWindowStart, end: v.pickupWindowEnd } : { start: v.deliveryWindowStart, end: v.deliveryWindowEnd };
  const net = v.farmerDeliveryCostKobo ? v.estimatedProduceAmountKobo - v.farmerDeliveryCostKobo : null;
  const rows: Array<{ icon: ReactNode; label: string; value: ReactNode; note?: ReactNode }> = [
    { icon: <Factory className="size-4" />, label: 'Buyer', value: <>{o.processorName}</>, note: !asProcessor ? <ReviewedTag approved={o.processorVerified} /> : null },
    { icon: <Scale className="size-4" />, label: 'Quantity', value: formatKg(v.quantityKg) },
    { icon: <Wallet className="size-4" />, label: 'Price', value: <Price kobo={v.priceKoboPerKg} /> },
    { icon: <CalendarDays className="size-4" />, label: 'Date', value: <Window start={window.start} end={window.end} /> },
    {
      icon: <Truck className="size-4" />,
      label: 'Who brings the cassava',
      value: v.handoverArrangement ? (collect ? `${asProcessor ? 'You collect' : 'They collect'} from the farm` : `${asProcessor ? 'The farmer delivers' : 'You deliver'} to ${o.facility.name}`) : 'Not decided yet (draft)',
    },
    { icon: <MapPin className="size-4" />, label: 'Where', value: v.handoverPlace ?? '—' },
    {
      icon: <Wallet className="size-4" />,
      label: asProcessor ? 'Cost to the farmer' : 'Cost to you',
      value: !v.handoverArrangement ? '—' : collect ? 'None — the buyer collects' : v.farmerDeliveryCostKobo ? `About ${formatNaira(v.farmerDeliveryCostKobo)} for delivery (paid by the farmer, not through HarvestSlot)` : 'The farmer arranges and pays for delivery',
    },
  ];
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-1 border-b border-line bg-leaf-50 px-5 py-5 sm:px-6">
        <p className="text-[13px] font-medium text-forest">Estimated total</p>
        <p className="text-[2rem] font-semibold leading-tight tracking-tight text-ink">{formatNaira(v.estimatedProduceAmountKobo)}</p>
        <p className="text-[13px] text-muted">
          {formatKg(v.quantityKg)} × <Price kobo={v.priceKoboPerKg} />. The final amount uses the weight the buyer accepts.
          {net !== null ? ` After the estimated delivery cost: about ${formatNaira(net)}.` : ''}
        </p>
      </div>
      {/* A definition list may only group dt/dd pairs, so the icon sits inside the dt. */}
      <dl className="divide-y divide-line">
        {rows.map((r) => (
          <div key={r.label} className="relative min-w-0 py-3.5 pl-16 pr-5 sm:pl-[4.25rem] sm:pr-6">
            <dt className="text-[13px] text-muted">
              <span className="absolute left-5 top-4 grid size-8 place-items-center rounded-lg bg-canvas text-muted ring-1 ring-line sm:left-6" aria-hidden>
                {r.icon}
              </span>
              {r.label}
            </dt>
            <dd className="text-[15px] font-medium text-ink">{r.value}</dd>
            {r.note ? <dd className="mt-1">{r.note}</dd> : null}
          </div>
        ))}
      </dl>
      <p className="border-t border-line px-5 py-3.5 text-[13px] text-muted sm:px-6">
        Paid within {v.paymentTermsDays} day{v.paymentTermsDays === 1 ? '' : 's'} of weighing, directly by the buyer. The HarvestSlot fee is paid by the buyer, never by you.
      </p>
      <details className="border-t border-line px-5 py-3.5 text-sm sm:px-6">
        <summary className="cursor-pointer font-medium text-muted hover:text-ink">Quality and other terms</summary>
        <ul className="mt-2 list-disc pl-5 text-muted">
          <li>
            Delivered within {v.qualityTerms.maxHoursHarvestToDelivery} h of harvest{v.qualityTerms.soilAndStemsRemoved ? '; soil and stems removed' : ''}
            {v.qualityTerms.maxVisibleRotPercent !== undefined ? `; at most ${v.qualityTerms.maxVisibleRotPercent}% visible rot` : ''}.
          </li>
          <li>Quantity may differ by up to {v.toleranceBps / 100}% without a new agreement.</li>
          <li>Cassava not accepted: {REJECTION_HANDLING_LABELS[v.rejectionHandling].toLowerCase()}.</li>
          <li>{v.cancellationTerms}</li>
        </ul>
      </details>
      {v.note ? <p className="border-t border-line px-5 py-3.5 text-sm text-ink sm:px-6">“{v.note}” — {v.proposedByName}</p> : null}
    </section>
  );
}

function FarmerDecision({ offer }: { offer: OfferDto }) {
  const router = useRouter();
  const { me } = useSession();
  const acting = me?.represented.find((r) => r.farmerProfileId === offer.farmerProfileId && r.farmerProfileId !== me.farmerProfile?.id);
  const canApprove = !acting || acting.scopes.includes('APPROVE_SALE');
  const canPrepare = acting?.scopes.includes('ASSIST_DATA_ENTRY');
  const accept = useAction<void, { bookingId: string }>({
    request: () => ({ path: `/offers/${offer.id}/${canApprove ? 'accept' : 'prepare-acceptance'}`, body: { expectedVersionNo: offer.currentVersionNo } }),
    invalidate: [['offer', offer.id], ['offers'], ['bookings'], ['harvests'], ['harvest', offer.harvestRequestId]],
    success: canApprove ? 'Accepted — your plan is confirmed' : 'Prepared for the farmer to approve',
    toastErrors: false,
    onSuccess: (r) => router.push(`/bookings/${r.bookingId}?accepted=1`),
  });
  if (offer.awaiting !== 'FARMER' || !LIVE.includes(offer.status)) return null;
  return (
    <NextStepCard
      stage="Your decision"
      forYou={canApprove ? `Accept to confirm the plan with ${offer.processorName}, or decline to keep your harvest available to other buyers.` : `You can prepare this acceptance. ${offer.farmerName} must approve it before it is agreed.`}
      action={
        canApprove || canPrepare ? (
          <Button size="lg" onClick={() => accept.mutate()} loading={accept.isPending}>
            <CheckCircle2 className="size-5" aria-hidden /> {canApprove ? 'Accept offer' : 'Prepare acceptance'}
          </Button>
        ) : null
      }
      secondary={
        canApprove ? (
          <ReasonActionDialog
            trigger="Decline"
            triggerSize="lg"
            title="Decline this offer?"
            description="Your harvest stays listed, so other buyers can still make offers."
            confirmLabel="Decline offer"
            path={`/offers/${offer.id}/decline`}
            body={{ expectedVersionNo: offer.currentVersionNo }}
            reasonOptional
            reasonLabel="Reason (optional, the buyer sees it)"
            invalidate={[['offer', offer.id], ['offers'], ['harvest', offer.harvestRequestId]]}
            success="Offer declined. Your harvest is still available."
            onDone={() => router.push(`/farmer/harvests/${offer.harvestRequestId}`)}
          />
        ) : null
      }
    >
      {accept.error ? (
        <Alert tone="danger" title={accept.error.code === 'OFFER_EXPIRED' ? 'This offer has expired' : accept.error.code === 'CAPACITY_EXCEEDED' || accept.error.code === 'HOLD_EXPIRED' ? 'The buyer no longer has room for this' : 'Could not accept'}>
          {accept.error.message}{' '}
          <Link className="underline" href={`/farmer/harvests/${offer.harvestRequestId}`}>
            Back to your harvest
          </Link>
        </Alert>
      ) : (
        <p className="text-[13px] text-muted">
          Answer before <When at={offer.expiresAt} />. After that the offer expires and nothing is reserved.
        </p>
      )}
    </NextStepCard>
  );
}

function ProcessorPanel({ offer }: { offer: OfferDto }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const harvest = useApi<HarvestDto>(['harvest', offer.harvestRequestId], editing ? `/harvests/${offer.harvestRequestId}` : null);
  const acceptCounter = useAction<void, { bookingId: string }>({
    request: () => ({ path: `/offers/${offer.id}/accept-counter`, body: { expectedVersionNo: offer.currentVersionNo } }),
    invalidate: [['offer', offer.id], ['offers'], ['inbox']],
    success: 'Accepted — the plan is confirmed',
    onSuccess: (r) => router.push(`/bookings/${r.bookingId}`),
  });
  const stage =
    offer.status === 'DRAFT'
      ? 'Draft — not sent yet'
      : offer.status === 'OPEN'
        ? 'Waiting for the farmer'
        : offer.status === 'COUNTERED'
          ? 'The farmer proposed different terms'
          : offer.status === 'ACCEPTED'
            ? 'Accepted — the plan is confirmed'
            : offer.status === 'EXPIRED'
              ? 'Expired — the farmer did not answer in time'
              : offer.status === 'DECLINED'
                ? 'Declined by the farmer'
                : offer.status === 'LAPSED'
                  ? 'Lapsed — the farmer sold this cassava elsewhere'
                  : 'Withdrawn';
  const forYou = offer.status === 'DRAFT' ? 'Decide how the cassava will get there, then send the offer.' : offer.status === 'COUNTERED' ? 'Accept the farmer’s terms, or update your offer.' : null;
  const waitingFor = offer.status === 'OPEN' ? `Waiting for ${offer.farmerName} to accept or decline. Capacity is held until ${new Date(offer.expiresAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })}.` : null;
  return (
    <>
      <NextStepCard
        stage={stage}
        forYou={forYou}
        waitingFor={waitingFor}
        tone={LIVE.includes(offer.status) || offer.status === 'DRAFT' ? 'action' : 'done'}
        action={
          offer.bookingId ? (
            <Button asChild size="lg">
              <Link href={`/bookings/${offer.bookingId}`}>Open the booking</Link>
            </Button>
          ) : offer.status === 'COUNTERED' ? (
            <Button size="lg" onClick={() => acceptCounter.mutate()} loading={acceptCounter.isPending}>
              Accept the farmer’s terms
            </Button>
          ) : offer.status === 'DRAFT' ? (
            <Button size="lg" onClick={() => setEditing(true)}>
              Finish and send
            </Button>
          ) : null
        }
        secondary={
          ['DRAFT', 'OPEN', 'COUNTERED'].includes(offer.status) ? (
            <>
              {offer.status !== 'DRAFT' ? (
                <Button variant="outline" size="lg" onClick={() => setEditing(true)}>
                  Update offer
                </Button>
              ) : null}
              <ReasonActionDialog
                trigger={offer.status === 'DRAFT' ? 'Delete draft' : 'Withdraw offer'}
                triggerSize="lg"
                title={offer.status === 'DRAFT' ? 'Delete this draft?' : 'Withdraw this offer?'}
                confirmLabel={offer.status === 'DRAFT' ? 'Delete draft' : 'Withdraw'}
                path={`/offers/${offer.id}/withdraw`}
                body={{ expectedVersionNo: offer.currentVersionNo }}
                reasonOptional
                invalidate={[['offer', offer.id], ['offers'], ['inbox']]}
                success={offer.status === 'DRAFT' ? 'Draft deleted' : 'Offer withdrawn; the farmer has been told'}
              />
            </>
          ) : null
        }
      />
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent title={offer.status === 'DRAFT' ? 'Finish your offer' : 'Update your offer'} wide>
          {harvest.data ? (
            <OfferForm
              orgId={offer.processorOrgId}
              existing={offer}
              request={{
                harvestRequestId: harvest.data.id,
                reference: harvest.data.reference,
                farmerName: harvest.data.farmerName,
                farmLabel: harvest.data.farmLocation.label,
                lga: harvest.data.farmLocation.lga,
                remainingKg: harvest.data.allocation.remainingKg,
                earliestHarvestDate: harvest.data.earliestHarvestDate,
                latestHarvestDate: harvest.data.latestHarvestDate,
              }}
              onDone={() => setEditing(false)}
            />
          ) : (
            <p className="text-sm text-muted">Loading…</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function OfferPage() {
  const { id } = useParams<{ id: string }>();
  const { workspace, me } = useSession();
  const q = useApi<OfferDto>(['offer', id], `/offers/${id}`);
  return (
    <QueryView query={q}>
      {(o) => {
        const asProcessor = workspace?.kind === 'processor' && workspace.orgId === o.processorOrgId;
        const acting = !asProcessor ? me?.represented.find((r) => r.farmerProfileId === o.farmerProfileId && r.farmerProfileId !== me.farmerProfile?.id) : undefined;
        const ended = !LIVE.includes(o.status) && o.status !== 'DRAFT' && !o.bookingId;
        return (
          <div className="mx-auto flex max-w-2xl flex-col gap-6">
            {acting ? <ActingForBanner farmerName={acting.displayName} cooperativeName={acting.cooperativeName} scopes={acting.scopes} /> : null}
            <PageHeader
              eyebrow={
                asProcessor ? (
                  <Link href="/processor/inbox" className="underline">
                    Requests
                  </Link>
                ) : (
                  <Link href={`/farmer/harvests/${o.harvestRequestId}`} className="underline">
                    Your harvest {o.harvestReference}
                  </Link>
                )
              }
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {asProcessor ? `Offer to ${o.farmerName}` : `Offer from ${o.processorName}`} <StatusBadge kind="offer" status={o.status} /> {o.isDemo ? <DemoTag /> : null}
                </span>
              }
              description={
                <>
                  {o.facility.name}, {o.facility.lga}
                  {o.straightLineKm !== null ? ` · about ${Math.round(o.straightLineKm)} km from the farm` : ''}
                </>
              }
            />
            {asProcessor ? (
              <ProcessorPanel offer={o} />
            ) : o.bookingId ? (
              <NextStepCard stage="Accepted — your plan is confirmed" forYou="See what happens next on your plan." action={<Button asChild size="lg"><Link href={`/bookings/${o.bookingId}`}>See your plan</Link></Button>} />
            ) : ended ? (
              <NextStepCard
                stage={o.status === 'EXPIRED' ? 'This offer expired' : o.status === 'DECLINED' ? 'You declined this offer' : o.status === 'WITHDRAWN' ? 'The buyer withdrew this offer' : 'This offer is no longer available'}
                forYou="Your harvest is still listed. Ask another buyer, or wait for new offers."
                tone="done"
                action={
                  <Button asChild size="lg">
                    <Link href={`/farmer/harvests/${o.harvestRequestId}`}>Find other buyers</Link>
                  </Button>
                }
              />
            ) : null}
            <OfferTerms o={o} asProcessor={asProcessor} />
            {!asProcessor ? <FarmerDecision offer={o} /> : null}
            {o.decisionReason ? <Alert tone="info" title="Reason given">{o.decisionReason}</Alert> : null}
            {o.versions.length > 1 ? (
              <details className="rounded-2xl border border-line bg-surface p-4 text-sm">
                <summary className="cursor-pointer font-medium">Earlier versions ({o.versions.length - 1})</summary>
                <ol className="mt-3 flex flex-col gap-2">
                  {o.versions
                    .slice(0, -1)
                    .reverse()
                    .map((v) => (
                      <li key={v.versionNo} className="rounded-lg border border-line p-3">
                        Version {v.versionNo} · {v.proposedByName} · <When at={v.createdAt} />: {formatKg(v.quantityKg)} at <Price kobo={v.priceKoboPerKg} />, <DateOnly date={v.plannedHarvestDate} />
                      </li>
                    ))}
                </ol>
              </details>
            ) : null}
          </div>
        );
      }}
    </QueryView>
  );
}
