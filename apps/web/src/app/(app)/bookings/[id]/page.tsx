'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, MapPin, Phone, Scale } from 'lucide-react';
import { PARTY_LABELS, type BookingDetail } from '@harvestslot/contracts';
import { ActingForBanner } from '@/components/domain/banners';
import { ReadinessChecklist, Timeline, TermsSummary } from '@/components/domain/booking-parts';
import { AmendDialog, bookingKeys, ConfirmPanel, DeliveryPanel, Documents, HarvestProgress, Incidents, Messages, PickupPanel, TransportPanel } from '@/components/domain/booking-sections';
import { ReasonActionDialog } from '@/components/domain/dialogs';
import { DemoTag, StatusBadge, When } from '@/components/domain/display';
import { NextStepCard } from '@/components/domain/next-step';
import { ConfirmPaymentActions, PlanCard, RecordPaymentButton, RecordWeightButton, ReviewWeightActions, SaleTimeline, WeightResult } from '@/components/domain/sale';
import { PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';

/** Live updates: the API emits `booking.updated` when anything on the booking changes. */
function useBookingEvents(id: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource(`/api/v1/bookings/${id}/events`, { withCredentials: true });
    let first = true;
    es.addEventListener('booking.updated', () => {
      if (first) {
        first = false;
        return;
      }
      for (const key of bookingKeys(id)) void qc.invalidateQueries({ queryKey: key });
    });
    return () => es.close();
  }, [id, qc]);
}

function mapLink(p: { lat: number; lng: number }) {
  return `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=16/${p.lat}/${p.lng}`;
}

/** The one prominent next action for this viewer (and, for the farmer, a pending payment to confirm). */
function NextActions({ b }: { b: BookingDetail }) {
  const a = b.allowedActions;
  return (
    <>
      {a.includes('recordWeight') ? <RecordWeightButton b={b} /> : null}
      {a.includes('reviewWeight') ? <ReviewWeightActions b={b} /> : null}
      {a.includes('confirmPayment') && !a.includes('reviewWeight') ? <ConfirmPaymentActions b={b} /> : null}
      {a.includes('recordPayment') && !a.includes('recordWeight') ? <RecordPaymentButton b={b} /> : null}
    </>
  );
}

function Details({ b }: { b: BookingDetail }) {
  const viewer = b.viewerParties.includes('FARMER') ? 'farmer' : b.viewerParties.includes('PROCESSOR') ? 'processor' : b.viewerParties.includes('TRANSPORTER') ? 'transporter' : 'other';
  const handover = Boolean(b.current.content.handover);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-6">
        <HarvestProgress b={b} />
        <ConfirmPanel b={b} />
        {handover ? null : (
          <>
            <PickupPanel b={b} />
            <DeliveryPanel b={b} />
          </>
        )}
        {b.allowedActions.includes('receiving') ? (
          <Alert tone="info" title="Receiving and quality" action={<Button asChild size="sm" variant="outline"><Link href={`/bookings/${b.id}/receiving`}>Open</Link></Button>}>
            Weights, quality decision and the farmer’s review.
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Agreed terms (version {b.current.versionNo})</CardTitle>
              <span className="font-mono text-xs text-muted" title="Fingerprint of exactly these terms">
                #{b.current.contentHash.slice(0, 12)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <TermsSummary terms={b.current.content} viewer={viewer} />
          </CardContent>
        </Card>
        {handover ? null : <TransportPanel b={b} />}
      </div>
      <aside className="flex flex-col gap-6">
        <Card>
          <CardContent>
            <ReadinessChecklist readiness={b.readiness} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Places</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <strong>{b.pickupLocation.label}</strong>, {b.pickupLocation.community ? `${b.pickupLocation.community}, ` : ''}
                {b.pickupLocation.lga}
                {b.pickupLocation.directions ? <span className="block text-muted">{b.pickupLocation.directions}</span> : null}
                {b.pickupLocation.exact ? (
                  <a className="mt-1 inline-flex items-center gap-1 text-forest underline" href={mapLink(b.pickupLocation.exact)} target="_blank" rel="noopener noreferrer">
                    Exact point{b.pickupLocation.exact.accuracyM !== null ? ` (±${b.pickupLocation.exact.accuracyM} m)` : ''} <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : (
                  <span className="block text-xs text-muted">The exact point is shown to the buyer once the plan is confirmed.</span>
                )}
              </span>
            </p>
            <p className="flex gap-2">
              <Scale className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {b.current.content.facility.name}
                {b.facilityLocation.address ? <span className="block text-muted">{b.facilityLocation.address}</span> : null}
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {b.contacts.map((c) => (
              <p key={c.party} className="flex flex-wrap items-center gap-2">
                <span className="text-muted">{PARTY_LABELS[c.party]}:</span> {c.name}
                {c.phone ? (
                  <a className="inline-flex items-center gap-1 text-forest underline" href={`tel:${c.phone}`}>
                    <Phone className="size-3.5" aria-hidden /> {c.phone}
                  </a>
                ) : null}
              </p>
            ))}
            <p className="text-xs text-muted">Phone numbers are shared only while a plan is confirmed or active.</p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

export default function BookingPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const q = useApi<BookingDetail>(['booking', id], `/bookings/${id}`);
  useBookingEvents(id);
  useEffect(() => {
    // Notification links point at #messages and similar anchors.
    if (q.data && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [q.data]);
  return (
    <QueryView query={q} loadingLabel="Loading…">
      {(b) => {
        const farmerView = b.viewerParties.includes('FARMER');
        const ns = b.nextStep;
        const done = ns.actor === 'NONE';
        return (
          <div className="flex flex-col gap-6">
            {b.viewerActingFor ? <ActingForBanner farmerName={b.viewerActingFor.farmerName} cooperativeName={b.viewerActingFor.cooperativeName} scopes={b.viewerActingFor.scopes} /> : null}
            <PageHeader
              eyebrow={
                <Link href="/bookings" className="underline">
                  {farmerView ? 'Your plans' : 'Bookings'}
                </Link>
              }
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {farmerView ? `Sale to ${b.current.content.processor.name}` : `Buying from ${b.current.content.farmer.displayName}`} <StatusBadge kind="booking" status={b.status} /> {b.isDemo ? <DemoTag /> : null}
                </span>
              }
              description={<span className="font-mono">{b.reference}</span>}
              actions={
                <>
                  {b.allowedActions.includes('openDispute') && !b.allowedActions.includes('reviewWeight') ? (
                    <Button asChild variant="outline">
                      <Link href={`/disputes?new=${b.id}`}>Report a problem</Link>
                    </Button>
                  ) : null}
                  {b.allowedActions.includes('proposeAmendment') ? <AmendDialog b={b} /> : null}
                  {b.allowedActions.includes('cancel') ? (
                    <ReasonActionDialog
                      trigger="Cancel"
                      title="Cancel this plan?"
                      description="The reserved quantity is released and the other side is told. The cancellation terms you agreed apply."
                      confirmLabel="Cancel the plan"
                      path={`/bookings/${b.id}/cancel`}
                      body={{ expectedVersion: b.version }}
                      invalidate={[...bookingKeys(b.id)]}
                      success="Cancelled"
                    />
                  ) : null}
                </>
              }
            />
            {params.get('accepted') && farmerView ? (
              <Alert tone="success" title="Offer accepted">
                {b.status === 'CONFIRMED' ? 'Your plan is confirmed. Keep this page — it is also on your home screen.' : 'Your acceptance is recorded.'}
              </Alert>
            ) : null}
            {b.cancelled ? (
              <Alert tone="danger" title={`Cancelled${b.cancelled.by ? ` by the ${PARTY_LABELS[b.cancelled.by].toLowerCase()}` : ''}`}>
                {b.cancelled.reason} · <When at={b.cancelled.at} />
              </Alert>
            ) : null}
            <PlanCard b={b} />
            <NextStepCard
              stage={ns.stage}
              forYou={ns.forViewer}
              waitingFor={ns.waitingFor}
              tone={done ? 'done' : 'action'}
              action={['recordWeight', 'reviewWeight', 'confirmPayment', 'recordPayment'].some((x) => b.allowedActions.includes(x)) ? <NextActions b={b} /> : undefined}
            />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <WeightResult b={b} />
              <SaleTimeline b={b} />
            </div>
            <Tabs defaultValue={typeof window !== 'undefined' && window.location.hash === '#messages' ? 'messages' : 'details'}>
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="messages">Messages</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="problems">Problems ({b.incidents.filter((i) => i.status === 'OPEN').length})</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
              <TabsContent value="details">
                <Details b={b} />
              </TabsContent>
              <TabsContent value="messages">
                <Messages b={b} />
              </TabsContent>
              <TabsContent value="documents">
                <Documents b={b} />
              </TabsContent>
              <TabsContent value="problems">
                <Incidents b={b} />
              </TabsContent>
              <TabsContent value="history">
                <Card>
                  <CardContent>
                    <Timeline events={b.timeline} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        );
      }}
    </QueryView>
  );
}
