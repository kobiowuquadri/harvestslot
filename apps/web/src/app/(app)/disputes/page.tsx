'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { DISPUTE_CATEGORY_LABELS, DisputeCategoryE, type DisputeCategory, type DisputeDto } from '@harvestslot/contracts';
import { Kg, Money, StatusBadge, When } from '@/components/domain/display';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';
import { nairaToKobo } from '@/lib/utils';

function NewDispute({ bookingId, invoiceId }: { bookingId: string; invoiceId?: string }) {
  const router = useRouter();
  const [category, setCategory] = useState<DisputeCategory>(invoiceId ? 'PAYMENT_AMOUNT' : 'WEIGHT');
  const [amount, setAmount] = useState('');
  const [qty, setQty] = useState('');
  const [description, setDescription] = useState('');
  const open = useAction<void, DisputeDto>({
    request: () => ({
      path: '/disputes',
      body: {
        bookingId,
        invoiceId,
        category,
        description,
        ...(amount ? { amountInQuestionKobo: nairaToKobo(amount) ?? 0 } : {}),
        ...(qty ? { quantityInQuestionKg: qty } : {}),
      },
    }),
    invalidate: [['disputes'], ['booking', bookingId]],
    success: 'Dispute opened. The other party has been asked to respond.',
    toastErrors: false,
    onSuccess: (d) => router.push(`/disputes/${d.id}`),
  });
  return (
    <Card className="border-forest">
      <CardHeader>
        <CardTitle>Open a dispute</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            open.mutate();
          }}
        >
          <p className="text-sm text-muted">Describe what you disagree with. The other party responds, and if you cannot settle it, a HarvestSlot administrator decides. Amounts that are not disputed stay payable.</p>
          {open.error ? <Alert tone="danger">{open.error.message}</Alert> : null}
          <Field label="What is it about?">
            <Select value={category} onChange={(e) => setCategory(e.target.value as DisputeCategory)}>
              {DisputeCategoryE.values.map((c) => (
                <option key={c} value={c}>
                  {DISPUTE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Amount in question (₦, optional)">
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Quantity in question (kg, optional)">
              <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
          </div>
          <Field label="What happened?" hint="At least 10 characters. You can add evidence after opening." required>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" loading={open.isPending} disabled={description.trim().length < 10}>
              Open dispute
            </Button>
            <Button asChild variant="ghost">
              <Link href={`/bookings/${bookingId}`}>Cancel</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function DisputesPage() {
  const params = useSearchParams();
  const newFor = params.get('new');
  const q = useApi<DisputeDto[]>(['disputes'], '/disputes');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Disputes" description="Disagreements about weight, quality, pickup, delivery or payment, with evidence and a recorded outcome." />
      {newFor ? <NewDispute bookingId={newFor} invoiceId={params.get('invoice') ?? undefined} /> : null}
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No disputes" />}>
        {(items) => (
          <ul className="flex flex-col gap-2">
            {items.map((d) => (
              <li key={d.id}>
                <Link href={`/disputes/${d.id}`} className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4 transition-[border-color,box-shadow] hover:border-line-strong/40 hover:shadow-[var(--shadow-raised)]">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-ink">{d.reference}</span>
                    <StatusBadge kind="dispute" status={d.status} />
                    <Badge tone="neutral">{DISPUTE_CATEGORY_LABELS[d.category]}</Badge>
                    {d.overdue ? <Badge tone="danger">Response overdue</Badge> : null}
                  </span>
                  <span className="text-sm">
                    Booking {d.bookingReference} · opened by {d.openedBy} · <When at={d.createdAt} />
                  </span>
                  <span className="text-sm text-muted">
                    {d.amountInQuestionKobo !== null ? <>Amount <Money kobo={d.amountInQuestionKobo} /> · </> : null}
                    {d.quantityInQuestionKg ? <>Quantity <Kg kg={d.quantityInQuestionKg} /></> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}
