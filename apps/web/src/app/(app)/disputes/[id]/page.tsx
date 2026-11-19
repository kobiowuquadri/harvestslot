'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DISPUTE_CATEGORY_LABELS, DISPUTE_STATUS_LABELS, PARTY_LABELS, type DisputeDto } from '@harvestslot/contracts';
import { ReasonActionDialog } from '@/components/domain/dialogs';
import { Kg, Money, StatusBadge, When } from '@/components/domain/display';
import { PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, DescriptionList } from '@/components/ui/primitives';
import { ApiError, get, uploadFile } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';
import { nairaToKobo } from '@/lib/utils';

/** "-5000" → -500000 kobo; null when not a valid amount. */
function signedKobo(value: string): number | null {
  const v = value.trim();
  const abs = nairaToKobo(v.replace(/^-/, ''));
  return abs === null ? null : v.startsWith('-') ? -abs : abs;
}

function Reply({ d }: { d: DisputeDto }) {
  const [body, setBody] = useState('');
  const [proposal, setProposal] = useState('');
  const [evidence, setEvidence] = useState<Array<{ id: string; filename: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const send = useAction({
    request: () => ({ path: `/disputes/${d.id}/messages`, body: { body, evidenceAttachmentIds: evidence.map((e) => e.id), ...(proposal.trim() ? { proposedAdjustmentKobo: signedKobo(proposal) ?? 0 } : {}) } }),
    invalidate: [['dispute', d.id]],
    success: 'Sent',
    toastErrors: false,
    onSuccess: () => {
      setBody('');
      setProposal('');
      setEvidence([]);
    },
  });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate();
      }}
    >
      {send.error ? <Alert tone="danger">{send.error.message}</Alert> : null}
      <Field label="Your message">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
      </Field>
      <Field label="Propose a settlement adjustment (₦, optional)" hint="Negative reduces the invoice (e.g. -5000). The other party can accept it; nothing changes until they do.">
        <Input value={proposal} onChange={(e) => setProposal(e.target.value)} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center rounded-lg border border-line-strong px-3 py-2 text-sm font-medium hover:bg-canvas">
          {uploading ? 'Uploading…' : 'Attach evidence'}
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
                const a = await uploadFile<{ id: string; filename: string }>(file, { purpose: 'DISPUTE_EVIDENCE', disputeId: d.id, bookingId: d.bookingId });
                setEvidence((p) => [...p, a]);
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : 'Upload failed');
              } finally {
                setUploading(false);
              }
            }}
          />
        </label>
        {evidence.map((e) => (
          <Badge key={e.id} tone="neutral">
            {e.filename}
          </Badge>
        ))}
        <Button type="submit" loading={send.isPending} disabled={!body.trim()} className="ml-auto">
          Send
        </Button>
      </div>
    </form>
  );
}

function Resolve({ d }: { d: DisputeDto }) {
  const [outcome, setOutcome] = useState('');
  const [rationale, setRationale] = useState('');
  const [adjustment, setAdjustment] = useState('');
  const [revisedKg, setRevisedKg] = useState('');
  const resolve = useAction({
    request: () => {
      const adj = adjustment.trim() ? signedKobo(adjustment) : null;
      return { path: `/disputes/${d.id}/resolve`, body: { outcome, rationale, ...(adj !== null ? { adjustmentKobo: adj } : {}), ...(revisedKg ? { revisedAcceptedKg: revisedKg } : {}) } };
    },
    invalidate: [['dispute', d.id], ['disputes']],
    success: 'Dispute resolved. Any adjustment is recorded on the invoice; no money moves automatically.',
    toastErrors: false,
  });
  return (
    <Card className="border-forest">
      <CardHeader>
        <CardTitle>Administrator decision</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {resolve.error ? <Alert tone="danger">{resolve.error.message}</Alert> : null}
        <Field label="Outcome (short)" required>
          <Input value={outcome} onChange={(e) => setOutcome(e.target.value)} />
        </Field>
        <Field label="Rationale" hint="At least 20 characters. Shared with both parties." required>
          <Textarea value={rationale} onChange={(e) => setRationale(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Invoice adjustment (₦, optional)" hint="Negative reduces what is owed.">
            <Input value={adjustment} onChange={(e) => setAdjustment(e.target.value)} />
          </Field>
          <Field label="Revised accepted quantity (kg, optional)">
            <Input inputMode="decimal" value={revisedKg} onChange={(e) => setRevisedKg(e.target.value)} />
          </Field>
        </div>
        <Button onClick={() => resolve.mutate()} loading={resolve.isPending} disabled={outcome.trim().length < 5 || rationale.trim().length < 20}>
          Record decision
        </Button>
      </CardContent>
    </Card>
  );
}

export default function DisputePage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  const q = useApi<DisputeDto>(['dispute', id], `/disputes/${id}`);
  const accept = useAction<string>({ request: (messageId) => ({ path: `/disputes/${id}/messages/${messageId}/accept-settlement` }), invalidate: [['dispute', id]], success: 'Settlement accepted — recorded as a mutual settlement' });
  const openFile = async (fileId: string) => {
    try {
      const link = await get<{ url: string }>(`/attachments/${fileId}/link`);
      window.open(link.url, '_blank', 'noopener');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not open the file');
    }
  };
  return (
    <QueryView query={q}>
      {(d) => (
        <div className="flex flex-col gap-6">
          <PageHeader
            eyebrow={
              <Link className="underline" href="/disputes">
                Disputes
              </Link>
            }
            title={
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{d.reference}</span> <StatusBadge kind="dispute" status={d.status} />
              </span>
            }
            description={
              <>
                {DISPUTE_CATEGORY_LABELS[d.category]} · booking{' '}
                <Link className="underline" href={`/bookings/${d.bookingId}`}>
                  {d.bookingReference}
                </Link>
                {d.invoiceNumber ? (
                  <>
                    {' '}
                    · invoice{' '}
                    <Link className="underline" href={`/invoices/${d.invoiceId}`}>
                      {d.invoiceNumber}
                    </Link>
                  </>
                ) : null}
              </>
            }
            actions={
              d.allowedActions.includes('withdraw') ? <ReasonActionDialog trigger="Withdraw dispute" title="Withdraw this dispute?" confirmLabel="Withdraw" path={`/disputes/${d.id}/withdraw`} invalidate={[['dispute', d.id], ['disputes']]} success="Dispute withdrawn" /> : null
            }
          />
          <Card>
            <CardContent className="flex flex-col gap-3">
              <DescriptionList
                items={[
                  ['Opened by', `${d.openedBy} (${PARTY_LABELS[d.openedByParty]})${d.actingForFarmer ? ' via cooperative' : ''}`],
                  ['Respondent', PARTY_LABELS[d.respondentParty]],
                  ['Amount in question', <Money key="a" kobo={d.amountInQuestionKobo} />],
                  ['Quantity in question', <Kg key="q" kg={d.quantityInQuestionKg} />],
                  ['Response due', <span key="r">{<When at={d.responseDeadline} relative />}{d.overdue ? ' — overdue' : ''}</span>],
                  ['Opened', <When key="o" at={d.createdAt} />],
                ]}
              />
              <p className="rounded-lg bg-canvas p-3 text-sm">{d.description}</p>
              {d.evidence.length ? (
                <p className="flex flex-wrap gap-2 text-sm">
                  Evidence:
                  {d.evidence.map((e) => (
                    <button key={e.id} type="button" className="text-leaf underline" onClick={() => void openFile(e.id)}>
                      {e.filename}
                    </button>
                  ))}
                </p>
              ) : null}
            </CardContent>
          </Card>
          {d.resolution ? (
            <Alert tone="success" title={`Resolved: ${d.resolution.outcome}`}>
              <p>{d.resolution.rationale}</p>
              <p className="mt-1 text-xs">
                {d.resolution.kind === 'MUTUAL_SETTLEMENT' ? 'Mutual settlement' : `Decided by ${d.resolution.decidedBy}`} · <When at={d.resolution.createdAt} />
                {d.resolution.adjustmentKobo !== null ? <> · invoice adjustment <Money kobo={d.resolution.adjustmentKobo} /></> : null}
              </p>
              <p className="mt-1 text-xs">{d.resolution.note}</p>
            </Alert>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Conversation</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {d.messages.map((m) => (
                <div key={m.id} className={`rounded-lg p-3 text-sm ${m.mine ? 'bg-leaf-50' : 'bg-canvas'}`}>
                  <p className="text-xs font-medium text-muted">
                    {m.author} · {PARTY_LABELS[m.authorParty]} · <When at={m.createdAt} />
                  </p>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                  {m.proposedAdjustmentKobo !== null ? (
                    <p className="mt-2 flex flex-wrap items-center gap-2">
                      Proposed settlement: <strong><Money kobo={m.proposedAdjustmentKobo} /></strong>
                      {m.settlementAcceptedAt ? (
                        <Badge tone="success">Accepted</Badge>
                      ) : !m.mine && d.allowedActions.includes('acceptSettlement') ? (
                        <Button size="sm" onClick={() => accept.mutate(m.id)} loading={accept.isPending}>
                          Accept this settlement
                        </Button>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              ))}
              {d.allowedActions.includes('message') ? <Reply d={d} /> : null}
            </CardContent>
          </Card>
          {me?.user.platformRole === 'ADMIN' && d.allowedActions.includes('resolve') ? <Resolve d={d} /> : null}
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Status history</summary>
            <ul className="mt-2 flex flex-col gap-1 text-muted">
              {d.events.map((e, i) => (
                <li key={i}>
                  {e.fromStatus ? `${DISPUTE_STATUS_LABELS[e.fromStatus]} → ` : ''}
                  {DISPUTE_STATUS_LABELS[e.toStatus]} · {e.actor ?? 'System'} · <When at={e.createdAt} />
                  {e.note ? ` — ${e.note}` : ''}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </QueryView>
  );
}
