'use client';

import { useState } from 'react';
import { CalendarPlus, Factory, Plus, Sprout } from 'lucide-react';
import { addDays, formatKg, formatTonnes, lagosDateString, OYO_LGAS, type FacilityDto } from '@harvestslot/contracts';
import { Button } from '@/components/ui/button';
import { ChoiceCards, SearchSelect } from '@/components/ui/choice';
import { Field, Input } from '@/components/ui/form';
import { Alert, Dialog, DialogContent } from '@/components/ui/primitives';
import { useCrops } from '@/lib/crops';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';
import { nairaToKobo } from '@/lib/utils';
import { quantityKg } from './harvest-form';

/** "Tell farmers what you buy, how much you can receive, where, and on which dates." */
export function BuyingSlotButton({ orgId, facilities, approved, size = 'lg' }: { orgId: string; facilities: FacilityDto[]; approved: boolean; size?: 'md' | 'lg' }) {
  const { config } = useSession();
  const today = lagosDateString(new Date());
  const active = facilities.filter((f) => f.status === 'ACTIVE');
  const [open, setOpen] = useState(false);
  // Start from the crop this buyer already buys (a tomato buyer is not asked about cassava every time).
  const crops = useCrops();
  const [crop, setCrop] = useState<string>(facilities.flatMap((f) => f.lines).find((l) => l.status === 'ACTIVE')?.crop ?? 'CASSAVA');
  const [place, setPlace] = useState<string | null>(active[0]?.id ?? (active.length ? null : '__new'));
  const [name, setName] = useState('');
  const [lga, setLga] = useState('');
  const [address, setAddress] = useState('');
  const [fromDate, setFromDate] = useState(addDays(today, 1));
  const [toDate, setToDate] = useState(addDays(today, 3));
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<'kg' | 't'>('t');
  const [price, setPrice] = useState('');
  const kg = quantityKg({ quantity, unit });
  const lgas = config?.supportedLgas?.length ? config.supportedLgas : [...OYO_LGAS];
  const save = useAction({
    request: () => ({
      path: `/organisations/${orgId}/buying-slots`,
      body: {
        crop,
        ...(place && place !== '__new' ? { facilityId: place } : { newFacility: { name: name.trim(), lga, address: address.trim() || undefined } }),
        fromDate,
        toDate,
        quantityKg: kg ?? '',
        ...(price.trim() && nairaToKobo(price) ? { priceKoboPerKg: nairaToKobo(price)! } : {}),
      },
    }),
    invalidate: [['slots', orgId], ['facilities', orgId], ['inbox', orgId]],
    success: approved ? 'Buying slot published. Farmers whose harvest fits can now find you.' : 'Saved. It goes live once HarvestSlot has reviewed your business.',
    toastErrors: false,
    onSuccess: () => setOpen(false),
  });
  const fe = save.error?.fieldErrors ?? {};
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <CalendarPlus className="size-5" aria-hidden /> Publish a buying slot
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Publish a buying slot" description="Tell farmers what you buy, how much you can receive, where, and on which dates." wide>
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            {save.error ? <Alert tone="danger">{save.error.message}</Alert> : null}
            <ChoiceCards<string>
              name="crop"
              legend="What are you buying?"
              columns={2}
              value={crop}
              onChange={setCrop}
              error={fe.crop}
              options={(crops.list.length ? crops.list : [crops.info(crop)]).map((c) => ({ value: c.code, label: c.label, description: `Farmers selling ${c.noun} see this slot`, icon: <Sprout className="size-5" /> }))}
            />
            <ChoiceCards<string>
              name="place"
              legend={`Where will you receive the ${crops.info(crop).noun}?`}
              value={place}
              onChange={setPlace}
              error={fe.facilityId}
              options={[
                ...active.map((f) => ({ value: f.id, label: f.name, description: f.address ?? f.lga, icon: <Factory className="size-5" /> })),
                { value: '__new', label: active.length ? 'A new place' : 'Add your facility', description: 'Asked once; used for your next slots too', icon: <Plus className="size-5" /> },
              ]}
            />
            {place === '__new' ? (
              <div className="flex flex-col gap-4 rounded-xl bg-canvas/60 p-4">
                <Field label="Name farmers will see" error={fe['newFacility.name']} required>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Oluyole Garri Plant" />
                </Field>
                <SearchSelect id="facility-lga" label="Local government area" required options={lgas} value={lga} onChange={setLga} placeholder="Start typing, e.g. Oluyole" error={fe['newFacility.lga']} />
                <Field label="Address or landmark (optional)" hint="Farmers who deliver see it once a plan is agreed.">
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} />
                </Field>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First day" error={fe.fromDate} required>
                <Input type="date" min={today} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </Field>
              <Field label="Last day" hint="Up to 7 days in one slot." error={fe.toDate} required>
                <Input type="date" min={fromDate} max={addDays(fromDate, 6)} value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </Field>
            </div>
            <ChoiceCards<'kg' | 't'>
              name="slot-unit"
              legend="Unit"
              size="sm"
              columns={2}
              value={unit}
              onChange={setUnit}
              options={[
                { value: 't', label: 'Tonnes (t)' },
                { value: 'kg', label: 'Kilograms (kg)' },
              ]}
            />
            <Field label="How much can you receive in total?" error={fe.quantityKg} required hint={kg ? `That is ${formatKg(kg)}${unit === 'kg' && Number(kg) >= 1000 ? ` (${formatTonnes(kg)})` : ''}.` : 'Across all the days of this slot.'}>
              <Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder={unit === 't' ? 'e.g. 10' : 'e.g. 10000'} />
            </Field>
            <Field label="Price you expect to pay (₦ per kg, optional)" hint="Shown to farmers as a guide. Your offer sets the actual price." error={fe.priceKoboPerKg}>
              <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 100" />
            </Field>
            {!approved ? <Alert tone="info">HarvestSlot is still reviewing your business. The slot is saved now and you can publish it once the review is done.</Alert> : null}
            <Button type="submit" size="lg" loading={save.isPending} disabled={!kg || !place || (place === '__new' && (!name.trim() || !lga))}>
              {approved ? 'Publish buying slot' : 'Save buying slot'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
