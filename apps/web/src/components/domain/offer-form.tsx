'use client';

import { useMemo, useState } from 'react';
import {
  REJECTION_HANDLING_LABELS,
  RejectionHandlingE,
  lagosDateString,
  lagosDateTime,
  produceAmountKobo,
  kgToGrams,
  type FacilityDto,
  type OfferDto,
  type OfferVersionDto,
  type RejectionHandling,
  type SlotDto,
} from '@harvestslot/contracts';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';
import { isoToLagosInput, koboToNairaInput, lagosInputToIso, nairaToKobo } from '@/lib/utils';
import { Kg, Money, When } from './display';

export interface OfferHarvestInfo {
  harvestRequestId: string;
  remainingKg: string;
  earliestHarvestDate: string;
  latestHarvestDate: string;
  transportPreference: 'PROCESSOR_PAYS' | 'FARMER_MAY_PAY';
  minPriceKoboPerKg: number | null;
}

interface State {
  facilityId: string;
  slotId: string;
  quantityKg: string;
  priceNaira: string;
  plannedHarvestDate: string;
  pickupStart: string;
  pickupEnd: string;
  deliveryStart: string;
  deliveryEnd: string;
  tolerancePct: string;
  paymentTermsDays: string;
  freightPayer: 'PROCESSOR' | 'FARMER';
  rejectionHandling: RejectionHandling;
  cancellationTerms: string;
  maxHours: string;
  soilAndStemsRemoved: boolean;
  maxRot: string;
  minRoot: string;
  note: string;
  validForHours: string;
}

function defaultsFor(facility: FacilityDto | undefined, harvest: OfferHarvestInfo): Partial<State> {
  const date = harvest.earliestHarvestDate;
  return {
    plannedHarvestDate: date,
    pickupStart: isoToLagosInput(lagosDateTime(date, 7).toISOString()),
    pickupEnd: isoToLagosInput(lagosDateTime(date, 11).toISOString()),
    deliveryStart: isoToLagosInput(lagosDateTime(date, 10).toISOString()),
    deliveryEnd: isoToLagosInput(lagosDateTime(date, 16).toISOString()),
    priceNaira: facility?.indicativePriceKoboPerKg ? koboToNairaInput(facility.indicativePriceKoboPerKg) : '',
    tolerancePct: facility ? String(facility.defaultToleranceBps / 100) : '5',
    paymentTermsDays: facility ? String(facility.defaultPaymentTermsDays) : '7',
    rejectionHandling: facility?.rejectionHandling ?? 'RETURNED_AT_PROCESSOR_COST',
    cancellationTerms: facility?.cancellationTerms ?? '',
    maxHours: String(facility?.qualityCriteria.maxHoursHarvestToDelivery ?? 48),
    soilAndStemsRemoved: facility?.qualityCriteria.soilAndStemsRemoved ?? true,
    maxRot: facility?.qualityCriteria.maxVisibleRotPercent?.toString() ?? '',
    minRoot: facility?.qualityCriteria.minRootLengthCm?.toString() ?? '',
  };
}

/** Pickup the afternoon before the slot opens, delivery in its first hours; harvest that morning. */
function windowsForSlot(slot: SlotDto, harvest: OfferHarvestInfo): Partial<State> {
  const start = new Date(slot.startsAt).getTime();
  let planned = lagosDateString(new Date(start - 20 * 3_600_000));
  if (planned < harvest.earliestHarvestDate) planned = harvest.earliestHarvestDate;
  if (planned > harvest.latestHarvestDate) planned = harvest.latestHarvestDate;
  return {
    plannedHarvestDate: planned,
    pickupStart: isoToLagosInput(new Date(start - 16 * 3_600_000).toISOString()),
    pickupEnd: isoToLagosInput(new Date(start - 12 * 3_600_000).toISOString()),
    deliveryStart: isoToLagosInput(new Date(start).toISOString()),
    deliveryEnd: isoToLagosInput(new Date(start + 4 * 3_600_000).toISOString()),
  };
}

function fromVersion(v: OfferVersionDto, facilityId: string): State {
  return {
    facilityId,
    slotId: v.slotId,
    quantityKg: v.quantityKg,
    priceNaira: koboToNairaInput(v.priceKoboPerKg),
    plannedHarvestDate: v.plannedHarvestDate,
    pickupStart: isoToLagosInput(v.pickupWindowStart),
    pickupEnd: isoToLagosInput(v.pickupWindowEnd),
    deliveryStart: isoToLagosInput(v.deliveryWindowStart),
    deliveryEnd: isoToLagosInput(v.deliveryWindowEnd),
    tolerancePct: String(v.toleranceBps / 100),
    paymentTermsDays: String(v.paymentTermsDays),
    freightPayer: v.freightPayer,
    rejectionHandling: v.rejectionHandling,
    cancellationTerms: v.cancellationTerms,
    maxHours: String(v.qualityTerms.maxHoursHarvestToDelivery),
    soilAndStemsRemoved: v.qualityTerms.soilAndStemsRemoved,
    maxRot: v.qualityTerms.maxVisibleRotPercent?.toString() ?? '',
    minRoot: v.qualityTerms.minRootLengthCm?.toString() ?? '',
    note: v.note ?? '',
    validForHours: '',
  };
}

/**
 * Processor offer form (create or revise). Capacity is reserved as a hold only when the farmer
 * accepts; the server re-checks slot capacity and the farmer's remaining supply at that moment.
 */
export function OfferForm({ orgId, harvest, revise, onDone }: { orgId: string; harvest: OfferHarvestInfo; revise?: OfferDto; onDone: (offer: OfferDto) => void }) {
  const facilities = useApi<FacilityDto[]>(['facilities', orgId], `/organisations/${orgId}/facilities`);
  const fromIso = lagosDateTime(harvest.earliestHarvestDate, 0).toISOString();
  const toIso = lagosDateTime(harvest.latestHarvestDate, 23).toISOString();
  const slots = useApi<SlotDto[]>(['slots', orgId, 'offer', harvest.harvestRequestId], `/organisations/${orgId}/slots?status=PUBLISHED&from=${encodeURIComponent(new Date(new Date(fromIso).getTime() - 3 * 86_400_000).toISOString())}&to=${encodeURIComponent(new Date(new Date(toIso).getTime() + 3 * 86_400_000).toISOString())}`);
  const [s, setS] = useState<State>(() =>
    revise
      ? fromVersion(revise.current, revise.facility.id)
      : ({ facilityId: '', slotId: '', quantityKg: harvest.remainingKg, freightPayer: 'PROCESSOR', note: '', validForHours: '', ...defaultsFor(undefined, harvest) } as State),
  );
  const set = <K extends keyof State>(k: K, v: State[K]) => setS((p) => ({ ...p, [k]: v }));
  const facility = facilities.data?.find((f) => f.id === s.facilityId);
  const facilitySlots = useMemo(() => (slots.data ?? []).filter((x) => x.facilityId === s.facilityId), [slots.data, s.facilityId]);
  const slot = facilitySlots.find((x) => x.id === s.slotId);
  const priceKobo = nairaToKobo(s.priceNaira);
  const estimate = priceKobo && /^\d+(\.\d{1,3})?$/.test(s.quantityKg) ? Number(produceAmountKobo(kgToGrams(s.quantityKg), BigInt(priceKobo))) : null;

  const save = useAction<void, OfferDto>({
    request: () => {
      const terms = {
        slotId: s.slotId,
        quantityKg: s.quantityKg.trim(),
        priceKoboPerKg: priceKobo ?? 0,
        plannedHarvestDate: s.plannedHarvestDate,
        pickupWindowStart: lagosInputToIso(s.pickupStart),
        pickupWindowEnd: lagosInputToIso(s.pickupEnd),
        deliveryWindowStart: lagosInputToIso(s.deliveryStart),
        deliveryWindowEnd: lagosInputToIso(s.deliveryEnd),
        qualityTerms: {
          maxHoursHarvestToDelivery: Number(s.maxHours),
          soilAndStemsRemoved: s.soilAndStemsRemoved,
          ...(s.maxRot ? { maxVisibleRotPercent: Number(s.maxRot) } : {}),
          ...(s.minRoot ? { minRootLengthCm: Number(s.minRoot) } : {}),
          varietiesAccepted: facility?.qualityCriteria.varietiesAccepted ?? [],
        },
        toleranceBps: Math.round(Number(s.tolerancePct) * 100),
        paymentTermsDays: Number(s.paymentTermsDays),
        freightPayer: s.freightPayer,
        rejectionHandling: s.rejectionHandling,
        cancellationTerms: s.cancellationTerms,
        note: s.note || undefined,
      };
      return revise
        ? { path: `/offers/${revise.id}/revise`, body: { ...terms, expectedVersionNo: revise.currentVersionNo } }
        : { path: '/offers', body: { ...terms, harvestRequestId: harvest.harvestRequestId, ...(s.validForHours ? { validForHours: Number(s.validForHours) } : {}) } };
    },
    invalidate: [['offers'], ['inbox', orgId], ['offer', revise?.id]],
    success: revise ? 'Revised offer sent to the farmer' : 'Offer sent to the farmer',
    toastErrors: false,
    onSuccess: (o) => onDone(o),
  });
  const fieldErrors = save.error?.fieldErrors ?? {};

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
        <Field label="Facility" required>
          <Select
            value={s.facilityId}
            onChange={(e) => {
              const f = facilities.data?.find((x) => x.id === e.target.value);
              setS((p) => ({ ...p, facilityId: e.target.value, slotId: '', ...(revise ? {} : defaultsFor(f, harvest)) }));
            }}
            disabled={Boolean(revise)}
          >
            <option value="">Choose…</option>
            {facilities.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.lga})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Processing slot" hint={slot ? <>Available now: <Kg kg={slot.usage.availableKg} /> · as of <When at={slot.asOf} /></> : facilitySlots.length === 0 && s.facilityId ? 'No published slots around these harvest dates.' : undefined} error={fieldErrors.slotId} required>
          <Select
            value={s.slotId}
            onChange={(e) => {
              const chosen = facilitySlots.find((x) => x.id === e.target.value);
              setS((p) => ({ ...p, slotId: e.target.value, ...(chosen ? windowsForSlot(chosen, harvest) : {}) }));
            }}
          >
            <option value="">Choose…</option>
            {facilitySlots.map((x) => (
              <option key={x.id} value={x.id}>
                {new Date(x.startsAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {x.lineName} · {x.usage.availableKg} kg free
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity (kg)" hint={<>Farmer has <Kg kg={harvest.remainingKg} /> unbooked</>} error={fieldErrors.quantityKg} required>
          <Input inputMode="decimal" value={s.quantityKg} onChange={(e) => set('quantityKg', e.target.value)} />
        </Field>
        <Field label="Price (₦ per kg)" hint={harvest.minPriceKoboPerKg ? `Farmer's minimum: ₦${koboToNairaInput(harvest.minPriceKoboPerKg)}/kg` : undefined} error={fieldErrors.priceKoboPerKg} required>
          <Input inputMode="decimal" value={s.priceNaira} onChange={(e) => set('priceNaira', e.target.value)} />
        </Field>
        <Field label="Planned harvest date" error={fieldErrors.plannedHarvestDate} required>
          <Input type="date" value={s.plannedHarvestDate} min={harvest.earliestHarvestDate} max={harvest.latestHarvestDate} onChange={(e) => set('plannedHarvestDate', e.target.value)} />
        </Field>
        <Field label="Offer valid for (hours)" hint="Leave empty for the platform default.">
          <Input inputMode="numeric" value={s.validForHours} onChange={(e) => set('validForHours', e.target.value)} disabled={Boolean(revise)} />
        </Field>
        <Field label="Pickup from (Lagos time)" error={fieldErrors.pickupWindowStart} required>
          <Input type="datetime-local" value={s.pickupStart} onChange={(e) => set('pickupStart', e.target.value)} />
        </Field>
        <Field label="Pickup until" error={fieldErrors.pickupWindowEnd} required>
          <Input type="datetime-local" value={s.pickupEnd} onChange={(e) => set('pickupEnd', e.target.value)} />
        </Field>
        <Field label="Delivery from" error={fieldErrors.deliveryWindowStart} required>
          <Input type="datetime-local" value={s.deliveryStart} onChange={(e) => set('deliveryStart', e.target.value)} />
        </Field>
        <Field label="Delivery until" error={fieldErrors.deliveryWindowEnd} required>
          <Input type="datetime-local" value={s.deliveryEnd} onChange={(e) => set('deliveryEnd', e.target.value)} />
        </Field>
        <Field label="Quantity tolerance (%)" hint="Deliveries within this range of the agreed quantity are accepted without an amendment.">
          <Input inputMode="decimal" value={s.tolerancePct} onChange={(e) => set('tolerancePct', e.target.value)} />
        </Field>
        <Field label="Pay the farmer within (days of receiving)">
          <Input inputMode="numeric" value={s.paymentTermsDays} onChange={(e) => set('paymentTermsDays', e.target.value)} />
        </Field>
        <Field label="Who pays for transport" hint={harvest.transportPreference === 'PROCESSOR_PAYS' ? 'This farmer asked for the processor to pay.' : 'This farmer may pay for transport.'}>
          <Select value={s.freightPayer} onChange={(e) => set('freightPayer', e.target.value as State['freightPayer'])}>
            <option value="PROCESSOR">Processor pays</option>
            {harvest.transportPreference === 'FARMER_MAY_PAY' ? <option value="FARMER">Farmer pays</option> : null}
          </Select>
        </Field>
        <Field label="Rejected cassava">
          <Select value={s.rejectionHandling} onChange={(e) => set('rejectionHandling', e.target.value as RejectionHandling)}>
            {RejectionHandlingE.values.map((r) => (
              <option key={r} value={r}>
                {REJECTION_HANDLING_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <fieldset className="grid grid-cols-1 gap-4 rounded-lg border border-line p-3 sm:grid-cols-3">
        <legend className="px-1 text-sm font-medium">Quality requirements (checked on receipt)</legend>
        <Field label="Max hours harvest → delivery">
          <Input inputMode="numeric" value={s.maxHours} onChange={(e) => set('maxHours', e.target.value)} />
        </Field>
        <Field label="Max visible rot (%)">
          <Input inputMode="numeric" value={s.maxRot} onChange={(e) => set('maxRot', e.target.value)} />
        </Field>
        <Field label="Min root length (cm)">
          <Input inputMode="numeric" value={s.minRoot} onChange={(e) => set('minRoot', e.target.value)} />
        </Field>
        <Checkbox className="sm:col-span-3" label="Soil and stems removed" checked={s.soilAndStemsRemoved} onChange={(e) => set('soilAndStemsRemoved', e.target.checked)} />
      </fieldset>
      <Field label="Cancellation terms" error={fieldErrors.cancellationTerms} required>
        <Textarea value={s.cancellationTerms} onChange={(e) => set('cancellationTerms', e.target.value)} maxLength={1000} />
      </Field>
      <Field label="Message to the farmer (optional)">
        <Textarea value={s.note} onChange={(e) => set('note', e.target.value)} maxLength={1000} />
      </Field>
      {estimate !== null ? (
        <p className="rounded-lg bg-leaf-50 p-3 text-sm text-forest">
          Estimated produce value if all is accepted: <strong><Money kobo={estimate} /></strong>. Invoices use the quantity accepted at receiving.
        </p>
      ) : null}
      <Button type="submit" size="lg" loading={save.isPending} disabled={!s.slotId || priceKobo === null}>
        {revise ? 'Send revised offer' : 'Send offer'}
      </Button>
    </form>
  );
}
