'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, MapPin, Phone, Scale } from 'lucide-react';
import { LOT_STATUS_LABELS, PARTY_LABELS, type BookingDetail } from '@harvestslot/contracts';
import { ActingForBanner } from '@/components/domain/banners';
import { ReadinessChecklist, Timeline, TermsSummary } from '@/components/domain/booking-parts';
import { AmendDialog, bookingKeys, ConfirmPanel, DeliveryPanel, Documents, HarvestProgress, Incidents, Messages, PickupPanel, TransportPanel } from '@/components/domain/booking-sections';
import { ReasonActionDialog } from '@/components/domain/dialogs';
import { DemoTag, Kg, StatusBadge, When } from '@/components/domain/display';
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

function Overview({ b }: { b: BookingDetail }) {
  const viewer = b.viewerParties.includes('FARMER') ? 'farmer' : b.viewerParties.includes('PROCESSOR') ? 'processor' : b.viewerParties.includes('TRANSPORTER') ? 'transporter' : 'other';
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-6">
        {['CONFIRMED', 'ACTIVE', 'AWAITING_CONFIRMATIONS'].includes(b.status) ? (
          <a href="#readiness" className={`flex items-center justify-between rounded-lg border p-3 text-sm font-semibold lg:hidden ${b.readiness.ready ? 'border-leaf-100 bg-leaf-50 text-forest' : 'border-amber-100 bg-amber-50 text-amber-ink'}`}>
            {b.readiness.ready ? 'Ready to harvest' : `Not ready — ${b.readiness.checks.filter((c) => !c.passed).length} check(s) outstanding`}
            <span className="text-xs font-medium underline">See checks</span>
          </a>
        ) : null}
        <HarvestProgress b={b} />
        <ConfirmPanel b={b} />
        <PickupPanel b={b} />
        <DeliveryPanel b={b} />
        {b.allowedActions.includes('receiving') || b.status === 'COMPLETED' || b.harvestLot?.status === 'DELIVERED' ? (
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
        <TransportPanel b={b} />
      </div>
      <aside className="flex flex-col gap-6">
        <Card>
          <CardContent>
            <ReadinessChecklist readiness={b.readiness} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pickup and delivery</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="flex gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <strong>{b.pickupLocation.label}</strong>, {b.pickupLocation.community ? `${b.pickupLocation.community}, ` : ''}
                {b.pickupLocation.lga}
                {b.pickupLocation.directions ? <span className="block text-muted">{b.pickupLocation.directions}</span> : null}
                {b.pickupLocation.exact ? (
                  <a className="mt-1 inline-flex items-center gap-1 text-leaf underline" href={mapLink(b.pickupLocation.exact)} target="_blank" rel="noopener noreferrer">
                    Exact point{b.pickupLocation.exact.accuracyM !== null ? ` (±${b.pickupLocation.exact.accuracyM} m)` : ''} <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : (
                  <span className="block text-xs text-muted">Exact point shown to participants once confirmed.</span>
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
            {b.harvestLot ? (
              <p>
                Harvest: <strong>{LOT_STATUS_LABELS[b.harvestLot.status]}</strong>
                {b.harvestLot.reportedHarvestedKg ? (
                  <>
                    {' '}
                    · <Kg kg={b.harvestLot.reportedHarvestedKg} /> reported
                  </>
                ) : null}
              </p>
            ) : null}
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
                  <a className="inline-flex items-center gap-1 text-leaf underline" href={`tel:${c.phone}`}>
                    <Phone className="size-3.5" aria-hidden /> {c.phone}
                  </a>
                ) : null}
              </p>
            ))}
            <p className="text-xs text-muted">Phone numbers are shared only while a booking is confirmed or active.</p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

export default function BookingPage() {
  const { id } = useParams<{ id: string }>();
  const q = useApi<BookingDetail>(['booking', id], `/bookings/${id}`);
  useBookingEvents(id);
  useEffect(() => {
    // Notification links point at #transport, #pickup or #messages.
    if (q.data && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [q.data]);
  return (
    <QueryView query={q} loadingLabel="Loading booking…">
      {(b) => (
        <div className="flex flex-col gap-6">
          {b.viewerActingFor ? <ActingForBanner farmerName={b.viewerActingFor.farmerName} cooperativeName={b.viewerActingFor.cooperativeName} scopes={b.viewerActingFor.scopes} /> : null}
          <PageHeader
            eyebrow={
              <Link href="/bookings" className="underline">
                Bookings
              </Link>
            }
            title={
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{b.reference}</span> <StatusBadge kind="booking" status={b.status} /> {b.isDemo ? <DemoTag /> : null}
              </span>
            }
            description={`${b.current.content.farmer.displayName} → ${b.current.content.processor.name}`}
            actions={
              <>
                {b.allowedActions.includes('proposeAmendment') ? <AmendDialog b={b} /> : null}
                {b.allowedActions.includes('openDispute') ? (
                  <Button asChild variant="outline">
                    <Link href={`/disputes?new=${b.id}`}>Open a dispute</Link>
                  </Button>
                ) : null}
                {b.allowedActions.includes('cancel') ? (
                  <ReasonActionDialog
                    trigger="Cancel booking"
                    title="Cancel this booking?"
                    description="Reserved capacity, supply and transport are released and every party is told. The cancellation terms you agreed apply."
                    confirmLabel="Cancel booking"
                    path={`/bookings/${b.id}/cancel`}
                    body={{ expectedVersion: b.version }}
                    invalidate={[...bookingKeys(b.id)]}
                    success="Booking cancelled"
                  />
                ) : null}
              </>
            }
          />
          {b.cancelled ? (
            <Alert tone="danger" title={`Cancelled ${b.cancelled.by ? `by the ${PARTY_LABELS[b.cancelled.by].toLowerCase()}` : ''}`}>
              {b.cancelled.reason} · <When at={b.cancelled.at} />
            </Alert>
          ) : null}
          {b.status === 'EXPIRED' ? <Alert tone="info" title="Expired">Confirmations were not completed before the hold ran out. Nothing is reserved.</Alert> : null}
          <Tabs defaultValue={window.location.hash === '#messages' ? 'messages' : 'overview'}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="messages">Messages</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="problems">Problems ({b.incidents.filter((i) => i.status === 'OPEN').length})</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <Overview b={b} />
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
      )}
    </QueryView>
  );
}
