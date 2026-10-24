'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { REJECTION_HANDLING_LABELS, type HarvestDto, type OfferDto, type OfferVersionDto } from '@harvestslot/contracts';
import { ActingForBanner } from '@/components/domain/banners';
import { ReasonActionDialog } from '@/components/domain/dialogs';
import { DateOnly, DemoTag, Kg, Money, Price, ReviewedTag, StatusBadge, When, Window } from '@/components/domain/display';
import { OfferForm } from '@/components/domain/offer-form';
import { PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, DescriptionList, Dialog, DialogContent } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';
import { koboToNairaInput, nairaToKobo } from '@/lib/utils';

function VersionTerms({ v }: { v: OfferVersionDto }) {
  return (
    <DescriptionList
      items={[
        ['Quantity', <Kg key="q" kg={v.quantityKg} tonnes />],
        ['Price', <Price key="p" kobo={v.priceKoboPerKg} />],
        ['Estimated produce value', <Money key="m" kobo={v.estimatedProduceAmountKobo} />],
        ['Harvest date', <DateOnly key="d" date={v.plannedHarvestDate} />],
        ['Pickup', <Window key="pw" start={v.pickupWindowStart} end={v.pickupWindowEnd} />],
        ['Delivery', <Window key="dw" start={v.deliveryWindowStart} end={v.deliveryWindowEnd} />],
        ['Processing slot', `${v.slot.lineName}, from ${new Date(v.slot.startsAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })}`],
        ['Transport', v.freightPayer === 'PROCESSOR' ? 'Processor arranges and pays' : 'Farmer pays (price agreed separately)'],
        ['Tolerance', `±${v.toleranceBps / 100}%`],
        ['Payment', `Within ${v.paymentTermsDays} day(s) of the receiving decision`],
        ['Quality', `Delivered within ${v.qualityTerms.maxHoursHarvestToDelivery} h of harvest${v.qualityTerms.soilAndStemsRemoved ? '; soil and stems removed' : ''}${v.qualityTerms.maxVisibleRotPercent !== undefined ? `; ≤${v.qualityTerms.maxVisibleRotPercent}% rot` : ''}`],
        ['Rejected cassava', REJECTION_HANDLING_LABELS[v.rejectionHandling]],
        ['Cancellation', v.cancellationTerms],
      ]}
    />
  );
}

function CounterDialog({ offer }: { offer: OfferDto }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(offer.current.quantityKg);
  const [price, setPrice] = useState(koboToNairaInput(offer.current.priceKoboPerKg));
  const [date, setDate] = useState(offer.current.plannedHarvestDate);
  const [note, setNote] = useState('');
  const counter = useAction({
    request: () => ({ path: `/offers/${offer.id}/counter`, body: { expectedVersionNo: offer.currentVersionNo, quantityKg: qty, priceKoboPerKg: nairaToKobo(price) ?? 0, plannedHarvestDate: date, note: note || undefined } }),
    invalidate: [['offer', offer.id], ['offers']],
    success: 'Counter-offer sent',
    toastErrors: false,
    onSuccess: () => setOpen(false),
  });
  return (
    <>
      <Button variant="outline" size="lg" onClick={() => setOpen(true)}>
        Propose different terms
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Counter-offer" description="The processor can accept, revise or decline. Other terms stay as offered.">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              counter.mutate();
            }}
          >
            {counter.error ? <Alert tone="danger">{counter.error.message}</Alert> : null}
            <Field label="Quantity (kg)" error={counter.error?.fieldErrors.quantityKg}>
              <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label="Price (₦ per kg)" error={counter.error?.fieldErrors.priceKoboPerKg}>
              <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
            <Field label="Harvest date">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Message (optional)">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
            </Field>
            <Button type="submit" loading={counter.isPending} disabled={nairaToKobo(price) === null}>
              Send counter-offer
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FarmerActions({ offer }: { offer: OfferDto }) {
  const router = useRouter();
  const { me } = useSession();
  const acting = me?.represented.find((r) => r.farmerProfileId === offer.farmerProfileId && r.farmerProfileId !== me.farmerProfile?.id);
  const canApprove = !acting || acting.scopes.includes('APPROVE_SALE');
  const canPrepare = acting?.scopes.includes('ASSIST_DATA_ENTRY');
  const accept = useAction<void, { bookingId: string }>({
    request: () => ({ path: `/offers/${offer.id}/${canApprove ? 'accept' : 'prepare-acceptance'}`, body: { expectedVersionNo: offer.currentVersionNo } }),
    invalidate: [['offer', offer.id], ['offers'], ['bookings'], ['harvests']],
    success: canApprove ? 'Accepted — now confirm the booking terms' : 'Prepared for the farmer to approve',
    onSuccess: (r) => router.push(`/bookings/${r.bookingId}`),
  });
  if (offer.awaiting !== 'FARMER' || !['OPEN', 'COUNTERED'].includes(offer.status)) return null;
  return (
    <Card className="border-forest">
      <CardHeader>
        <CardTitle>Your decision</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Accepting reserves the processing slot for you and creates a booking. Transport is arranged next; <strong>do not harvest</strong> until the booking shows “Ready to harvest”.
        </p>
        {acting && !canApprove ? <Alert tone="info">You can prepare this acceptance. {offer.farmerName} must approve it before it becomes binding.</Alert> : null}
        <div className="flex flex-wrap gap-2">
          {canApprove || canPrepare ? (
            <Button size="lg" onClick={() => accept.mutate()} loading={accept.isPending}>
              <CheckCircle2 className="size-5" aria-hidden /> {canApprove ? 'Accept this offer' : 'Prepare acceptance'}
            </Button>
          ) : null}
          {canApprove ? <CounterDialog offer={offer} /> : null}
          {canApprove ? (
            <ReasonActionDialog trigger="Decline" triggerSize="lg" title="Decline this offer?" confirmLabel="Decline offer" path={`/offers/${offer.id}/decline`} body={{ expectedVersionNo: offer.currentVersionNo }} reasonOptional invalidate={[['offer', offer.id], ['offers']]} success="Offer declined" />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ProcessorActions({ offer }: { offer: OfferDto }) {
  const router = useRouter();
  const { workspace } = useSession();
  const [revising, setRevising] = useState(false);
  const harvest = useApi<HarvestDto>(['harvest', offer.harvestRequestId], revising ? `/harvests/${offer.harvestRequestId}` : null);
  const acceptCounter = useAction<void, { bookingId: string }>({
    request: () => ({ path: `/offers/${offer.id}/accept-counter`, body: { expectedVersionNo: offer.currentVersionNo } }),
    invalidate: [['offer', offer.id], ['offers']],
    success: 'Counter-offer accepted — booking created',
    onSuccess: (r) => router.push(`/bookings/${r.bookingId}`),
  });
  if (!['OPEN', 'COUNTERED'].includes(offer.status) || workspace?.kind !== 'processor') return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{offer.awaiting === 'PROCESSOR' ? 'The farmer proposed different terms' : 'Waiting for the farmer'}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {offer.awaiting === 'PROCESSOR' ? (
          <Button onClick={() => acceptCounter.mutate()} loading={acceptCounter.isPending}>
            Accept the farmer’s terms
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => setRevising(true)}>
          Revise offer
        </Button>
        <ReasonActionDialog trigger="Withdraw offer" title="Withdraw this offer?" confirmLabel="Withdraw" path={`/offers/${offer.id}/withdraw`} body={{ expectedVersionNo: offer.currentVersionNo }} reasonOptional invalidate={[['offer', offer.id], ['offers']]} success="Offer withdrawn" />
        <Dialog open={revising} onOpenChange={setRevising}>
          <DialogContent title="Revise offer" wide>
            {harvest.data ? (
              <OfferForm
                orgId={offer.processorOrgId}
                revise={offer}
                harvest={{ harvestRequestId: harvest.data.id, remainingKg: harvest.data.allocation.remainingKg, earliestHarvestDate: harvest.data.earliestHarvestDate, latestHarvestDate: harvest.data.latestHarvestDate, transportPreference: harvest.data.transportPreference, minPriceKoboPerKg: harvest.data.minPriceKoboPerKg }}
                onDone={() => setRevising(false)}
              />
            ) : (
              <p className="text-sm text-muted">Loading…</p>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
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
        return (
          <div className="flex flex-col gap-6">
            {acting ? <ActingForBanner farmerName={acting.displayName} cooperativeName={acting.cooperativeName} scopes={acting.scopes} /> : null}
            <PageHeader
              eyebrow={`Offer for request ${o.harvestReference}`}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {asProcessor ? o.farmerName : o.processorName} <StatusBadge kind="offer" status={o.status} /> {o.isDemo ? <DemoTag /> : null}
                </span>
              }
              description={
                <>
                  {o.facility.name}, {o.facility.lga}
                  {o.straightLineKm !== null ? ` · about ${Math.round(o.straightLineKm)} km straight-line from the farm` : ''}
                </>
              }
            />
            {!asProcessor ? <ReviewedTag approved={o.processorVerified} /> : null}
            {['OPEN', 'COUNTERED'].includes(o.status) ? (
              <Alert tone="warning" title={`Open until ${new Date(o.expiresAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })}`}>
                After this time the offer expires automatically and nothing is reserved.
              </Alert>
            ) : null}
            {o.bookingId ? (
              <Alert tone="success" title="This offer became a booking">
                <Link className="underline" href={`/bookings/${o.bookingId}`}>
                  Open the booking
                </Link>
              </Alert>
            ) : null}
            {o.decisionReason ? <Alert tone="info" title="Reason given">{o.decisionReason}</Alert> : null}
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>Current terms (version {o.currentVersionNo})</CardTitle>
                  <Badge tone="neutral">
                    Proposed by {o.current.proposedBy === 'PROCESSOR' ? 'the processor' : 'the farmer'}
                    {o.current.actingForFarmer ? ' (via cooperative)' : ''}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <VersionTerms v={o.current} />
                {o.current.note ? <p className="rounded-lg bg-canvas p-3 text-sm">“{o.current.note}” — {o.current.proposedByName}</p> : null}
                {!asProcessor ? <p className="text-xs text-muted">The HarvestSlot service fee is paid by the processor, never by you.</p> : null}
              </CardContent>
            </Card>
            {asProcessor ? <ProcessorActions offer={o} /> : <FarmerActions offer={o} />}
            {o.versions.length > 1 ? (
              <details className="rounded-xl border border-line bg-surface p-4">
                <summary className="cursor-pointer font-medium">Negotiation history ({o.versions.length} versions)</summary>
                <ol className="mt-3 flex flex-col gap-3">
                  {o.versions
                    .slice()
                    .reverse()
                    .map((v) => (
                      <li key={v.versionNo} className="rounded-lg border border-line p-3 text-sm">
                        <p className="font-medium">
                          Version {v.versionNo} · {v.proposedByName} · <When at={v.createdAt} />
                        </p>
                        <p>
                          <Kg kg={v.quantityKg} /> at <Price kobo={v.priceKoboPerKg} />, harvest <DateOnly date={v.plannedHarvestDate} />
                        </p>
                        {v.note ? <p className="text-muted">“{v.note}”</p> : null}
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
