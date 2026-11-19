'use client';

import { useState } from 'react';
import { Factory, Send, Truck } from 'lucide-react';
import {
  addDays,
  formatKg,
  formatLagosDate,
  formatNaira,
  lagosDateString,
  produceAmountKobo,
  toGrams,
  type FacilityDto,
  type HandoverArrangement,
  type OfferDto,
  type SlotDto,
} from '@harvestslot/contracts';
import { Button } from '@/components/ui/button';
import { ChoiceCards } from '@/components/ui/choice';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';
import { koboToNairaInput, nairaToKobo } from '@/lib/utils';

export interface OfferRequestContext {
  harvestRequestId: string;
  reference: string;
  farmerName: string;
  farmLabel: string;
  lga: string;
  remainingKg: string;
  earliestHarvestDate: string;
  latestHarvestDate: string;
  bestSlotId?: string | null;
}

const TIMES = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
const lagosIso = (date: string, time: string) => new Date(`${date}T${time}:00+01:00`).toISOString();
const lagosTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Lagos' }).format(new Date(iso));
const slotDays = (s: SlotDto) => ({ first: lagosDateString(new Date(s.startsAt)), last: lagosDateString(new Date(new Date(s.endsAt).getTime() - 1)) });

/**
 * The buyer's offer, prefilled from the request and the best-fitting buying slot. "How will the cassava
 * get there?" is one choice; without it the offer can only be saved as a draft.
 */
export function OfferForm({ orgId, request, existing, onDone }: { orgId: string; request: OfferRequestContext; existing?: OfferDto; onDone: (o: OfferDto) => void }) {
  const today = lagosDateString(new Date());
  const from = new Date(`${request.earliestHarvestDate}T00:00:00+01:00`);
  const to = new Date(new Date(`${request.latestHarvestDate}T00:00:00+01:00`).getTime() + 86_400_000);
  const slots = useApi<SlotDto[]>(['slots', orgId, 'offer', request.harvestRequestId], `/organisations/${orgId}/slots?status=PUBLISHED&from=${encodeURIComponent(new Date(from.getTime() - 86_400_000).toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
  const facilities = useApi<FacilityDto[]>(['facilities', orgId], `/organisations/${orgId}/facilities`);
  const usable = (slots.data ?? []).filter((s) => new Date(s.startsAt) < to && new Date(s.endsAt) > from && new Date(s.endsAt) > new Date());
  const cur = existing?.current;

  const [slotId, setSlotId] = useState(cur?.slotId ?? request.bestSlotId ?? '');
  const slot = usable.find((s) => s.id === slotId) ?? (slots.data ?? []).find((s) => s.id === slotId) ?? null;
  const facility = facilities.data?.find((f) => f.id === slot?.facilityId);
  const defaultDay = (() => {
    if (!slot) return '';
    const d = slotDays(slot);
    const start = [d.first, request.earliestHarvestDate, today].sort().at(-1)!;
    return start <= d.last && start <= request.latestHarvestDate ? start : d.first;
  })();
  const [day, setDay] = useState(cur?.plannedHarvestDate ?? '');
  const [fromTime, setFromTime] = useState(cur ? lagosTime(cur.handoverArrangement === 'FARMER_DELIVERS' ? cur.deliveryWindowStart : cur.pickupWindowStart) : '09:00');
  const [toTime, setToTime] = useState(cur ? lagosTime(cur.handoverArrangement === 'FARMER_DELIVERS' ? cur.deliveryWindowEnd : cur.pickupWindowEnd) : '13:00');
  const [qty, setQty] = useState(cur?.quantityKg ?? String(Number(request.remainingKg)));
  const [price, setPrice] = useState(cur ? koboToNairaInput(cur.priceKoboPerKg) : '');
  const [arrangement, setArrangement] = useState<HandoverArrangement | null>(cur?.handoverArrangement ?? null);
  const [cost, setCost] = useState(cur?.farmerDeliveryCostKobo ? koboToNairaInput(cur.farmerDeliveryCostKobo) : '');
  const [note, setNote] = useState(cur?.note ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  const effectiveDay = day || defaultDay;
  const priceKobo = nairaToKobo(price);
  const costKobo = cost.trim() ? nairaToKobo(cost) : 0;
  const total = priceKobo && /^\d+(\.\d{1,3})?$/.test(qty.trim()) ? Number(produceAmountKobo(toGrams(qty.trim()), BigInt(priceKobo))) : null;
  const priceHint = facility?.indicativePriceKoboPerKg ? `You usually pay ${formatNaira(facility.indicativePriceKoboPerKg)} per kg.` : undefined;

  const body = (send: boolean) => ({
    slotId,
    quantityKg: qty.trim(),
    priceKoboPerKg: priceKobo ?? 0,
    plannedHarvestDate: effectiveDay,
    handoverWindowStart: effectiveDay ? lagosIso(effectiveDay, fromTime) : undefined,
    handoverWindowEnd: effectiveDay ? lagosIso(effectiveDay, toTime) : undefined,
    ...(arrangement ? { handoverArrangement: arrangement } : {}),
    ...(arrangement === 'FARMER_DELIVERS' && costKobo ? { farmerDeliveryCostKobo: costKobo } : {}),
    note: note.trim() || undefined,
    send,
  });
  const save = useAction<boolean, OfferDto>({
    request: (send) =>
      existing
        ? { path: `/offers/${existing.id}/revise`, body: { ...body(send), expectedVersionNo: existing.currentVersionNo } }
        : { path: '/offers', body: { harvestRequestId: request.harvestRequestId, ...body(send) } },
    invalidate: [['inbox', orgId], ['offers'], ['offer', existing?.id ?? ''], ['slots', orgId]],
    success: (o) => (o.status === 'DRAFT' ? 'Draft saved. It is not visible to the farmer until you send it.' : existing && existing.status !== 'DRAFT' ? 'Offer updated. The farmer has been told.' : 'Offer sent. Capacity is held until the farmer answers.'),
    toastErrors: false,
    onSuccess: (o) => onDone(o),
  });
  const fe = save.error?.fieldErrors ?? {};

  const submit = (send: boolean) => {
    setLocalError(null);
    if (!slotId) return setLocalError('Choose a buying slot');
    if (!priceKobo) return setLocalError('Enter the price per kg, like 100 or 100.50');
    if (send && !arrangement) return setLocalError('Choose how the cassava will get there, or save the offer as a draft');
    if (arrangement === 'FARMER_DELIVERS' && cost.trim() && costKobo === null) return setLocalError('Enter the delivery cost in naira, like 15000');
    if (fromTime >= toTime) return setLocalError('The time window must end after it starts');
    save.mutate(send);
  };

  const days: string[] = [];
  if (slot) {
    const d = slotDays(slot);
    for (let x = d.first; x <= d.last && days.length < 8; x = addDays(x, 1)) if (x >= request.earliestHarvestDate && x <= request.latestHarvestDate && x >= today) days.push(x);
  }
  const canSend = !existing || ['DRAFT', 'OPEN', 'COUNTERED'].includes(existing.status);

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(true);
      }}
    >
      {localError ? <Alert tone="danger">{localError}</Alert> : save.error ? <Alert tone="danger">{save.error.message}</Alert> : null}
      <div className="rounded-xl bg-canvas/70 p-4 text-sm">
        <p className="font-medium text-ink">
          {request.farmerName} · {formatKg(request.remainingKg)} · {request.farmLabel}, {request.lga}
        </p>
        <p className="text-muted">
          Can harvest {formatLagosDate(request.earliestHarvestDate)} – {formatLagosDate(request.latestHarvestDate)} · {request.reference}
        </p>
      </div>

      <Field label="Buying slot" error={fe.slotId} required hint={slots.isLoading ? 'Loading your buying slots…' : usable.length ? undefined : 'None of your published buying slots covers these dates. Publish one under Buying slots first.'}>
        <Select value={slotId} onChange={(e) => { setSlotId(e.target.value); setDay(''); }}>
          <option value="">Choose…</option>
          {usable.map((s) => (
            <option key={s.id} value={s.id}>
              {s.facilityName} · {formatLagosDate(s.startsAt)}
              {slotDays(s).first !== slotDays(s).last ? ` – ${formatLagosDate(slotDays(s).last)}` : ''} · {formatKg(s.usage.availableKg)} free
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quantity (kg)" error={fe.quantityKg} required hint={`The farmer has ${formatKg(request.remainingKg)} for sale${slot ? `; this slot has ${formatKg(slot.usage.availableKg)} free` : ''}.`}>
          <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Price (₦ per kg)" error={fe.priceKoboPerKg} required hint={priceHint}>
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 100" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Day" error={fe.plannedHarvestDate} required>
          <Select value={effectiveDay} onChange={(e) => setDay(e.target.value)} disabled={!slot}>
            {days.length === 0 ? <option value="">{slot ? 'No day fits both dates' : 'Choose a slot first'}</option> : null}
            {days.map((d) => (
              <option key={d} value={d}>
                {formatLagosDate(d)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" error={fe.handoverWindowStart}>
          <Select value={fromTime} onChange={(e) => setFromTime(e.target.value)}>
            {TIMES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="To" error={fe.handoverWindowEnd}>
          <Select value={toTime} onChange={(e) => setToTime(e.target.value)}>
            {TIMES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
      </div>

      <ChoiceCards<HandoverArrangement>
        name="handoverArrangement"
        legend="How will the cassava get there?"
        value={arrangement}
        onChange={setArrangement}
        error={fe.handoverArrangement}
        options={[
          { value: 'COLLECT_FROM_FARM', label: 'We’ll collect from the farm', description: `At ${request.farmLabel}, ${request.lga}. No transport cost to the farmer.`, icon: <Truck className="size-5" /> },
          { value: 'FARMER_DELIVERS', label: 'The farmer will deliver to our facility', description: facility ? `To ${facility.name}${facility.address ? `, ${facility.address}` : `, ${facility.lga}`}.` : 'To the facility of the chosen slot.', icon: <Factory className="size-5" /> },
        ]}
      />
      {arrangement === 'FARMER_DELIVERS' ? (
        <Field label="Estimated delivery cost the farmer pays (₦, optional)" hint="Shown to the farmer before they accept. HarvestSlot does not charge or collect it." error={fe.farmerDeliveryCostKobo}>
          <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. 15000" />
        </Field>
      ) : null}
      <Field label="Message to the farmer (optional)">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="e.g. Please have the roots bagged." />
      </Field>

      <div className="flex flex-col gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Estimated total to the farmer: <span className="text-lg font-semibold text-ink">{total !== null ? formatNaira(total) : '—'}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {!existing || existing.status === 'DRAFT' ? (
            <Button type="button" variant="outline" onClick={() => submit(false)} loading={save.isPending && save.variables === false} disabled={save.isPending}>
              Save as draft
            </Button>
          ) : null}
          {canSend ? (
            <Button type="submit" loading={save.isPending && save.variables === true} disabled={save.isPending}>
              <Send className="size-4" aria-hidden /> {existing && existing.status !== 'DRAFT' ? 'Update offer' : 'Send offer'}
            </Button>
          ) : null}
        </div>
      </div>
      {!arrangement ? <p className="-mt-2 text-[13px] text-muted">Not sure about transport yet? Save the offer as a draft and send it once you decide.</p> : null}
    </form>
  );
}
