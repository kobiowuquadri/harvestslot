'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  DISPOSITION_LABELS,
  ProcessingProductE,
  REJECTION_REASON_LABELS,
  RejectedDispositionE,
  RejectionReasonE,
  WEIGHING_METHOD_LABELS,
  WeighingMethodE,
  type BookingDetail,
  type FacilityDto,
  type ReceivingDto,
  type RejectedDisposition,
  type RejectionReason,
} from '@harvestslot/contracts';
import { z } from 'zod';
import { processingSchema } from '@harvestslot/contracts';
import { Kg, Money, StatusBadge, When } from '@/components/domain/display';
import { PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, RadioCards, Select, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, DescriptionList } from '@/components/ui/primitives';
import { ApiError, uploadFile } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';

type Processing = z.infer<typeof processingSchema>;
const keys = (id: string) => [['receiving', id], ['booking', id], ['processing', id], ['bookings']];

function WeighingForm({ bookingId, existing }: { bookingId: string; existing: ReceivingDto | null }) {
  const [gross, setGross] = useState(existing?.grossKg ?? '');
  const [tare, setTare] = useState(existing?.tareKg ?? '0');
  const [method, setMethod] = useState<string>(existing?.weighingMethod ?? 'WEIGHBRIDGE');
  const [scaleRef, setScaleRef] = useState(existing?.scaleReference ?? '');
  const [note, setNote] = useState('');
  const save = useAction({
    request: () => ({ path: `/bookings/${bookingId}/receiving/weighing`, body: { grossKg: gross, tareKg: tare || '0', weighingMethod: method, scaleReference: scaleRef || undefined, note: note || undefined } }),
    invalidate: keys(bookingId),
    success: 'Weighing recorded',
    toastErrors: false,
  });
  const net = Number(gross) - Number(tare || 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{existing ? 'Re-weigh' : '1. Record the weighing'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {save.error ? <Alert tone="danger" className="sm:col-span-2">{save.error.message}</Alert> : null}
          <Field label="Gross weight (kg)" error={save.error?.fieldErrors.grossKg} required>
            <Input inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} />
          </Field>
          <Field label="Tare (kg)" hint="Truck or container weight to subtract." error={save.error?.fieldErrors.tareKg}>
            <Input inputMode="decimal" value={tare} onChange={(e) => setTare(e.target.value)} />
          </Field>
          <Field label="How was it weighed?">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {WeighingMethodE.values.map((m) => (
                <option key={m} value={m}>
                  {WEIGHING_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ticket or scale reference">
            <Input value={scaleRef} onChange={(e) => setScaleRef(e.target.value)} />
          </Field>
          <Field label="Note" className="sm:col-span-2">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <p className="text-sm sm:col-span-2">Net: {Number.isFinite(net) && net > 0 ? <strong><Kg kg={net.toFixed(3)} /></strong> : '—'}</p>
          <Button type="submit" loading={save.isPending} disabled={!gross} className="sm:col-span-2">
            Save weighing
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EvidenceUpload({ bookingId }: { bookingId: string }) {
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<'WEIGHBRIDGE_TICKET' | 'SCALE_PHOTO' | 'QUALITY'>('WEIGHBRIDGE_TICKET');
  const [reference, setReference] = useState('');
  const addEvidence = useAction<{ attachmentId: string; kind: string }>({
    request: ({ attachmentId, kind: k }) => ({ path: `/bookings/${bookingId}/receiving/evidence`, body: { kind: k, attachmentId, reference: reference || undefined } }),
    invalidate: keys(bookingId),
    success: 'Evidence attached',
  });
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field label="Evidence type" className="sm:w-56">
        <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="WEIGHBRIDGE_TICKET">Weighbridge ticket</option>
          <option value="SCALE_PHOTO">Scale photo</option>
          <option value="QUALITY">Quality photo</option>
        </Select>
      </Field>
      <Field label="Reference (optional)">
        <Input value={reference} onChange={(e) => setReference(e.target.value)} />
      </Field>
      <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium hover:bg-leaf-50">
        {busy ? 'Uploading…' : 'Upload photo or PDF'}
        <input
          type="file"
          className="sr-only"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          capture="environment"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setBusy(true);
            try {
              const a = await uploadFile<{ id: string }>(file, { purpose: kind === 'QUALITY' ? 'QUALITY_PHOTO' : 'WEIGHT_EVIDENCE', bookingId, capturedAt: new Date(file.lastModified).toISOString() });
              if (kind !== 'QUALITY') addEvidence.mutate({ attachmentId: a.id, kind });
              else toast.success('Quality photo attached');
            } catch (err) {
              toast.error(err instanceof ApiError ? err.message : 'Upload failed');
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
    </div>
  );
}

function DecisionForm({ r, bookingId }: { r: ReceivingDto; bookingId: string }) {
  const [accepted, setAccepted] = useState(r.netKg);
  const [rejected, setRejected] = useState('0');
  const [reasons, setReasons] = useState<RejectionReason[]>([]);
  const [disposition, setDisposition] = useState<RejectedDisposition>('NONE');
  const [rejectionNote, setRejectionNote] = useState('');
  const [soilOk, setSoilOk] = useState(true);
  const [rot, setRot] = useState('');
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const submit = useAction({
    request: () => ({
      path: `/bookings/${bookingId}/receiving/decision`,
      body: {
        expectedVersion: r.version,
        acceptedKg: accepted,
        rejectedKg: rejected || '0',
        rejectionReasons: reasons,
        rejectionNote: rejectionNote || undefined,
        rejectedDisposition: Number(rejected) > 0 ? disposition : 'NONE',
        criteriaResults: { soilAndStemsRemoved: soilOk, ...(rot ? { visibleRotPercent: Number(rot) } : {}) },
        hoursSinceHarvest: hours ? Number(hours) : undefined,
        note: note || undefined,
      },
    }),
    invalidate: keys(bookingId),
    success: 'Decision submitted — the farmer has been asked to review it',
    toastErrors: false,
  });
  const sum = Number(accepted || 0) + Number(rejected || 0);
  const mismatch = Math.abs(sum - Number(r.netKg)) > 0.0005;
  return (
    <Card>
      <CardHeader>
        <CardTitle>3. Quality decision</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {submit.error ? <Alert tone="danger">{submit.error.message}</Alert> : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Accepted (kg)" error={submit.error?.fieldErrors.acceptedKg} required>
            <Input inputMode="decimal" value={accepted} onChange={(e) => setAccepted(e.target.value)} />
          </Field>
          <Field label="Rejected (kg)" error={submit.error?.fieldErrors.rejectedKg}>
            <Input inputMode="decimal" value={rejected} onChange={(e) => setRejected(e.target.value)} />
          </Field>
        </div>
        {mismatch ? <Alert tone="warning">Accepted + rejected ({sum.toFixed(3)} kg) must equal the net weight (<Kg kg={r.netKg} />).</Alert> : null}
        {Number(rejected) > 0 ? (
          <>
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-medium">Reasons for rejection</legend>
              {RejectionReasonE.values.map((x) => (
                <Checkbox key={x} label={REJECTION_REASON_LABELS[x]} checked={reasons.includes(x)} onChange={(e) => setReasons((p) => (e.target.checked ? [...p, x] : p.filter((y) => y !== x)))} />
              ))}
              {submit.error?.fieldErrors.rejectionReasons ? <p className="text-sm text-danger">{submit.error.fieldErrors.rejectionReasons}</p> : null}
            </fieldset>
            <Field label="What happens to the rejected cassava?" error={submit.error?.fieldErrors.rejectedDisposition}>
              <Select value={disposition} onChange={(e) => setDisposition(e.target.value as RejectedDisposition)}>
                {RejectedDispositionE.values.map((d) => (
                  <option key={d} value={d}>
                    {DISPOSITION_LABELS[d]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Rejection details">
              <Textarea value={rejectionNote} onChange={(e) => setRejectionNote(e.target.value)} />
            </Field>
          </>
        ) : null}
        <fieldset className="grid grid-cols-1 gap-4 rounded-lg border border-line p-3 sm:grid-cols-3">
          <legend className="px-1 text-sm font-medium">Checks against the agreed quality terms</legend>
          <Checkbox label="Soil and stems removed" checked={soilOk} onChange={(e) => setSoilOk(e.target.checked)} />
          <Field label="Visible rot (%)">
            <Input inputMode="numeric" value={rot} onChange={(e) => setRot(e.target.value)} />
          </Field>
          <Field label="Hours since harvest">
            <Input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
          </Field>
        </fieldset>
        <Field label="Note">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button size="lg" onClick={() => submit.mutate()} loading={submit.isPending} disabled={mismatch}>
          Submit decision for the farmer’s review
        </Button>
      </CardContent>
    </Card>
  );
}

function FarmerReview({ r, bookingId }: { r: ReceivingDto; bookingId: string }) {
  const [mode, setMode] = useState<'ACCEPTED' | 'DISPUTED'>('ACCEPTED');
  const [category, setCategory] = useState<'WEIGHT' | 'QUALITY_REJECTION'>('WEIGHT');
  const [qty, setQty] = useState('');
  const [description, setDescription] = useState('');
  const review = useAction({
    request: () => ({
      path: `/bookings/${bookingId}/receiving/review`,
      body: { expectedVersion: r.version, decision: mode, ...(mode === 'DISPUTED' ? { dispute: { category, quantityInQuestionKg: qty || undefined, description } } : {}) },
    }),
    invalidate: [...keys(bookingId), ['invoices'], ['disputes']],
    success: mode === 'ACCEPTED' ? 'Accepted. The processor’s invoice to you is being issued.' : 'Dispute opened. The undisputed amount is still invoiced.',
    toastErrors: false,
  });
  return (
    <Card className="border-forest ring-1 ring-forest">
      <CardHeader>
        <CardTitle>Do you agree with the facility’s decision?</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {r.reviewDeadline ? (
          <p className="text-sm text-amber-ink">
            Please answer by <When at={r.reviewDeadline} />. If you do not, the case goes to a HarvestSlot administrator — it is never treated as accepted automatically.
          </p>
        ) : null}
        {review.error ? <Alert tone="danger">{review.error.message}</Alert> : null}
        <RadioCards
          legend="Your answer"
          name="review"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'ACCEPTED', label: 'I accept the weight and quality decision' },
            { value: 'DISPUTED', label: 'I disagree', description: 'Opens a dispute with evidence. Payment for the part you do not dispute continues.' },
          ]}
        />
        {mode === 'DISPUTED' ? (
          <>
            <Field label="What do you disagree with?">
              <Select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
                <option value="WEIGHT">The weight</option>
                <option value="QUALITY_REJECTION">The rejected quantity</option>
              </Select>
            </Field>
            <Field label="Quantity in question (kg, optional)">
              <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label="Explain what you believe happened" hint="At least 10 characters." required>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </>
        ) : null}
        <Button size="lg" onClick={() => review.mutate()} loading={review.isPending} disabled={mode === 'DISPUTED' && description.trim().length < 10}>
          {mode === 'ACCEPTED' ? 'Accept' : 'Open dispute'}
        </Button>
      </CardContent>
    </Card>
  );
}

function ProcessingPanel({ booking }: { booking: BookingDetail }) {
  const q = useApi<Processing>(['processing', booking.id], `/bookings/${booking.id}/processing`);
  const facility = useApi<FacilityDto>(['facility', booking.current.content.facility.id], `/facilities/${booking.current.content.facility.id}`);
  const [lineId, setLineId] = useState(booking.current.content.line.id);
  const [inputKg, setInputKg] = useState('');
  const [product, setProduct] = useState<string>(booking.current.content.line.product);
  const [outputKg, setOutputKg] = useState('');
  const [lossKg, setLossKg] = useState('');
  const [lossReason, setLossReason] = useState('');
  const start = useAction({ request: () => ({ path: `/bookings/${booking.id}/processing/start`, body: { lineId, inputKg } }), invalidate: [['processing', booking.id]], success: 'Processing started' });
  const complete = useAction({
    request: () => ({ path: `/bookings/${booking.id}/processing/complete`, body: { outputProduct: product, outputKg: outputKg || undefined, handlingLossKg: lossKg || undefined, handlingLossReason: lossReason || undefined } }),
    invalidate: [['processing', booking.id]],
    success: 'Processing completed',
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Processing</CardTitle>
      </CardHeader>
      <CardContent>
        <QueryView query={q}>
          {(p) => (
            <div className="flex flex-col gap-4">
              <p className="text-sm">
                Status: <StatusBadge kind="generic" status={p.status} /> {p.inputKg ? <>· input <Kg kg={p.inputKg} /></> : null} {p.outputKg ? <>· output <Kg kg={p.outputKg} /> {p.outputProduct?.toLowerCase()}</> : null}
              </p>
              <p className="text-xs text-muted">{p.conversionNote}</p>
              {p.status === 'NOT_STARTED' ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
                  <Field label="Line">
                    <Select value={lineId} onChange={(e) => setLineId(e.target.value)}>
                      {(facility.data?.lines ?? [booking.current.content.line]).map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Input (kg)">
                    <Input inputMode="decimal" value={inputKg} onChange={(e) => setInputKg(e.target.value)} />
                  </Field>
                  <Button onClick={() => start.mutate()} loading={start.isPending} disabled={!inputKg}>
                    Start processing
                  </Button>
                </div>
              ) : null}
              {p.status === 'IN_PROGRESS' ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Product">
                    <Select value={product} onChange={(e) => setProduct(e.target.value)}>
                      {ProcessingProductE.values.map((x) => (
                        <option key={x} value={x}>
                          {x.toLowerCase()}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Output (kg, measured — leave empty if not measured)">
                    <Input inputMode="decimal" value={outputKg} onChange={(e) => setOutputKg(e.target.value)} />
                  </Field>
                  <Field label="Handling loss (kg, optional)">
                    <Input inputMode="decimal" value={lossKg} onChange={(e) => setLossKg(e.target.value)} />
                  </Field>
                  <Field label="Loss reason">
                    <Input value={lossReason} onChange={(e) => setLossReason(e.target.value)} />
                  </Field>
                  <Button onClick={() => complete.mutate()} loading={complete.isPending} className="sm:col-span-2">
                    Complete processing
                  </Button>
                </div>
              ) : null}
              {p.losses.length ? (
                <ul className="text-sm">
                  {p.losses.map((l, i) => (
                    <li key={i}>
                      {l.stage.replace(/_/g, ' ').toLowerCase()}: <Kg kg={l.quantityKg} /> ({l.method === 'MEASURED_WEIGHT' ? 'measured' : 'estimated'}) — {l.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </QueryView>
      </CardContent>
    </Card>
  );
}

export default function ReceivingPage() {
  const { id } = useParams<{ id: string }>();
  const booking = useApi<BookingDetail>(['booking', id], `/bookings/${id}`);
  const q = useApi<ReceivingDto | null>(['receiving', id], `/bookings/${id}/receiving`);
  return (
    <QueryView query={booking}>
      {(b) => {
        const processorSide = b.allowedActions.includes('receiving');
        return (
          <div className="flex flex-col gap-6">
            <PageHeader
              eyebrow={
                <Link className="underline" href={`/bookings/${id}`}>
                  Booking {b.reference}
                </Link>
              }
              title="Receiving and quality"
              description={`${b.current.content.farmer.displayName} · contracted ${b.current.content.quantityKg} kg ±${b.current.content.toleranceBps / 100}%`}
            />
            {q.isLoading ? null : q.data === null || q.data === undefined ? (
              processorSide ? (
                b.shipment?.status === 'DELIVERED' || b.shipment?.status === 'ARRIVED_AT_FACILITY' ? (
                  <WeighingForm bookingId={id} existing={null} />
                ) : (
                  <Alert tone="info">Weighing can be recorded once the delivery has arrived at the facility.</Alert>
                )
              ) : (
                <Alert tone="info">Nothing has been recorded at the facility yet.</Alert>
              )
            ) : (
              (() => {
                const r = q.data;
                return (
                  <>
                    <Card>
                      <CardHeader>
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle>Facility record</CardTitle>
                          <StatusBadge kind="receiving" status={r.status} />
                          <Badge tone={r.weightVerification === 'ADMIN_REVIEWED' ? 'success' : r.weightVerification === 'DOCUMENT_UPLOADED' ? 'info' : 'warning'}>
                            Weight: {r.weightVerification === 'SELF_REPORTED' ? 'recorded by facility (no document)' : r.weightVerification === 'DOCUMENT_UPLOADED' ? 'ticket or photo attached' : 'reviewed by admin'}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4">
                        <DescriptionList
                          items={[
                            ['Contracted', <Kg key="c" kg={r.contractedKg} />],
                            ['Driver’s pickup count', <Kg key="p" kg={r.reportedPickupKg} />],
                            ['Gross / tare', <span key="g"><Kg kg={r.grossKg} /> / <Kg kg={r.tareKg} /></span>],
                            ['Net weight', <strong key="n"><Kg kg={r.netKg} /></strong>],
                            ['Method', `${WEIGHING_METHOD_LABELS[r.weighingMethod]}${r.scaleReference ? ` · ref ${r.scaleReference}` : ''}`],
                            ['Recorded by', <span key="r">{r.recordedBy} · <When at={r.recordedAt} /></span>],
                            ...(r.quality
                              ? ([
                                  ['Accepted', <strong key="a"><Kg kg={r.quality.acceptedKg} /></strong>],
                                  ['Rejected', <Kg key="rj" kg={r.quality.rejectedKg} />],
                                  ['Rejection reasons', r.quality.rejectionReasons.map((x) => REJECTION_REASON_LABELS[x]).join(', ') || '—'],
                                  ['Rejected cassava', DISPOSITION_LABELS[r.quality.rejectedDisposition]],
                                  ['Assessed by', r.quality.assessedBy],
                                  ['Estimated produce value', <Money key="v" kobo={r.estimatedProduceAmountKobo} />],
                                ] as Array<[string, React.ReactNode]>)
                              : []),
                          ]}
                        />
                        {r.materialDiscrepancy ? (
                          <Alert tone="warning" title="Material difference flagged">
                            <ul className="list-disc pl-5">
                              {r.discrepancyReasons.map((x) => (
                                <li key={x}>{x}</li>
                              ))}
                            </ul>
                          </Alert>
                        ) : null}
                        {r.weightEvidence.length ? (
                          <ul className="text-sm">
                            {r.weightEvidence.map((e) => (
                              <li key={e.id}>
                                {e.kind.replace(/_/g, ' ').toLowerCase()} by {e.suppliedBy}
                                {e.reference ? ` (ref ${e.reference})` : ''} · <When at={e.createdAt} />
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {r.farmerDecision ? (
                          <p className="text-sm">
                            Farmer’s answer: <strong>{r.farmerDecision === 'ACCEPTED' ? 'accepted' : 'disputed'}</strong>
                            {r.farmerDecidedAt ? <> · <When at={r.farmerDecidedAt} /></> : null}
                          </p>
                        ) : null}
                      </CardContent>
                    </Card>
                    {r.allowedActions.includes('addEvidence') ? (
                      <Card>
                        <CardHeader>
                          <CardTitle>2. Evidence</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <EvidenceUpload bookingId={id} />
                        </CardContent>
                      </Card>
                    ) : null}
                    {r.allowedActions.includes('reweigh') ? <WeighingForm bookingId={id} existing={r} /> : null}
                    {r.allowedActions.includes('submitDecision') ? <DecisionForm r={r} bookingId={id} /> : null}
                    {r.allowedActions.includes('farmerAccept') ? <FarmerReview r={r} bookingId={id} /> : null}
                    {b.viewerParties.includes('PROCESSOR') && ['FINAL', 'DISPUTED'].includes(r.status) ? <ProcessingPanel booking={b} /> : null}
                  </>
                );
              })()
            )}
          </div>
        );
      }}
    </QueryView>
  );
}
