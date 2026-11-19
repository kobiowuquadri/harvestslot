'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ExternalLink, LocateFixed, Phone } from 'lucide-react';
import { toast } from 'sonner';
import type { JobDto } from '@harvestslot/contracts';
import { ReasonActionDialog } from '@/components/domain/dialogs';
import { Kg, Money, StatusBadge, When, Window } from '@/components/domain/display';
import { PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives';
import { ApiError, uploadFile } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';

type Gps = { point: { lat: number; lng: number }; accuracyM: number; source: 'DEVICE_GPS' };

/** Best-effort GPS fix for milestones. Missing GPS never blocks a milestone; it is simply not attached. */
function currentGps(): Promise<Gps | undefined> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ point: { lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) }, accuracyM: Math.round(p.coords.accuracy), source: 'DEVICE_GPS' }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

const STEPS: Array<{ key: keyof JobDto['milestones']; label: string }> = [
  { key: 'enRouteAt', label: 'On the way to the farm' },
  { key: 'arrivedPickupAt', label: 'Arrived at the farm' },
  { key: 'collectedAt', label: 'Loaded' },
  { key: 'pickupConfirmedAt', label: 'Handover confirmed' },
  { key: 'departedAt', label: 'Left the farm' },
  { key: 'arrivedFacilityAt', label: 'Arrived at the facility' },
  { key: 'deliveredAt', label: 'Delivered' },
];

function Milestone({ job, action, label, path }: { job: JobDto; action: string; label: string; path: string }) {
  const [busy, setBusy] = useState(false);
  // The version travels with the click, so a tap right after a refresh never sends a stale one.
  const m = useAction<{ gps?: Gps; version: number }>({ request: ({ gps, version }) => ({ path: `/shipments/${job.shipmentId}/${path}`, body: { expectedVersion: version, ...(gps ? { gps } : {}) } }), invalidate: [['job', job.shipmentId]], success: `${label} — recorded` });
  if (!job.allowedActions.includes(action)) return null;
  return (
    <Button
      size="lg"
      className="w-full"
      loading={busy || m.isPending}
      onClick={async () => {
        const version = job.version;
        setBusy(true);
        const gps = await currentGps();
        setBusy(false);
        m.mutate({ gps, version });
      }}
    >
      {label}
    </Button>
  );
}

function Collection({ job }: { job: JobDto }) {
  const [qty, setQty] = useState(job.quantityKg);
  const [evidence, setEvidence] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const record = useAction<{ gps?: Gps; version: number }>({ request: ({ gps, version }) => ({ path: `/shipments/${job.shipmentId}/collection`, body: { expectedVersion: version, quantityKg: qty, evidenceAttachmentIds: evidence, ...(gps ? { gps } : {}) } }), invalidate: [['job', job.shipmentId]], success: 'Loading recorded. Ask the farmer to confirm or give you their code.' });
  if (!job.allowedActions.includes('recordCollection')) return null;
  return (
    <Card className="border-forest">
      <CardHeader>
        <CardTitle>Record what you loaded</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field label="Quantity loaded (kg)" hint="Your count. The facility weighs it again on arrival.">
          <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <label className="inline-flex w-fit cursor-pointer items-center rounded-lg border border-line-strong px-3 py-2 text-sm font-medium hover:bg-canvas">
          {uploading ? 'Uploading…' : `Add a photo of the load${evidence.length ? ` (${evidence.length} added)` : ''}`}
          <input
            type="file"
            className="sr-only"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setUploading(true);
              try {
                const a = await uploadFile<{ id: string }>(file, { purpose: 'PICKUP_EVIDENCE', bookingId: job.bookingId, capturedAt: new Date(file.lastModified).toISOString() });
                setEvidence((p) => [...p, a.id]);
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : 'Upload failed');
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
        <Button
          size="lg"
          loading={record.isPending}
          onClick={async () => {
            const version = job.version;
            record.mutate({ gps: await currentGps(), version });
          }}
        >
          Save loading
        </Button>
      </CardContent>
    </Card>
  );
}

function CodeEntry({ job, purpose }: { job: JobDto; purpose: 'pickup' | 'delivery' }) {
  const [code, setCode] = useState('');
  const enter = useAction({ request: () => ({ path: `/shipments/${job.shipmentId}/${purpose}-code`, body: { code } }), invalidate: [['job', job.shipmentId]], success: purpose === 'pickup' ? 'Handover confirmed with the farmer’s code' : 'Delivery confirmed with the facility’s code', toastErrors: false });
  return (
    <div className="flex flex-col gap-2">
      <Field label={purpose === 'pickup' ? 'Farmer’s 6-digit code' : 'Facility’s 6-digit code'} hint="Five wrong attempts lock the code; a new one must then be issued.">
        <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-2xl tracking-[0.4em]" />
      </Field>
      {enter.error ? <Alert tone="danger">{enter.error.message}</Alert> : null}
      <Button size="lg" onClick={() => enter.mutate()} loading={enter.isPending} disabled={code.length !== 6}>
        Confirm with code
      </Button>
    </div>
  );
}

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const q = useApi<JobDto>(['job', id], `/shipments/${id}`, { refetchInterval: 15_000 });
  return (
    <QueryView query={q}>
      {(j) => (
        <div className="mx-auto flex max-w-xl flex-col gap-5">
          <PageHeader
            eyebrow={`Job ${j.bookingReference}`}
            title={
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge kind="shipment" status={j.status} />
              </span>
            }
            description={
              <>
                <Kg kg={j.quantityKg} tonnes /> · {j.vehicle.plate} · {j.driver.name} · <Money kobo={j.priceKobo} />
              </>
            }
          />
          <Card>
            <CardHeader>
              <CardTitle>Pick up from</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="text-base font-medium">{j.pickup.farmerName}</p>
              <p>
                {j.pickup.label}, {j.pickup.community ? `${j.pickup.community}, ` : ''}
                {j.pickup.lga}
              </p>
              {j.pickup.directions ? <p className="rounded bg-canvas p-2">{j.pickup.directions}</p> : null}
              <p>
                Window: <Window start={j.pickupWindow.start} end={j.pickupWindow.end} />
              </p>
              <div className="flex flex-wrap gap-2">
                {j.pickup.exact ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={`https://www.openstreetmap.org/?mlat=${j.pickup.exact.lat}&mlon=${j.pickup.exact.lng}#map=16/${j.pickup.exact.lat}/${j.pickup.exact.lng}`} target="_blank" rel="noopener noreferrer">
                      Open map <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  </Button>
                ) : (
                  <span className="text-muted">No exact point recorded — follow the directions.</span>
                )}
                {j.pickup.farmerPhone ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={`tel:${j.pickup.farmerPhone}`}>
                      <Phone className="size-3.5" aria-hidden /> Call farmer
                    </a>
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted">Harvest status: {j.harvestStatus.replace(/_/g, ' ').toLowerCase()}. Do not load until the farmer has it ready.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Deliver to</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">{j.destination.facilityName}</p>
              {j.destination.address ? <p>{j.destination.address}</p> : null}
              <p>
                Window: <Window start={j.deliveryWindow.start} end={j.deliveryWindow.end} />
              </p>
            </CardContent>
          </Card>
          <div className="flex flex-col gap-3">
            <Milestone job={j} action="depart" label="I am on my way" path="depart" />
            <Milestone job={j} action="arrivePickup" label="I have arrived at the farm" path="arrive-pickup" />
            <Collection job={j} />
            {j.allowedActions.includes('enterPickupCode') ? (
              <Card className="border-forest">
                <CardHeader>
                  <CardTitle>Handover</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <p className="text-sm">The farmer confirms in their app, or gives you a code. You cannot leave before the handover is confirmed or an exception is approved.</p>
                  <CodeEntry job={j} purpose="pickup" />
                  <ReasonActionDialog trigger="Farmer cannot confirm" title="Report a handover problem" description="The processor (or an administrator) must approve before you leave." confirmLabel="Report" path={`/shipments/${j.shipmentId}/pickup-exception`} invalidate={[['job', j.shipmentId]]} success="Reported — waiting for approval" tone="primary" />
                </CardContent>
              </Card>
            ) : null}
            <Milestone job={j} action="leavePickup" label="I have left the farm" path="leave-pickup" />
            <Milestone job={j} action="arriveFacility" label="I have arrived at the facility" path="arrive-facility" />
            {j.allowedActions.includes('enterDeliveryCode') ? (
              <Card>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-sm">Receiving staff confirm the delivery in their app, or give you a code.</p>
                  <CodeEntry job={j} purpose="delivery" />
                </CardContent>
              </Card>
            ) : null}
            {j.allowedActions.includes('cancelTrip') ? <ReasonActionDialog trigger="Cancel this job" title="Cancel the job?" description="The payer is told immediately and can arrange a replacement." confirmLabel="Cancel job" path={`/trips/${j.tripId}/cancel`} invalidate={[['job', j.shipmentId]]} success="Job cancelled" /> : null}
          </div>
          {j.pickupRecord ? (
            <Alert tone="info" title="Pickup record">
              Loaded <Kg kg={j.pickupRecord.reportedQuantityKg} />
              {j.pickupRecord.farmerReportedQuantityKg ? <> · farmer counted <Kg kg={j.pickupRecord.farmerReportedQuantityKg} /></> : null}
              {j.pickupRecord.confirmedAt ? <> · confirmed <When at={j.pickupRecord.confirmedAt} /> ({j.pickupRecord.confirmationMethod?.replace(/_/g, ' ').toLowerCase()})</> : null}
              {j.pickupRecord.accuracyM !== null ? <> · GPS ±{j.pickupRecord.accuracyM} m</> : null}
            </Alert>
          ) : null}
          <ol className="flex flex-col gap-1 text-sm">
            {STEPS.map((s) => (
              <li key={s.key} className={j.milestones[s.key] ? 'text-forest' : 'text-muted'}>
                {j.milestones[s.key] ? '✓' : '○'} {s.label}
                {j.milestones[s.key] ? (
                  <>
                    {' '}
                    · <When at={j.milestones[s.key]} />
                  </>
                ) : null}
              </li>
            ))}
          </ol>
          <p className="flex items-center gap-1 text-xs text-muted">
            <LocateFixed className="size-3.5" aria-hidden /> Your phone’s location is attached to each step when available, with its accuracy.
          </p>
        </div>
      )}
    </QueryView>
  );
}
