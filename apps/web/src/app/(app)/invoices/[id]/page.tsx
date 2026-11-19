'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { CreditCard, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { INVOICE_KIND_LABELS, lagosDateString, type InvoiceDto, type PaymentAttemptDto } from '@harvestslot/contracts';
import { DemoTag, Money, StatusBadge, VerificationTag, When, DateOnly, Kg } from '@/components/domain/display';
import { PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, Table, Td, Th } from '@/components/ui/primitives';
import { ApiError, post, uploadFile } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';
import { koboToNairaInput, nairaToKobo } from '@/lib/utils';

const METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: 'Bank transfer',
  CASH: 'Cash',
  MOBILE_MONEY: 'Mobile money',
  PAYSTACK: 'Paystack (online)',
  PAYSTACK_SIMULATED: 'Payment simulator (no money moves)',
};

function ReportPayment({ inv }: { inv: InvoiceDto }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [amount, setAmount] = useState(koboToNairaInput(inv.outstandingKobo - inv.reportedPendingKobo));
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(lagosDateString(new Date()));
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState<Array<{ id: string; filename: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const report = useAction({
    request: () => ({ path: `/invoices/${inv.id}/payments`, body: { method, amountKobo: nairaToKobo(amount) ?? 0, payerReference: reference, paidOn, note: note || undefined, evidenceAttachmentIds: evidence.map((e) => e.id) } }),
    invalidate: [['invoice', inv.id], ['invoices']],
    success: 'Payment reported. It counts as paid once the recipient confirms it.',
    toastErrors: false,
    onSuccess: () => setOpen(false),
  });
  return (
    <>
      <Button onClick={() => setOpen(true)}>I have paid this</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Report a payment" description={`Record a payment you made outside HarvestSlot to ${inv.payee.name}. It shows as “reported by payer” until they confirm receipt.`}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              report.mutate();
            }}
          >
            {report.error ? <Alert tone="danger">{report.error.message}</Alert> : null}
            <Field label="Method">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CASH">Cash</option>
                <option value="MOBILE_MONEY">Mobile money</option>
              </Select>
            </Field>
            <Field label="Amount (₦)" error={report.error?.fieldErrors.amountKobo} required>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Bank or receipt reference" error={report.error?.fieldErrors.payerReference} required>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <Field label="Date paid" required>
              <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </Field>
            <Field label="Note">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="text-sm">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-3 py-2 font-medium hover:bg-canvas">
                {uploading ? 'Uploading…' : 'Attach a receipt (optional)'}
                <input
                  type="file"
                  className="sr-only"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    setUploading(true);
                    try {
                      const a = await uploadFile<{ id: string; filename: string }>(file, { purpose: 'PAYMENT_EVIDENCE', bookingId: inv.bookingId });
                      setEvidence((p) => [...p, a]);
                    } catch (err) {
                      toast.error(err instanceof ApiError ? err.message : 'Upload failed');
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </label>
              {evidence.length ? <p className="mt-1 text-muted">{evidence.map((e) => e.filename).join(', ')}</p> : null}
            </div>
            <Button type="submit" loading={report.isPending} disabled={!reference || nairaToKobo(amount) === null}>
              Report payment
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PayOnline({ inv }: { inv: InvoiceDto }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await post<{ checkoutUrl: string; provider: 'paystack' | 'simulated' }>(`/invoices/${inv.id}/checkout`, {}, true);
          window.location.assign(r.checkoutUrl);
        } catch (e) {
          toast.error(e instanceof ApiError ? e.message : 'Could not start the payment');
          setBusy(false);
        }
      }}
    >
      <CreditCard className="size-4" aria-hidden /> Pay online
    </Button>
  );
}

function ReceiptDecision({ p, invoiceId }: { p: PaymentAttemptDto; invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<'CONFIRMED' | 'NOT_RECEIVED' | 'AMOUNT_DIFFERS'>('CONFIRMED');
  const [received, setReceived] = useState(koboToNairaInput(p.amountKobo));
  const [note, setNote] = useState('');
  const act = useAction({
    request: () => ({ path: `/payments/${p.id}/receipt`, body: { decision, note: note || undefined, ...(decision === 'AMOUNT_DIFFERS' ? { amountReceivedKobo: nairaToKobo(received) ?? 0 } : {}) } }),
    invalidate: [['invoice', invoiceId], ['invoices']],
    success: decision === 'CONFIRMED' ? 'Thank you — payment confirmed' : 'Recorded. The payer has been told.',
    toastErrors: false,
    onSuccess: () => setOpen(false),
  });
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Did you receive it?
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Payment of ${(p.amountKobo / 100).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}`} description={`Reported ${p.payerReference ? `with reference ${p.payerReference}` : ''}. Check your bank or cash before answering.`}>
          <div className="flex flex-col gap-4">
            {act.error ? <Alert tone="danger">{act.error.message}</Alert> : null}
            <Field label="Your answer">
              <Select value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
                <option value="CONFIRMED">Yes, I received the full amount</option>
                <option value="AMOUNT_DIFFERS">I received a different amount</option>
                <option value="NOT_RECEIVED">No, I have not received it</option>
              </Select>
            </Field>
            {decision === 'AMOUNT_DIFFERS' ? (
              <Field label="Amount actually received (₦)">
                <Input inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value)} />
              </Field>
            ) : null}
            <Field label="Note (optional)">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Button onClick={() => act.mutate()} loading={act.isPending}>
              Save answer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const q = useApi<InvoiceDto>(['invoice', id], `/invoices/${id}`);
  return (
    <QueryView query={q}>
      {(inv) => (
        <div className="flex flex-col gap-6">
          <PageHeader
            eyebrow={
              <Link href="/invoices" className="underline">
                Invoices
              </Link>
            }
            title={
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{inv.number}</span> <StatusBadge kind="invoice" status={inv.status} /> {inv.overdue ? <Badge tone="danger">Overdue</Badge> : null} {inv.disputed ? <Badge tone="warning">Disputed</Badge> : null} {inv.isDemo ? <DemoTag /> : null}
              </span>
            }
            description={
              <>
                {INVOICE_KIND_LABELS[inv.kind]} · {inv.payer.name} pays {inv.payee.name} · booking{' '}
                <Link className="underline" href={`/bookings/${inv.bookingId}`}>
                  {inv.bookingReference}
                </Link>
              </>
            }
            actions={
              <>
                {inv.allowedActions.includes('payOnline') ? <PayOnline inv={inv} /> : null}
                {inv.allowedActions.includes('reportPayment') ? <ReportPayment inv={inv} /> : null}
                <Button asChild variant="outline">
                  <a href={`/api/v1/invoices/${inv.id}/document`} target="_blank" rel="noopener">
                    <FileText className="size-4" aria-hidden /> Printable invoice
                  </a>
                </Button>
              </>
            }
          />
          {inv.kind === 'PRODUCE' && inv.viewerRole === 'PAYEE' ? <Alert tone="info">The processor pays you directly. Confirm each payment when it reaches you — only then does it count as paid.</Alert> : null}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Card>
              <CardHeader>
                <CardTitle>Lines</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Table caption="Invoice lines" className="min-w-0">
                  <thead>
                    <tr>
                      <Th>Description</Th>
                      <Th>Quantity</Th>
                      <Th>Unit price</Th>
                      <Th className="text-right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.lines.map((l, i) => (
                      <tr key={i}>
                        <Td>{l.description}</Td>
                        <Td>{l.quantityKg ? <Kg kg={l.quantityKg} /> : '—'}</Td>
                        <Td>{l.unitPriceKobo !== null ? <Money kobo={l.unitPriceKobo} /> : '—'}</Td>
                        <Td className="text-right">
                          <Money kobo={l.amountKobo} />
                        </Td>
                      </tr>
                    ))}
                    {inv.adjustments.map((a) => (
                      <tr key={a.id}>
                        <Td>
                          Adjustment: {a.reason}
                          {a.disputeId ? (
                            <Link className="ml-1 text-leaf underline" href={`/disputes/${a.disputeId}`}>
                              (dispute)
                            </Link>
                          ) : null}
                        </Td>
                        <Td>—</Td>
                        <Td>—</Td>
                        <Td className="text-right">
                          <Money kobo={a.amountKobo} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p className="flex justify-between">
                  <span>Subtotal</span> <Money kobo={inv.subtotalKobo} />
                </p>
                <p className="flex justify-between">
                  <span>Adjustments</span> <Money kobo={inv.adjustmentsKobo} />
                </p>
                <p className="flex justify-between border-t border-line pt-2 text-base font-semibold">
                  <span>Total</span> <Money kobo={inv.totalKobo} />
                </p>
                <p className="flex justify-between text-forest">
                  <span>Confirmed paid</span> <Money kobo={inv.confirmedPaidKobo} />
                </p>
                <p className="flex justify-between text-amber-ink">
                  <span>Reported, not yet confirmed</span> <Money kobo={inv.reportedPendingKobo} />
                </p>
                <p className="flex justify-between font-semibold">
                  <span>Outstanding</span> <Money kobo={inv.outstandingKobo} />
                </p>
                <p className="mt-2 text-muted">
                  Issued <When at={inv.issuedAt} /> · due <DateOnly date={inv.dueAt} />
                </p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {inv.payments.length === 0 ? <p className="text-sm text-muted">No payments recorded yet.</p> : null}
              {inv.payments.map((p) => (
                <div key={p.id} className="flex flex-col gap-2 rounded-lg border border-line p-3 text-sm sm:flex-row sm:items-start">
                  <div className="flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <Money kobo={p.amountKobo} /> · {METHOD_LABEL[p.method] ?? p.method} <VerificationTag level={p.verificationLevel} /> <StatusBadge kind="generic" status={p.status} />
                    </p>
                    <p className="text-muted">
                      {p.payerReference ? `Ref ${p.payerReference} · ` : ''}
                      {p.paidOn ? <>paid <DateOnly date={p.paidOn} /> · </> : null}
                      {p.reportedBy ? `reported by ${p.reportedBy}` : ''} {p.providerEnvironment ? `· provider: ${p.providerEnvironment}` : ''}
                    </p>
                    {p.receipt ? (
                      <p>
                        Recipient answered: <strong>{p.receipt.decision === 'CONFIRMED' ? 'received' : p.receipt.decision === 'NOT_RECEIVED' ? 'not received' : 'different amount'}</strong>
                        {p.receipt.amountReceivedKobo !== null ? <> (<Money kobo={p.receipt.amountReceivedKobo} />)</> : null} — {p.receipt.decidedBy}, <When at={p.receipt.createdAt} />
                      </p>
                    ) : null}
                    {p.note ? <p className="text-muted">“{p.note}”</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {inv.allowedActions.includes('confirmReceipt') && p.status === 'REPORTED' ? <ReceiptDecision p={p} invoiceId={inv.id} /> : null}
                    {p.receipt?.decision === 'CONFIRMED' || p.status === 'PROVIDER_SUCCESS' ? (
                      <Button asChild size="sm" variant="ghost">
                        <a href={`/api/v1/payments/${p.id}/acknowledgement`} target="_blank" rel="noopener">
                          Acknowledgement
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          {inv.refunds.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Refunds</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {inv.refunds.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-2">
                    <Money kobo={r.amountKobo} /> · {r.reason} <StatusBadge kind="generic" status={r.status} />
                    {inv.allowedActions.includes('confirmRefund') && r.status === 'REPORTED' ? (
                      <ConfirmRefund refundId={r.id} invoiceId={inv.id} />
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
          <p className="text-sm text-muted">
            Disagree with this invoice? <Link className="underline" href={`/disputes?new=${inv.bookingId}&invoice=${inv.id}`}>Open a dispute</Link>. Undisputed amounts stay payable.
          </p>
        </div>
      )}
    </QueryView>
  );
}

function ConfirmRefund({ refundId, invoiceId }: { refundId: string; invoiceId: string }) {
  const act = useAction({ request: () => ({ path: `/refunds/${refundId}/confirm` }), invalidate: [['invoice', invoiceId]], success: 'Refund confirmed' });
  return (
    <Button size="sm" onClick={() => act.mutate()} loading={act.isPending}>
      Confirm refund received
    </Button>
  );
}
