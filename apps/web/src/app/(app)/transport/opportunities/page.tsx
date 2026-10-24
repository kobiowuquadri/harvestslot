'use client';

import { useState } from 'react';
import { INCLUDED_SERVICES, VEHICLE_TYPE_LABELS, type DriverDto, type OpportunityDto, type VehicleDto } from '@harvestslot/contracts';
import { Kg, Money, StatusBadge, Window } from '@/components/domain/display';
import { OrgGate } from '@/components/domain/org-gate';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Badge, Dialog, DialogContent } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';
import type { Workspace } from '@/lib/session';
import { isoToLagosInput, lagosInputToIso, nairaToKobo } from '@/lib/utils';

const SERVICE_LABELS: Record<(typeof INCLUDED_SERVICES)[number], string> = {
  LOADING: 'Loading at the farm',
  OFFLOADING: 'Offloading at the facility',
  TARPAULIN_COVER: 'Tarpaulin cover',
  WEIGHING_AT_FARM: 'Weighing at the farm',
};

function QuoteForm({ orgId, o, onDone }: { orgId: string; o: OpportunityDto; onDone: () => void }) {
  const vehicles = useApi<VehicleDto[]>(['vehicles', orgId], `/organisations/${orgId}/vehicles`);
  const drivers = useApi<DriverDto[]>(['drivers', orgId], `/organisations/${orgId}/drivers`);
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [ps, setPs] = useState(isoToLagosInput(o.pickupWindow.start));
  const [pe, setPe] = useState(isoToLagosInput(o.pickupWindow.end));
  const [ds, setDs] = useState(isoToLagosInput(o.deliveryWindow.start));
  const [de, setDe] = useState(isoToLagosInput(o.deliveryWindow.end));
  const [price, setPrice] = useState('');
  const [services, setServices] = useState<string[]>(['LOADING', 'OFFLOADING']);
  const [cancellation, setCancellation] = useState('Free cancellation until 12 hours before pickup. Later cancellations are discussed through HarvestSlot.');
  const [hours, setHours] = useState('24');
  const submit = useAction({
    request: () => ({
      path: `/organisations/${orgId}/quotes`,
      body: { bookingId: o.bookingId, vehicleId, driverId: driverId || undefined, pickupWindowStart: lagosInputToIso(ps), pickupWindowEnd: lagosInputToIso(pe), deliveryWindowStart: lagosInputToIso(ds), deliveryWindowEnd: lagosInputToIso(de), priceKobo: nairaToKobo(price) ?? 0, includedServices: services, cancellationTerms: cancellation, validForHours: Number(hours) },
    }),
    invalidate: [['opportunities', orgId], ['transport-quotes', orgId]],
    success: 'Quote sent. The payer decides; you will be notified.',
    toastErrors: false,
    onSuccess: onDone,
  });
  const vehicle = vehicles.data?.find((v) => v.id === vehicleId);
  const tooSmall = vehicle && Number(vehicle.capacityKg) < Number(o.quantityKg);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      {submit.error ? <Alert tone="danger">{submit.error.message}</Alert> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Vehicle" hint={<>It needs an availability window covering the whole trip — set under <a className="underline" href="/transport/fleet">Fleet → Availability</a>.</>} required>
          <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">Choose…</option>
            {vehicles.data
              ?.filter((v) => v.status === 'ACTIVE')
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registrationPlate} · {VEHICLE_TYPE_LABELS[v.type]} · {v.capacityKg} kg
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Driver (optional now)" hint="You must assign one before the booking can be ready.">
          <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="">Assign later</option>
            {drivers.data
              ?.filter((d) => d.status === 'ACTIVE')
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.displayName}
                </option>
              ))}
          </Select>
        </Field>
        {tooSmall ? <Alert tone="warning" className="sm:col-span-2">This vehicle carries less than the booked {o.quantityKg} kg.</Alert> : null}
        <Field label="Pickup from">
          <Input type="datetime-local" value={ps} onChange={(e) => setPs(e.target.value)} />
        </Field>
        <Field label="Pickup until">
          <Input type="datetime-local" value={pe} onChange={(e) => setPe(e.target.value)} />
        </Field>
        <Field label="Delivery from">
          <Input type="datetime-local" value={ds} onChange={(e) => setDs(e.target.value)} />
        </Field>
        <Field label="Delivery until">
          <Input type="datetime-local" value={de} onChange={(e) => setDe(e.target.value)} />
        </Field>
        <Field label="Price (₦, whole trip)" error={submit.error?.fieldErrors.priceKobo} required>
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Quote valid for (hours)">
          <Input inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">Included</legend>
        {INCLUDED_SERVICES.map((s) => (
          <Checkbox key={s} label={SERVICE_LABELS[s]} checked={services.includes(s)} onChange={(e) => setServices((p) => (e.target.checked ? [...p, s] : p.filter((x) => x !== s)))} />
        ))}
      </fieldset>
      <Field label="Cancellation terms" required>
        <Textarea value={cancellation} onChange={(e) => setCancellation(e.target.value)} />
      </Field>
      <p className="text-xs text-muted">Changing the agreed windows means the farmer and processor must confirm the change.</p>
      <Button type="submit" loading={submit.isPending} disabled={!vehicleId || nairaToKobo(price) === null}>
        Send quote
      </Button>
    </form>
  );
}

function Opportunities({ w }: { w: Extract<Workspace, { kind: 'transporter' }> }) {
  const q = useApi<OpportunityDto[]>(['opportunities', w.orgId], `/organisations/${w.orgId}/opportunities`);
  const [quoting, setQuoting] = useState<OpportunityDto | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Find jobs" description="Confirmed cassava sales in your service areas that need transport. Farm locations are shown by area until you are assigned." />
      {w.status !== 'APPROVED' ? <Alert tone="warning">Quoting is available once your organisation has been reviewed.</Alert> : null}
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No loads need transport in your areas right now">Set your service areas under Fleet to see more.</EmptyState>}>
        {(items) => (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {items.map((o) => (
              <li key={o.bookingId} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-forest">{o.bookingReference}</span>
                  {o.reason === 'REPLACEMENT' ? <Badge tone="danger">Replacement needed</Badge> : null}
                  {o.myQuote ? <StatusBadge kind="generic" status={o.myQuote.status} label={`Your quote: ${o.myQuote.status.toLowerCase()}`} /> : null}
                </div>
                <p className="mt-2 text-sm">
                  {o.pickupCommunity ? `${o.pickupCommunity}, ` : ''}
                  {o.pickupLga} → {o.facilityName} ({o.facilityLga}) · about {Math.round(o.straightLineKm)} km straight-line
                </p>
                <p className="text-sm">
                  <Kg kg={o.quantityKg} tonnes /> · pickup <Window start={o.pickupWindow.start} end={o.pickupWindow.end} />
                </p>
                <p className="text-sm text-muted">
                  Deliver <Window start={o.deliveryWindow.start} end={o.deliveryWindow.end} /> · paid by the {o.freightPayer.toLowerCase()}
                </p>
                {o.myQuote ? (
                  <p className="mt-2 text-sm">
                    You quoted <Money kobo={o.myQuote.priceKobo} />
                  </p>
                ) : (
                  <Button size="sm" className="mt-3" onClick={() => setQuoting(o)} disabled={w.status !== 'APPROVED'}>
                    Send a quote
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
      <Dialog open={quoting !== null} onOpenChange={(o) => !o && setQuoting(null)}>
        <DialogContent title={`Quote for ${quoting?.bookingReference ?? ''}`} wide>
          {quoting ? <QuoteForm orgId={w.orgId} o={quoting} onDone={() => setQuoting(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function OpportunitiesPage() {
  return <OrgGate kind="transporter">{(w) => <Opportunities w={w} />}</OrgGate>;
}
