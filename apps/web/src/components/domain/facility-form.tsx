'use client';

import { LocateFixed } from 'lucide-react';
import { useState } from 'react';
import { OYO_LGAS, REJECTION_HANDLING_LABELS, RejectionHandlingE, type FacilityDto, type RejectionHandling } from '@harvestslot/contracts';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert } from '@/components/ui/primitives';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';
import { koboToNairaInput, nairaToKobo } from '@/lib/utils';

export function FacilityForm({ orgId, existing, onDone }: { orgId: string; existing?: FacilityDto; onDone: (f: FacilityDto) => void }) {
  const { config } = useSession();
  const lgas = config?.supportedLgas?.length ? config.supportedLgas : [...OYO_LGAS];
  const [name, setName] = useState(existing?.name ?? '');
  const [lga, setLga] = useState(existing?.lga ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [lat, setLat] = useState(existing?.lat.toString() ?? '');
  const [lng, setLng] = useState(existing?.lng.toString() ?? '');
  const [minOrder, setMinOrder] = useState(existing?.minOrderKg ?? '1000');
  const [maxKm, setMaxKm] = useState(existing?.maxPickupDistanceKm.toString() ?? '60');
  const [price, setPrice] = useState(existing?.indicativePriceKoboPerKg ? koboToNairaInput(existing.indicativePriceKoboPerKg) : '');
  const [tolerance, setTolerance] = useState(existing ? String(existing.defaultToleranceBps / 100) : '5');
  const [payDays, setPayDays] = useState(existing?.defaultPaymentTermsDays.toString() ?? '7');
  const [rejection, setRejection] = useState<RejectionHandling>(existing?.rejectionHandling ?? 'RETURNED_AT_PROCESSOR_COST');
  const [cancellation, setCancellation] = useState(existing?.cancellationTerms ?? 'Either party may cancel without charge until 24 hours before the pickup window. Later cancellations are discussed through HarvestSlot.');
  const [maxHours, setMaxHours] = useState(existing?.qualityCriteria.maxHoursHarvestToDelivery.toString() ?? '48');
  const [soil, setSoil] = useState(existing?.qualityCriteria.soilAndStemsRemoved ?? true);
  const [rot, setRot] = useState(existing?.qualityCriteria.maxVisibleRotPercent?.toString() ?? '5');
  const save = useAction<void, FacilityDto>({
    request: () => {
      const body = {
        name,
        lga,
        address: address || undefined,
        point: { lat: Number(lat), lng: Number(lng) },
        qualityCriteria: { maxHoursHarvestToDelivery: Number(maxHours), soilAndStemsRemoved: soil, ...(rot ? { maxVisibleRotPercent: Number(rot) } : {}), varietiesAccepted: existing?.qualityCriteria.varietiesAccepted ?? [] },
        minOrderKg: minOrder,
        maxPickupDistanceKm: Number(maxKm),
        ...(price ? { indicativePriceKoboPerKg: nairaToKobo(price) ?? 0 } : {}),
        defaultToleranceBps: Math.round(Number(tolerance) * 100),
        defaultPaymentTermsDays: Number(payDays),
        rejectionHandling: rejection,
        cancellationTerms: cancellation,
      };
      return existing ? { path: `/facilities/${existing.id}`, method: 'PATCH', idempotent: false, body: { ...body, expectedVersion: existing.version } } : { path: `/organisations/${orgId}/facilities`, body };
    },
    invalidate: [['facilities', orgId], ['facility', existing?.id]],
    success: 'Facility saved',
    toastErrors: false,
    onSuccess: onDone,
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {save.error ? <Alert tone="danger">{save.error.message}</Alert> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Facility name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="LGA" required>
          <Select value={lga} onChange={(e) => setLga(e.target.value)}>
            <option value="" disabled>
              Choose…
            </option>
            {lgas.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Latitude" error={save.error?.fieldErrors['point.lat'] ?? save.error?.fieldErrors.point} required>
          <Input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
        </Field>
        <Field label="Longitude" error={save.error?.fieldErrors['point.lng']} required>
          <Input inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />
        </Field>
        <Button
          type="button"
          variant="outline"
          className="sm:col-span-2"
          onClick={() =>
            navigator.geolocation?.getCurrentPosition((p) => {
              setLat(p.coords.latitude.toFixed(6));
              setLng(p.coords.longitude.toFixed(6));
            })
          }
        >
          <LocateFixed className="size-4" aria-hidden /> Use this device’s location
        </Button>
        <Field label="Minimum order (kg)">
          <Input inputMode="decimal" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} />
        </Field>
        <Field label="Furthest pickup (km)">
          <Input inputMode="numeric" value={maxKm} onChange={(e) => setMaxKm(e.target.value)} />
        </Field>
        <Field label="Indicative price (₦/kg, optional)" hint="Shown to farmers in matches; offers set the actual price.">
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Default tolerance (%)">
          <Input inputMode="decimal" value={tolerance} onChange={(e) => setTolerance(e.target.value)} />
        </Field>
        <Field label="Default payment terms (days)">
          <Input inputMode="numeric" value={payDays} onChange={(e) => setPayDays(e.target.value)} />
        </Field>
        <Field label="Rejected produce">
          <Select value={rejection} onChange={(e) => setRejection(e.target.value as RejectionHandling)}>
            {RejectionHandlingE.values.map((r) => (
              <option key={r} value={r}>
                {REJECTION_HANDLING_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Max hours harvest → delivery">
          <Input inputMode="numeric" value={maxHours} onChange={(e) => setMaxHours(e.target.value)} />
        </Field>
        <Field label="Max visible rot (%)">
          <Input inputMode="numeric" value={rot} onChange={(e) => setRot(e.target.value)} />
        </Field>
        <Checkbox className="sm:col-span-2" label="Soil and stems must be removed" checked={soil} onChange={(e) => setSoil(e.target.checked)} />
        <Field label="Cancellation terms" className="sm:col-span-2" required>
          <Textarea value={cancellation} onChange={(e) => setCancellation(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" loading={save.isPending} disabled={!name || !lga || !lat || !lng}>
        {existing ? 'Save facility' : 'Add facility'}
      </Button>
    </form>
  );
}
