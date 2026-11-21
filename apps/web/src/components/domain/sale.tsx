'use client';

import { useState } from 'react';
import { AlertTriangle, CalendarDays, Check, CheckCircle2, MapPin, Scale, Truck, Wallet } from 'lucide-react';
import {
  formatKg,
  formatNaira,
  HANDOVER_ARRANGEMENT_LABELS,
  lagosDateString,
  produceAmountKobo,
  REJECTION_REASON_LABELS,
  toGrams,
  type BookingDetail,
  type ReceivingDto,
  type RejectionReason,
} from '@harvestslot/contracts';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Dialog, DialogContent } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';
import { cn, koboToNairaInput, nairaToKobo } from '@/lib/utils';
import { bookingKeys } from './booking-sections';
import { Window } from './display';

const naira = (kobo: number) => formatNaira(kobo).replace(/\.00$/, '');

/** The confirmed plan as a sentence the farmer could read aloud, with the figures underneath. */
export function PlanCard({ b }: { b: BookingDetail }) {
  const p = b.plan;
  const final = p.weighed?.finalAmountKobo ?? null;
  return (
    <section aria-label="The plan" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="bg-ink px-5 py-6 text-white sm:px-6">
        <p className="text-[13px] font-medium text-white/70">The plan</p>
        <p className="mt-1.5 text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{p.sentence}</p>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
        {[
          { icon: <CalendarDays className="size-4" />, k: 'When', v: <Window start={p.window.start} end={p.window.end} /> },
          { icon: <MapPin className="size-4" />, k: 'Where', v: p.placeLabel },
          { icon: <Truck className="size-4" />, k: 'Who brings it', v: p.arrangement ? HANDOVER_ARRANGEMENT_LABELS[p.arrangement] : 'Transporter' },
          {
            icon: <Wallet className="size-4" />,
            k: final !== null ? 'Final amount' : 'Estimated total',
            v: (
              <>
                {naira(final ?? p.estimatedAmountKobo)}
                {final !== null && final !== p.estimatedAmountKobo ? <span className="block text-xs font-normal text-muted">offer was {naira(p.estimatedAmountKobo)}</span> : null}
              </>
            ),
          },
        ].map((x) => (
          <div key={x.k} className="bg-surface px-5 py-3.5">
            <dt className="flex items-center gap-1.5 text-[13px] text-muted">
              <span aria-hidden>{x.icon}</span> {x.k}
            </dt>
            <dd className="mt-0.5 text-[15px] font-medium text-ink">{x.v}</dd>
          </div>
        ))}
      </dl>
      {p.farmerDeliveryCostKobo ? <p className="border-t border-line px-5 py-3 text-[13px] text-muted sm:px-6">The farmer delivers; estimated delivery cost {naira(p.farmerDeliveryCostKobo)}, paid by the farmer.</p> : null}
    </section>
  );
}

/** Five steps from agreement to money received, each saying who acts. */
export function SaleTimeline({ b }: { b: BookingDetail }) {
  const p = b.plan;
  const agreed = ['CONFIRMED', 'ACTIVE', 'COMPLETED'].includes(b.status);
  const pay = p.payment;
  const steps = [
    { label: 'Plan agreed', who: 'Farmer and buyer', done: agreed },
    { label: p.arrangement === 'FARMER_DELIVERS' ? 'Delivered and weighed' : 'Collected and weighed', who: 'Buyer records the weight', done: Boolean(p.weighed) },
    {
      label: p.weighed?.farmerDecision === 'PROBLEM_REPORTED' ? 'Problem reported' : 'Weight checked',
      who: 'Farmer agrees or reports a problem',
      done: Boolean(p.weighed && ['AGREED', 'NOT_NEEDED'].includes(p.weighed.farmerDecision)),
      warn: p.weighed?.farmerDecision === 'PROBLEM_REPORTED',
    },
    { label: 'Payment reported', who: 'Buyer records the payment', done: Boolean(pay && (pay.reportedPendingKobo > 0 || pay.confirmedPaidKobo > 0)) },
    { label: 'Payment received', who: 'Farmer confirms it arrived', done: Boolean(pay && pay.outstandingKobo <= 0 && pay.reportedPendingKobo <= 0) },
  ];
  const current = steps.findIndex((s) => !s.done);
  if (['CANCELLED', 'EXPIRED'].includes(b.status)) return null;
  return (
    <section aria-labelledby="sale-steps" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 id="sale-steps" className="text-[15px] font-semibold text-ink">
        From agreement to payment
      </h2>
      <ol className="mt-4 flex flex-col gap-0">
        {steps.map((s, i) => (
          <li key={s.label} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 ? <span className={cn('absolute left-[11px] top-6 h-[calc(100%-1rem)] w-0.5', s.done ? 'bg-forest' : 'bg-line')} aria-hidden /> : null}
            <span
              className={cn(
                'relative z-10 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                s.done ? 'bg-forest text-white' : s.warn ? 'bg-amber text-amber-ink' : i === current ? 'bg-surface text-forest ring-2 ring-forest' : 'bg-canvas text-muted ring-1 ring-line',
              )}
              aria-hidden
            >
              {s.done ? <Check className="size-3.5" strokeWidth={3} /> : s.warn ? '!' : i + 1}
            </span>
            <div className="-mt-0.5">
              <p className={cn('text-sm', i === current ? 'font-semibold text-ink' : s.done ? 'text-ink' : 'text-muted')}>
                {s.label}
                <span className="sr-only">{s.done ? ' — done' : i === current ? ' — next' : ' — not yet'}</span>
              </p>
              <p className="text-xs text-muted">{s.who}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** What was weighed, and the final amount, with any difference from the offer flagged. */
export function WeightResult({ b }: { b: BookingDetail }) {
  const w = b.plan.weighed;
  if (!w) return null;
  const short = toGrams(w.shortfallKg);
  return (
    <section aria-label="Weight recorded" className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted">Weight accepted</p>
          <p className="text-2xl font-semibold tracking-tight text-ink">{formatKg(w.acceptedKg)}</p>
          <p className="text-[13px] text-muted">
            {formatKg(w.receivedKg)} received · {formatKg(b.plan.agreedKg)} agreed
          </p>
        </div>
        <div className="text-right">
          <p className="text-[13px] text-muted">Final amount</p>
          <p className="text-2xl font-semibold tracking-tight text-ink">{naira(w.finalAmountKobo)}</p>
          <p className="text-[13px] text-muted">
            {formatKg(w.acceptedKg)} × {naira(b.plan.priceKoboPerKg)}/kg
          </p>
        </div>
      </div>
      {short !== 0n ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {short > 0n ? `${formatKg(short)} less than agreed` : `${formatKg(-short)} more than agreed`} — {naira(b.plan.estimatedAmountKobo - w.finalAmountKobo)} {short > 0n ? 'less' : 'more'} than the offer.
            {w.reasons.length ? ` Reason: ${w.reasons.join(', ').toLowerCase()}.` : ''}
            {w.note ? ` “${w.note}”` : ''}
          </span>
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-forest">
          <CheckCircle2 className="size-4" aria-hidden /> Matches the agreed quantity.
        </p>
      )}
    </section>
  );
}

const REASONS = (Object.keys(REJECTION_REASON_LABELS) as RejectionReason[]).filter((r) => r !== 'OVER_CONTRACT_EXCESS');

/** Buyer: what arrived and what is accepted, in one step from the booking. */
export function RecordWeightButton({ b }: { b: BookingDetail }) {
  const [open, setOpen] = useState(false);
  const [received, setReceived] = useState(String(Number(b.plan.agreedKg)));
  const [accepted, setAccepted] = useState(String(Number(b.plan.agreedKg)));
  const [method, setMethod] = useState('PLATFORM_SCALE');
  const [reasons, setReasons] = useState<RejectionReason[]>([]);
  const [note, setNote] = useState('');
  const valid = (x: string) => /^\d+(\.\d{1,3})?$/.test(x.trim());
  const final = valid(accepted) ? Number(produceAmountKobo(toGrams(accepted.trim()), BigInt(b.plan.priceKoboPerKg))) : null;
  const less = valid(accepted) && valid(received) && Number(accepted) < Number(received);
  const save = useAction({
    request: () => ({
      path: `/bookings/${b.id}/receiving/accepted-weight`,
      body: { expectedVersion: b.version, receivedKg: received.trim(), acceptedKg: accepted.trim(), weighingMethod: method, rejectionReasons: less ? reasons : [], note: note.trim() || undefined },
    }),
    invalidate: [...bookingKeys(b.id), ['invoices']],
    success: 'Weight recorded. The farmer can see the final amount.',
    toastErrors: false,
    onSuccess: () => setOpen(false),
  });
  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        <Scale className="size-5" aria-hidden /> Record the weight
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Record the weight" description={`Agreed: ${formatKg(b.plan.agreedKg)} at ${naira(b.plan.priceKoboPerKg)} per kg. The farmer is paid for the weight you accept.`}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            {save.error ? <Alert tone="danger">{save.error.message}</Alert> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Weight received (kg)" error={save.error?.fieldErrors.receivedKg} required>
                <Input inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} />
              </Field>
              <Field label="Weight you accept (kg)" error={save.error?.fieldErrors.acceptedKg} required>
                <Input inputMode="decimal" value={accepted} onChange={(e) => setAccepted(e.target.value)} />
              </Field>
            </div>
            <Field label="How it was weighed">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="WEIGHBRIDGE">Weighbridge</option>
                <option value="PLATFORM_SCALE">Platform scale</option>
                <option value="HANGING_SCALE">Hanging scale</option>
                <option value="COUNT_ESTIMATE">Counted bags (estimate)</option>
              </Select>
            </Field>
            {less ? (
              <fieldset className="flex flex-col gap-1 rounded-xl border border-line p-3">
                <legend className="px-1 text-sm font-medium">Why was some not accepted?</legend>
                {REASONS.map((r) => (
                  <Checkbox key={r} label={REJECTION_REASON_LABELS[r]} checked={reasons.includes(r)} onChange={(e) => setReasons((x) => (e.target.checked ? [...x, r] : x.filter((y) => y !== r)))} />
                ))}
                {save.error?.fieldErrors.rejectionReasons ? <p className="text-sm text-danger">{save.error.fieldErrors.rejectionReasons}</p> : null}
              </fieldset>
            ) : null}
            <Field label="Note for the farmer (optional)">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
            </Field>
            <p className="rounded-xl bg-canvas px-4 py-3 text-sm text-muted" aria-live="polite">
              Final amount: <span className="text-lg font-semibold text-ink">{final !== null ? naira(final) : '—'}</span>
              {final !== null && final !== b.plan.estimatedAmountKobo ? ` (offer was ${naira(b.plan.estimatedAmountKobo)})` : ''}
            </p>
            <Button type="submit" size="lg" loading={save.isPending} disabled={!valid(received) || !valid(accepted)}>
              Save weight
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Buyer: records a payment made outside HarvestSlot. It shows as "Payment reported" until the farmer confirms. */
export function RecordPaymentButton({ b }: { b: BookingDetail }) {
  const pay = b.plan.payment!;
  const due = pay.outstandingKobo - pay.reportedPendingKobo;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(koboToNairaInput(due));
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(lagosDateString(new Date()));
  const kobo = nairaToKobo(amount);
  const save = useAction({
    request: () => ({ path: `/invoices/${pay.invoiceId}/payments`, body: { method, amountKobo: kobo ?? 0, payerReference: reference.trim(), paidOn } }),
    invalidate: [...bookingKeys(b.id), ['invoices'], ['invoice', pay.invoiceId]],
    success: 'Payment recorded. The farmer is asked to confirm it arrived.',
    toastErrors: false,
    onSuccess: () => setOpen(false),
  });
  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        <Wallet className="size-5" aria-hidden /> Record payment
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Record a payment" description={`Still to pay: ${naira(due)}. It shows as “Payment reported” until ${b.current.content.farmer.displayName} confirms it arrived.`}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            {save.error ? <Alert tone="danger">{save.error.message}</Alert> : null}
            <Field label="Amount (₦)" error={save.error?.fieldErrors.amountKobo} required>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="How">
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="MOBILE_MONEY">Mobile money</option>
                  <option value="CASH">Cash</option>
                </Select>
              </Field>
              <Field label="Date paid" error={save.error?.fieldErrors.paidOn}>
                <Input type="date" value={paidOn} max={lagosDateString(new Date())} onChange={(e) => setPaidOn(e.target.value)} />
              </Field>
            </div>
            <Field label="Bank or receipt reference" error={save.error?.fieldErrors.payerReference} required>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. GTB-TRF-12345" />
            </Field>
            <Button type="submit" size="lg" loading={save.isPending} disabled={!kobo || reference.trim().length < 2}>
              Record payment
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Farmer: confirm the money arrived (or say it did not). "Payment received" only after this. */
export function ConfirmPaymentActions({ b }: { b: BookingDetail }) {
  const pay = b.plan.payment!;
  const [notReceived, setNotReceived] = useState(false);
  const [note, setNote] = useState('');
  const confirm = useAction<'CONFIRMED' | 'NOT_RECEIVED'>({
    request: (decision) => ({ path: `/payments/${pay.pendingPaymentId}/receipt`, body: { decision, note: note.trim() || undefined } }),
    invalidate: [...bookingKeys(b.id), ['invoices'], ['invoice', pay.invoiceId]],
    success: (_r) => 'Thank you — recorded.',
    toastErrors: false,
    onSuccess: () => setNotReceived(false),
  });
  return (
    <>
      <Button size="lg" onClick={() => confirm.mutate('CONFIRMED')} loading={confirm.isPending && confirm.variables === 'CONFIRMED'} disabled={confirm.isPending}>
        <CheckCircle2 className="size-5" aria-hidden /> Yes, I received {naira(pay.reportedPendingKobo)}
      </Button>
      <Button size="lg" variant="outline" onClick={() => setNotReceived(true)} disabled={confirm.isPending}>
        It hasn’t arrived
      </Button>
      {confirm.error ? <Alert tone="danger">{confirm.error.message}</Alert> : null}
      <Dialog open={notReceived} onOpenChange={setNotReceived}>
        <DialogContent title="The money hasn’t arrived?" description="The buyer is told and asked to check. Nothing is marked as paid.">
          <div className="flex flex-col gap-4">
            <Field label="Anything the buyer should know (optional)">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </Field>
            <Button onClick={() => confirm.mutate('NOT_RECEIVED')} loading={confirm.isPending}>
              Tell the buyer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Farmer: agree with the recorded weight, or report a problem (nothing is accepted for them). */
export function ReviewWeightActions({ b }: { b: BookingDetail }) {
  const rec = useApi<ReceivingDto | null>(['receiving', b.id], `/bookings/${b.id}/receiving`);
  const [problem, setProblem] = useState(false);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'WEIGHT' | 'QUALITY_REJECTION'>('WEIGHT');
  const review = useAction<'ACCEPTED' | 'DISPUTED'>({
    request: (decision) => ({
      path: `/bookings/${b.id}/receiving/review`,
      body: {
        expectedVersion: rec.data?.version ?? 0,
        decision,
        ...(decision === 'DISPUTED' ? { dispute: { category, quantityInQuestionKg: b.plan.weighed && Number(b.plan.weighed.shortfallKg) > 0 ? b.plan.weighed.shortfallKg : undefined, description: description.trim() } } : {}),
      },
    }),
    invalidate: [...bookingKeys(b.id), ['disputes']],
    success: (_r) => 'Recorded — the buyer has been told.',
    toastErrors: false,
    onSuccess: () => setProblem(false),
  });
  return (
    <>
      <Button size="lg" onClick={() => review.mutate('ACCEPTED')} loading={review.isPending && review.variables === 'ACCEPTED'} disabled={!rec.data || review.isPending}>
        <CheckCircle2 className="size-5" aria-hidden /> The weight is right
      </Button>
      <Button size="lg" variant="outline" onClick={() => setProblem(true)} disabled={!rec.data || review.isPending}>
        Report a problem
      </Button>
      {review.error && !problem ? <Alert tone="danger">{review.error.message}</Alert> : null}
      <Dialog open={problem} onOpenChange={setProblem}>
        <DialogContent title="Report a problem with the weight" description="The buyer and HarvestSlot review it. The accepted part can still be paid while you wait.">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              review.mutate('DISPUTED');
            }}
          >
            {review.error ? <Alert tone="danger">{review.error.message}</Alert> : null}
            <Field label="What is wrong?">
              <Select value={category} onChange={(e) => setCategory(e.target.value as 'WEIGHT' | 'QUALITY_REJECTION')}>
                <option value="WEIGHT">The weight is wrong</option>
                <option value="QUALITY_REJECTION">Produce was wrongly refused</option>
              </Select>
            </Field>
            <Field label="Tell us what happened" hint="At least 10 characters." error={review.error?.fieldErrors['dispute.description']} required>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
            </Field>
            <Button type="submit" loading={review.isPending} disabled={description.trim().length < 10}>
              Send report
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
