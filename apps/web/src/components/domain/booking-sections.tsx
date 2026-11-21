'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, KeyRound, Paperclip, Send, Truck } from 'lucide-react';
import { toast } from 'sonner';
import {
  INCIDENT_KIND_LABELS,
  IncidentKindE,
  PARTY_LABELS,
  type AttachmentDto,
  type BookingDetail,
  type IncidentKind,
  type QuoteDto,
  type TermsVersionDto,
} from '@harvestslot/contracts';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent } from '@/components/ui/primitives';
import { ApiError, get, post, uploadFile } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';
import { isoToLagosInput, koboToNairaInput, lagosInputToIso, nairaToKobo } from '@/lib/utils';
import { ReasonActionDialog } from './dialogs';
import { Kg, Money, StatusBadge, When, Window } from './display';
import { TermsSummary } from './booking-parts';

export const bookingKeys = (id: string) => [['booking', id], ['bookings'], ['quotes', id], ['messages', id], ['receiving', id]] as const;

const FIELD_LABELS: Record<string, string> = {
  quantityKg: 'Quantity',
  priceKoboPerKg: 'Price',
  'harvest.plannedHarvestDate': 'Harvest date',
  pickupWindow: 'Pickup window',
  deliveryWindow: 'Delivery window',
  toleranceBps: 'Tolerance',
  paymentTermsDays: 'Payment terms',
  transport: 'Transport',
  freightPayer: 'Who pays transport',
  qualityTerms: 'Quality requirements',
  cancellationTerms: 'Cancellation terms',
  slot: 'Processing slot',
};

function viewerOf(b: BookingDetail): 'farmer' | 'processor' | 'transporter' | 'other' {
  if (b.viewerParties.includes('FARMER')) return 'farmer';
  if (b.viewerParties.includes('PROCESSOR')) return 'processor';
  if (b.viewerParties.includes('TRANSPORTER')) return 'transporter';
  return 'other';
}

function ConfirmationStatus({ version }: { version: TermsVersionDto }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {version.requiredParties.map((p) => {
        const c = version.confirmations.find((x) => x.party === p);
        return (
          <li key={p}>
            <Badge tone={c ? 'success' : 'warning'} title={c ? `${c.actorName ?? 'Automatic'} · ${c.method.replace(/_/g, ' ').toLowerCase()}${c.viaCooperative ? ` via ${c.viaCooperative}` : ''}` : undefined}>
              {c ? <CheckCircle2 className="size-3.5" aria-hidden /> : null}
              {PARTY_LABELS[p]}: {c ? (c.method === 'CARRIED_FORWARD' ? 'unchanged for them' : 'confirmed') : 'waiting'}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

/** Confirm the exact version of the terms (by content hash) — the core of “agreement”. */
export function ConfirmPanel({ b }: { b: BookingDetail }) {
  const target = b.pendingAmendment?.terms ?? b.current;
  const [agree, setAgree] = useState(false);
  const confirm = useAction({
    request: () => ({ path: `/bookings/${b.id}/confirm`, body: { termsVersionId: target.id, contentHash: target.contentHash } }),
    invalidate: [...bookingKeys(b.id)],
    success: 'Your confirmation is recorded',
  });
  const approve = useAction({
    request: () => ({ path: `/bookings/${b.id}/approve`, body: { expectedVersion: b.version } }),
    invalidate: [...bookingKeys(b.id)],
    success: 'Sale approved',
  });
  const canConfirm = b.allowedActions.includes('confirmTerms');
  const canApproveDraft = b.allowedActions.includes('approveDraft');
  if (!canConfirm && !canApproveDraft && !b.pendingAmendment && !['DRAFT', 'AWAITING_CONFIRMATIONS'].includes(b.status)) return null;
  return (
    <Card className={canConfirm || canApproveDraft ? 'border-forest ring-1 ring-forest' : ''}>
      <CardHeader>
        <CardTitle>
          {b.pendingAmendment
            ? `Proposed change (version ${target.versionNo})`
            : b.status === 'DRAFT'
              ? canApproveDraft
                ? 'Prepared by your cooperative — your approval is needed'
                : 'Prepared — waiting for the farmer to approve'
              : `Confirmations for version ${target.versionNo}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {b.pendingAmendment ? (
          <Alert tone="warning" title={`${PARTY_LABELS[b.pendingAmendment.proposedByParty]} proposed: ${b.pendingAmendment.reason}`}>
            Changed: {b.pendingAmendment.terms.changedFields.map((f) => FIELD_LABELS[f] ?? f).join(', ') || 'details'}. Until everyone affected confirms, version {b.current.versionNo} stays in force.
          </Alert>
        ) : null}
        <ConfirmationStatus version={target} />
        {b.confirmationDeadline && ['DRAFT', 'AWAITING_CONFIRMATIONS'].includes(b.status) ? (
          <p className="text-sm text-amber-ink">
            The capacity hold expires <When at={b.confirmationDeadline} relative />. If confirmations are not complete by then, the booking expires and nothing is reserved.
          </p>
        ) : null}
        {b.status === 'DRAFT' && !canApproveDraft ? (
          <p className="text-sm text-muted">Nothing is agreed until the farmer (or a representative they allowed to approve sales) approves it. The capacity hold expires if nobody does.</p>
        ) : null}
        {canApproveDraft ? (
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={() => approve.mutate()} loading={approve.isPending}>
              Approve this sale
            </Button>
            {b.allowedActions.includes('discardDraft') ? <ReasonActionDialog trigger="Discard" triggerSize="lg" title="Discard the prepared acceptance?" confirmLabel="Discard" path={`/bookings/${b.id}/discard`} body={{ expectedVersion: b.version }} invalidate={[...bookingKeys(b.id)]} success="Discarded" /> : null}
          </div>
        ) : null}
        {canConfirm ? (
          <>
            {b.pendingAmendment ? (
              <details open className="rounded-lg border border-line p-3">
                <summary className="cursor-pointer font-medium">Review the proposed terms</summary>
                <div className="mt-3">
                  <TermsSummary terms={target.content} viewer={viewerOf(b)} />
                </div>
              </details>
            ) : null}
            <Checkbox label={`I have read version ${target.versionNo} of the terms and agree to them`} checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={() => confirm.mutate()} loading={confirm.isPending} disabled={!agree}>
                <CheckCircle2 className="size-5" aria-hidden /> Confirm these terms
              </Button>
              {b.pendingAmendment && b.allowedActions.includes('rejectAmendment') ? (
                <ReasonActionDialog trigger="Reject the change" triggerSize="lg" title="Reject this change?" description={`Version ${b.current.versionNo} stays in force.`} confirmLabel="Reject change" path={`/bookings/${b.id}/amendments/decide`} body={{ termsVersionId: target.id, contentHash: target.contentHash, decision: 'REJECT' }} invalidate={[...bookingKeys(b.id)]} success="Change rejected" />
              ) : null}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function AmendDialog({ b }: { b: BookingDetail }) {
  const c = b.current.content;
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(c.quantityKg);
  const [price, setPrice] = useState(koboToNairaInput(c.priceKoboPerKg));
  const [date, setDate] = useState(c.harvest.plannedHarvestDate);
  const [pickupStart, setPickupStart] = useState(isoToLagosInput(c.pickupWindow.start));
  const [pickupEnd, setPickupEnd] = useState(isoToLagosInput(c.pickupWindow.end));
  const [reason, setReason] = useState('');
  const amend = useAction({
    request: () => {
      const body: Record<string, unknown> = { baseVersionNo: b.current.versionNo, reason };
      if (qty !== c.quantityKg) body.quantityKg = qty;
      const p = nairaToKobo(price);
      if (p !== null && p !== c.priceKoboPerKg) body.priceKoboPerKg = p;
      if (date !== c.harvest.plannedHarvestDate) body.plannedHarvestDate = date;
      if (pickupStart !== isoToLagosInput(c.pickupWindow.start)) body.pickupWindowStart = lagosInputToIso(pickupStart);
      if (pickupEnd !== isoToLagosInput(c.pickupWindow.end)) body.pickupWindowEnd = lagosInputToIso(pickupEnd);
      return { path: `/bookings/${b.id}/amendments`, body };
    },
    invalidate: [...bookingKeys(b.id)],
    success: 'Change proposed. The other parties have been asked to confirm.',
    toastErrors: false,
    onSuccess: () => setOpen(false),
  });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Propose a change
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Propose a change to the terms" description="A new version is created. Only parties whose part changes must confirm again; the current version stays in force until then.">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              amend.mutate();
            }}
          >
            {amend.error ? <Alert tone="danger">{amend.error.message}</Alert> : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Quantity (kg)">
                <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
              </Field>
              <Field label="Price (₦/kg)">
                <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
              </Field>
              <Field label="Harvest date">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <div />
              <Field label="Pickup from">
                <Input type="datetime-local" value={pickupStart} onChange={(e) => setPickupStart(e.target.value)} />
              </Field>
              <Field label="Pickup until">
                <Input type="datetime-local" value={pickupEnd} onChange={(e) => setPickupEnd(e.target.value)} />
              </Field>
            </div>
            <Field label="Why is this change needed?" required>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Button type="submit" loading={amend.isPending} disabled={reason.trim().length < 5}>
              Propose change
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TransportPanel({ b }: { b: BookingDetail }) {
  const c = b.current.content;
  const viewer = viewerOf(b);
  const mayDecide = (c.freightPayer === 'PROCESSOR' && b.allowedActions.includes('manageTransport')) || (c.freightPayer === 'FARMER' && viewer === 'farmer');
  const quotes = useApi<QuoteDto[]>(['quotes', b.id], viewer === 'processor' || viewer === 'farmer' || viewer === 'other' ? `/bookings/${b.id}/quotes` : null);
  const open = (quotes.data ?? []).filter((q) => q.status === 'SUBMITTED');
  return (
    <Card id="transport">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="size-5" aria-hidden /> Transport
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {c.transport ? (
          <div className="text-sm">
            <p>
              <strong>{c.transport.transporterName}</strong> · {c.transport.vehiclePlate} ({c.transport.vehicleType.replace(/_/g, ' ').toLowerCase()}, up to <Kg kg={c.transport.vehicleCapacityKg} />)
            </p>
            <p className="text-muted">
              <Money kobo={c.transport.priceKobo} />, paid by the {c.transport.freightPayer.toLowerCase()} · pickup <Window start={c.transport.pickupWindow.start} end={c.transport.pickupWindow.end} />
            </p>
          </div>
        ) : (
          <Alert tone="warning" title="Transport not arranged yet">
            Transporters serving {c.harvest.pickupLga} can quote. {mayDecide ? 'Accept one quote below.' : c.freightPayer === 'PROCESSOR' ? 'The processor chooses the transporter.' : ''}
          </Alert>
        )}
        {b.shipment ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-canvas p-3 text-sm">
            <StatusBadge kind="shipment" status={b.shipment.status} />
            <span>
              {b.shipment.vehiclePlate} · driver {b.shipment.driverName}
            </span>
            {b.shipment.collectedKg ? (
              <span>
                · loaded <Kg kg={b.shipment.collectedKg} /> (driver’s count)
              </span>
            ) : null}
          </div>
        ) : null}
        {open.length ? (
          <ul className="flex flex-col gap-2">
            {open.map((q) => (
              <li key={q.id} className="flex flex-col gap-2 rounded-lg border border-line p-3 text-sm sm:flex-row sm:items-center">
                <div className="flex-1">
                  <p className="font-medium">
                    {q.transporterName} {q.transporterReviewed ? <Badge tone="success">Reviewed</Badge> : <Badge tone="warning">Not yet reviewed</Badge>}
                  </p>
                  <p>
                    <Money kobo={q.priceKobo} /> · {q.vehicle.plate} ({q.vehicle.type.replace(/_/g, ' ').toLowerCase()}, <Kg kg={q.vehicle.capacityKg} />)
                  </p>
                  <p className="text-muted">
                    Pickup <Window start={q.pickupWindowStart} end={q.pickupWindowEnd} /> · valid until <When at={q.validUntil} />
                  </p>
                  {q.changesAgreedWindows ? <p className="text-amber-ink">Outside the agreed windows — accepting it creates a change the farmer must confirm.</p> : null}
                </div>
                {mayDecide ? (
                  <div className="flex gap-2">
                    <AcceptQuote quote={q} bookingId={b.id} />
                    <ReasonActionDialog trigger="Decline" triggerSize="sm" title="Decline this quote?" confirmLabel="Decline" path={`/quotes/${q.id}/decline`} body={{ expectedVersion: q.version }} reasonOptional invalidate={[['quotes', b.id]]} success="Quote declined" />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : !c.transport && quotes.data ? (
          <p className="text-sm text-muted">No quotes yet. Transporters are notified automatically.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AcceptQuote({ quote, bookingId }: { quote: QuoteDto; bookingId: string }) {
  const accept = useAction({
    request: () => ({ path: `/quotes/${quote.id}/accept`, body: { expectedVersion: quote.version } }),
    invalidate: [...bookingKeys(bookingId)],
    success: 'Quote accepted — a vehicle hold is in place until the transporter assigns a driver',
  });
  return (
    <Button size="sm" onClick={() => accept.mutate()} loading={accept.isPending}>
      Accept quote
    </Button>
  );
}

/** Farmer-side handover at the farm: confirm in the app, or show a one-time code to the driver. */
export function PickupPanel({ b }: { b: BookingDetail }) {
  const s = b.shipment;
  const [qty, setQty] = useState('');
  const [agree, setAgree] = useState(false);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const confirm = useAction({
    request: () => ({ path: `/shipments/${s!.id}/confirm-pickup`, body: { agree: true, ...(qty ? { farmerReportedQuantityKg: qty } : {}) } }),
    invalidate: [...bookingKeys(b.id)],
    success: 'Pickup confirmed',
  });
  if (!s || !b.viewerParties.includes('FARMER') || s.pickupConfirmedAt || !['ARRIVED_AT_PICKUP', 'COLLECTED'].includes(s.status)) return null;
  const issue = async () => {
    try {
      setCode(await post<{ code: string; expiresAt: string }>(`/shipments/${s.id}/handover-code`, { purpose: 'PICKUP' }));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not create a code');
    }
  };
  return (
    <Card id="pickup" className="border-forest ring-1 ring-forest">
      <CardHeader>
        <CardTitle>Hand over your produce</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {s.status === 'ARRIVED_AT_PICKUP' ? <p className="text-sm">The driver ({s.driverName}, {s.vehiclePlate}) has arrived. When loading is finished, they record the quantity.</p> : null}
        {s.status === 'COLLECTED' ? (
          <>
            <p className="text-sm">
              The driver recorded <strong><Kg kg={s.collectedKg} /></strong> loaded. Confirm only if the produce has left your hands.
            </p>
            <Field label="Your own count (kg, optional)" hint="If it differs from the driver’s, both are kept on record.">
              <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Checkbox label="I handed over this produce to the driver" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={() => confirm.mutate()} loading={confirm.isPending} disabled={!agree}>
                Confirm pickup
              </Button>
              <Button size="lg" variant="outline" onClick={() => void issue()}>
                <KeyRound className="size-5" aria-hidden /> Give the driver a code instead
              </Button>
            </div>
            {code ? (
              <Alert tone="info" title="Tell the driver this code">
                <span className="block text-3xl font-bold tracking-[0.3em] text-forest tabular">{code.code}</span>
                It works once and expires <When at={code.expiresAt} relative />. Never share it before the produce is loaded.
              </Alert>
            ) : null}
          </>
        ) : null}
        {s.exceptionReason ? <Alert tone="warning" title="The driver reported a handover problem">{s.exceptionReason}</Alert> : null}
      </CardContent>
    </Card>
  );
}

/** Receiving staff confirm the truck's arrival, or issue a delivery code for the driver. */
export function DeliveryPanel({ b }: { b: BookingDetail }) {
  const s = b.shipment;
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const confirm = useAction({ request: () => ({ path: `/shipments/${s!.id}/confirm-delivery` }), invalidate: [...bookingKeys(b.id)], success: 'Delivery confirmed — record the weighing next' });
  const approve = useAction({ request: () => ({ path: `/shipments/${s!.id}/approve-exception`, body: { reason: 'Approved after checking with the farmer and driver' } }), invalidate: [...bookingKeys(b.id)], success: 'Handover exception approved' });
  if (!s || !b.allowedActions.includes('receiving')) return null;
  if (s.exceptionReason && !s.pickupConfirmedAt) {
    return (
      <Alert tone="warning" title="Driver reported a pickup handover problem" action={<Button size="sm" onClick={() => approve.mutate()} loading={approve.isPending}>Approve exception</Button>}>
        {s.exceptionReason}
      </Alert>
    );
  }
  if (s.status !== 'ARRIVED_AT_FACILITY') return null;
  return (
    <Card className="border-forest">
      <CardHeader>
        <CardTitle>Truck has arrived</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button onClick={() => confirm.mutate()} loading={confirm.isPending}>
          Confirm delivery received
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              setCode(await post<{ code: string; expiresAt: string }>(`/shipments/${s.id}/handover-code`, { purpose: 'DELIVERY' }));
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : 'Could not create a code');
            }
          }}
        >
          Give driver a delivery code
        </Button>
        {code ? (
          <p className="w-full text-sm">
            Code: <strong className="text-xl tracking-widest">{code.code}</strong> (expires <When at={code.expiresAt} relative />)
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function HarvestProgress({ b }: { b: BookingDetail }) {
  const [kg, setKg] = useState(b.current.content.quantityKg);
  const start = useAction({ request: () => ({ path: `/bookings/${b.id}/start-harvest`, body: { expectedVersion: b.version } }), invalidate: [...bookingKeys(b.id)], success: 'Harvest started' });
  const ready = useAction({ request: () => ({ path: `/bookings/${b.id}/ready-for-pickup`, body: { reportedHarvestedKg: kg } }), invalidate: [...bookingKeys(b.id)], success: 'Marked ready for pickup — the transporter has been told' });
  if (!b.allowedActions.includes('startHarvest') && !b.allowedActions.includes('readyForPickup')) return null;
  return (
    <Card className="border-forest ring-1 ring-forest">
      <CardHeader>
        <CardTitle>{b.allowedActions.includes('startHarvest') ? 'You can harvest now' : 'Harvest in progress'}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {b.allowedActions.includes('startHarvest') ? (
          <>
            <p className="text-sm">Every check has passed: buyer, processing slot, transport, vehicle and driver are confirmed. Harvest so the produce is ready for the pickup window.</p>
            <Button size="lg" onClick={() => start.mutate()} loading={start.isPending}>
              I have started harvesting
            </Button>
          </>
        ) : (
          <>
            <Field label="How much did you harvest? (kg)">
              <Input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} />
            </Field>
            <Button size="lg" onClick={() => ready.mutate()} loading={ready.isPending}>
              Ready for pickup
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

type Message = { id: string; authorName: string; authorParty: string; actingForFarmer: boolean; body: string; createdAt: string; mine: boolean };

export function Messages({ b }: { b: BookingDetail }) {
  const q = useApi<Message[]>(['messages', b.id], `/bookings/${b.id}/messages`, { refetchInterval: 20_000 });
  const [body, setBody] = useState('');
  const send = useAction({ request: () => ({ path: `/bookings/${b.id}/messages`, body: { body }, idempotent: false }), invalidate: [['messages', b.id]], onSuccess: () => setBody('') });
  const canSend = b.allowedActions.includes('message');
  return (
    <Card id="messages">
      <CardHeader>
        <CardTitle>Messages</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted">Messages are part of the booking record. They do not change the agreed terms — use “Propose a change” for that.</p>
        <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {(q.data ?? []).map((m) => (
            <li key={m.id} className={`max-w-[85%] rounded-lg p-2 text-sm ${m.mine ? 'self-end bg-leaf-50' : 'bg-canvas'}`}>
              <p className="text-xs font-medium text-muted">
                {m.authorName} · {PARTY_LABELS[m.authorParty as keyof typeof PARTY_LABELS] ?? m.authorParty}
                {m.actingForFarmer ? ' (for the farmer)' : ''} · <When at={m.createdAt} />
              </p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
          {q.data?.length === 0 ? <li className="text-sm text-muted">No messages yet.</li> : null}
        </ul>
        {canSend ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (body.trim()) send.mutate();
            }}
          >
            <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message" aria-label="Message" maxLength={2000} />
            <Button type="submit" loading={send.isPending} aria-label="Send message">
              <Send className="size-4" aria-hidden />
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

const UPLOAD_PURPOSES = [
  { value: 'HARVEST_PHOTO', label: 'Harvest photo', who: 'farmer' },
  { value: 'PICKUP_EVIDENCE', label: 'Pickup evidence', who: 'any' },
  { value: 'DELIVERY_EVIDENCE', label: 'Delivery evidence', who: 'any' },
  { value: 'MESSAGE_ATTACHMENT', label: 'Other document', who: 'any' },
] as const;

export function Documents({ b }: { b: BookingDetail }) {
  const q = useApi<AttachmentDto[]>(['attachments', b.id], `/bookings/${b.id}/attachments`);
  const [purpose, setPurpose] = useState<string>('MESSAGE_ATTACHMENT');
  const [busy, setBusy] = useState(false);
  const open = async (a: AttachmentDto) => {
    try {
      const link = await get<{ url: string }>(`/attachments/${a.id}/link`);
      window.open(link.url, '_blank', 'noopener');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not open the file');
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="size-5" aria-hidden /> Documents and photos
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted">Photos are evidence of what someone recorded; they do not certify weight or quality. Files are private to the booking’s participants.</p>
        <ul className="flex flex-col gap-1 text-sm">
          {(q.data ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2">
              <button type="button" className="text-leaf underline" onClick={() => void open(a)}>
                {a.filename}
              </button>
              <span className="text-xs text-muted">
                {a.purpose.replace(/_/g, ' ').toLowerCase()} · {a.uploadedBy} · <When at={a.createdAt} />
              </span>
              {a.scanStatus === 'NOT_SCANNED' ? <Badge tone="neutral">Not virus-scanned</Badge> : a.scanStatus === 'PENDING' ? <Badge tone="warning">Scan pending</Badge> : null}
            </li>
          ))}
          {q.data?.length === 0 ? <li className="text-muted">None yet.</li> : null}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="Type" className="sm:w-56">
            <Select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
              {UPLOAD_PURPOSES.filter((p) => p.who === 'any' || b.viewerParties.includes('FARMER')).map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-canvas">
            {busy ? 'Uploading…' : 'Upload photo or PDF'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              capture="environment"
              className="sr-only"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setBusy(true);
                try {
                  await uploadFile(file, { purpose, bookingId: b.id, capturedAt: new Date(file.lastModified).toISOString() });
                  toast.success('Uploaded');
                  await q.refetch();
                } catch (err) {
                  toast.error(err instanceof ApiError ? err.message : 'Upload failed');
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        </div>
      </CardContent>
    </Card>
  );
}

export function Incidents({ b }: { b: BookingDetail }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<IncidentKind>('OTHER');
  const [description, setDescription] = useState('');
  const [blocking, setBlocking] = useState(true);
  const report = useAction({
    request: () => ({ path: `/bookings/${b.id}/incidents`, body: { kind, description, blocking } }),
    invalidate: [...bookingKeys(b.id)],
    success: 'Problem reported. Everyone on the booking was told.',
    onSuccess: () => {
      setOpen(false);
      setDescription('');
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Problems</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {b.incidents.length === 0 ? <p className="text-sm text-muted">No problems reported.</p> : null}
        {b.incidents.map((i) => (
          <div key={i.id} className="rounded-lg border border-line p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {INCIDENT_KIND_LABELS[i.kind]} <StatusBadge kind="generic" status={i.status} />
              {i.blocking && i.status === 'OPEN' ? <Badge tone="danger">Blocks harvest</Badge> : null}
            </p>
            <p>{i.description}</p>
            {i.recoveryAction ? <p className="text-muted">Recovery: {i.recoveryAction}</p> : null}
            {i.status === 'OPEN' && (b.viewerParties.includes('PROCESSOR') || b.viewerParties.includes('ADMIN') || b.viewerParties.includes('FARMER')) ? (
              <div className="mt-2">
                <ReasonActionDialog
                  trigger="Mark resolved"
                  triggerSize="sm"
                  tone="primary"
                  title="How was it resolved?"
                  reasonLabel="Recovery action (at least 10 characters)"
                  confirmLabel="Resolve"
                  path={`/bookings/${b.id}/incidents/${i.id}/resolve`}
                  invalidate={[...bookingKeys(b.id)]}
                  success="Marked resolved"
                  bodyKey="recoveryAction"
                  minLength={10}
                />
              </div>
            ) : null}
          </div>
        ))}
        {b.allowedActions.includes('openIncident') ? (
          <>
            <Button variant="outline" onClick={() => setOpen(true)}>
              Report a problem
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent title="Report a problem" description="A blocking problem keeps the booking “Not ready” until it is resolved.">
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    report.mutate();
                  }}
                >
                  <Field label="What kind of problem?">
                    <Select value={kind} onChange={(e) => setKind(e.target.value as IncidentKind)}>
                      {IncidentKindE.values.map((k) => (
                        <option key={k} value={k}>
                          {INCIDENT_KIND_LABELS[k]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Describe it" hint="At least 10 characters." required>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
                  </Field>
                  <Checkbox label="This stops the harvest or pickup going ahead" checked={blocking} onChange={(e) => setBlocking(e.target.checked)} />
                  <Button type="submit" loading={report.isPending} disabled={description.trim().length < 10}>
                    Report problem
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </>
        ) : null}
        <p className="text-xs text-muted">
          For weight, quality or payment disagreements, <Link className="underline" href={`/disputes?new=${b.id}`}>open a dispute</Link>.
        </p>
      </CardContent>
    </Card>
  );
}
