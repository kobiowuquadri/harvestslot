'use client';

import { useState } from 'react';
import { When } from '@/components/domain/display';
import { PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, CardContent, Dialog, DialogContent } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';

type Policies = { sources: Array<{ key: string; value: unknown; source: string; default: unknown; reason: string | null; updatedAt: string | null }>; note: string };

const LABELS: Record<string, string> = {
  platformFeeBps: 'Service fee (basis points of produce value, paid by processors)',
  platformFeeEnabled: 'Service fee enabled',
  offerHoldHours: 'Offer validity (hours)',
  bookingConfirmationHoldHours: 'Time to complete confirmations (hours)',
  transportBufferMinutes: 'Buffer between vehicle jobs (minutes)',
  receivingReviewHours: 'Farmer review window for receiving decisions (hours)',
  disputeResponseHours: 'Dispute response time (hours)',
  matchingWeights: 'Matching weights',
};
const EDITABLE = Object.keys(LABELS);

function EditPolicy({ k, value }: { k: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(JSON.stringify(value));
  const [reason, setReason] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const save = useAction({
    request: () => ({ path: '/admin/policies', method: 'PUT', idempotent: false, body: { key: k, value: JSON.parse(text) as unknown, reason } }),
    invalidate: [['admin', 'policies']],
    success: 'Policy updated',
    toastErrors: false,
    onSuccess: () => setOpen(false),
  });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Change
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={LABELS[k] ?? k} description="Applies to new offers and bookings only; agreed terms keep their snapshot.">
          <div className="flex flex-col gap-3">
            {save.error ? <Alert tone="danger">{save.error.message}</Alert> : null}
            {parseError ? <Alert tone="danger">{parseError}</Alert> : null}
            <Field label="Value (JSON)">
              <Input value={text} onChange={(e) => setText(e.target.value)} className="font-mono" />
            </Field>
            <Field label="Reason" required>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Button
              onClick={() => {
                try {
                  JSON.parse(text);
                  setParseError(null);
                  save.mutate();
                } catch {
                  setParseError('Enter valid JSON, e.g. 150, true or {"netValue":0.35,…}');
                }
              }}
              loading={save.isPending}
              disabled={reason.trim().length < 5}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AdminPolicies() {
  const q = useApi<Policies>(['admin', 'policies'], '/admin/policies');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Policies" description="Platform rules. Every change is audited with your reason." />
      <QueryView query={q}>
        {(p) => (
          <>
            <Alert tone="info">{p.note}</Alert>
            <div className="flex flex-col gap-2">
              {p.sources.map((s) => (
                <Card key={s.key}>
                  <CardContent className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex-1">
                      <p className="font-medium">{LABELS[s.key] ?? s.key}</p>
                      <p className="font-mono text-xs break-all">{JSON.stringify(s.value)}</p>
                      <p className="text-xs text-muted">
                        <Badge tone={s.source === 'override' ? 'accent' : 'neutral'}>{s.source}</Badge> default {JSON.stringify(s.default)}
                        {s.reason ? ` · “${s.reason}”` : ''} {s.updatedAt ? <>· <When at={s.updatedAt} /></> : null}
                      </p>
                    </div>
                    {EDITABLE.includes(s.key) ? <EditPolicy k={s.key} value={s.value} /> : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </QueryView>
    </div>
  );
}
