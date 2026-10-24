'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import type { InvoiceDto } from '@harvestslot/contracts';
import { Money } from '@/components/domain/display';
import { PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardContent } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';

type Info = { simulation: true; label: string; reference: string; amountKobo: number; invoiceNumber: string; status: string };

/**
 * Development payment simulator. It signs a fake provider event and sends it through the same
 * webhook verification and reconciliation code as Paystack. No money moves and nothing leaves this machine.
 */
export default function PaymentSimulator() {
  const { reference } = useParams<{ reference: string }>();
  const q = useApi<Info>(['simulator', reference], `/dev/payment-simulator/${encodeURIComponent(reference)}`);
  const [done, setDone] = useState<{ outcome: string; invoice: InvoiceDto } | null>(null);
  const simulate = useAction<'success' | 'failed' | 'abandoned', { outcome: string; invoice: InvoiceDto }>({
    request: (outcome) => ({ path: `/dev/payment-simulator/${encodeURIComponent(reference)}`, body: { outcome } }),
    onSuccess: (r) => setDone(r),
  });
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="flex items-center gap-2 rounded-lg bg-amber px-4 py-3 font-semibold text-amber-ink">
        <FlaskConical className="size-5" aria-hidden /> SIMULATED PAYMENT — no money moves. Development only.
      </div>
      <PageHeader title="Payment simulator" description="Stands in for the Paystack checkout page in development." />
      <QueryView query={q}>
        {(i) => (
          <Card>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm">
                Invoice <strong>{i.invoiceNumber}</strong> · <Money kobo={i.amountKobo} /> · reference <span className="font-mono">{i.reference}</span>
              </p>
              <p className="text-sm text-muted">Current status: {i.status.replace(/_/g, ' ').toLowerCase()}</p>
              {done ? (
                <Alert tone={done.outcome === 'success' ? 'success' : 'warning'} title={`Simulated outcome: ${done.outcome}`}>
                  The invoice now shows {done.invoice.status.replace(/_/g, ' ').toLowerCase()}, and the payment is labelled “simulated”, never “verified”.{' '}
                  <Link className="underline" href={`/invoices/${done.invoice.id}`}>
                    Back to the invoice
                  </Link>
                </Alert>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => simulate.mutate('success')} loading={simulate.isPending}>
                    Simulate successful payment
                  </Button>
                  <Button variant="outline" onClick={() => simulate.mutate('failed')} disabled={simulate.isPending}>
                    Simulate failure
                  </Button>
                  <Button variant="ghost" onClick={() => simulate.mutate('abandoned')} disabled={simulate.isPending}>
                    Simulate abandoned checkout
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </QueryView>
    </div>
  );
}
