'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { InvoiceDto } from '@harvestslot/contracts';
import { LoadingState, PageHeader } from '@/components/domain/states';
import { Alert } from '@/components/ui/primitives';
import { ApiError, post } from '@/lib/api';

/**
 * Paystack redirects here after checkout. The redirect itself proves nothing: the API re-verifies the
 * transaction with Paystack (and the signed webhook does the same) before anything counts as paid.
 */
export default function PaymentReturn() {
  const params = useSearchParams();
  const reference = params.get('reference') ?? params.get('trxref');
  const [result, setResult] = useState<{ outcome: string; invoice: InvoiceDto } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!reference || started.current) return;
    started.current = true;
    post<{ outcome: string; invoice: InvoiceDto }>('/payments/verify', { reference })
      .then(setResult)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not verify the payment'));
  }, [reference]);
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <PageHeader title="Checking your payment" />
      {!reference ? <Alert tone="danger">No payment reference was supplied.</Alert> : null}
      {error ? (
        <Alert tone="warning" title="Not confirmed yet">
          {error} If you were charged, the payment is confirmed automatically when Paystack notifies HarvestSlot.
        </Alert>
      ) : null}
      {!result && !error && reference ? <LoadingState label="Verifying with the payment provider…" rows={1} /> : null}
      {result ? (
        <Alert tone={result.invoice.status === 'PAID' ? 'success' : 'info'} title={`Result: ${result.outcome.replace(/_/g, ' ').toLowerCase()}`}>
          Invoice {result.invoice.number} is now {result.invoice.status.replace(/_/g, ' ').toLowerCase()}.{' '}
          <Link className="underline" href={`/invoices/${result.invoice.id}`}>
            Open the invoice
          </Link>
        </Alert>
      ) : null}
    </div>
  );
}
