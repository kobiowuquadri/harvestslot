'use client';

import { useState } from 'react';
import type { InvoiceDto } from '@harvestslot/contracts';
import { InvoiceRows } from '@/components/domain/lists';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Select } from '@/components/ui/form';
import { Alert, Tabs, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { useApi, useFarmerContext } from '@/lib/hooks';
import { useSession } from '@/lib/session';

export default function InvoicesPage() {
  const { workspace } = useSession();
  const farmer = useFarmerContext();
  const [role, setRole] = useState<'any' | 'payer' | 'payee'>('any');
  const [status, setStatus] = useState<'ALL' | 'OPEN' | 'OVERDUE' | 'PAID'>('ALL');
  const params = new URLSearchParams({ role, status });
  if (farmer?.acting || (workspace?.kind === 'farmer' && farmer)) params.set('farmerProfileId', farmer!.farmerProfileId);
  else if (workspace && 'orgId' in workspace) params.set('organisationId', workspace.orgId);
  const q = useApi<InvoiceDto[]>(['invoices', params.toString()], workspace ? `/invoices?${params.toString()}` : null);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={workspace?.kind === 'farmer' ? 'Payments' : 'Invoices'} description="Invoices are issued from the quantity accepted at receiving. A payment counts once the recipient confirms it — or, for online fee payments, once Paystack verifies it." />
      {workspace?.kind === 'farmer' ? (
        <Alert tone="info">Processors pay you directly (bank transfer or cash). When money arrives, confirm it here so the processor’s record is complete. HarvestSlot never holds your money.</Alert>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <TabsList>
            <TabsTrigger value="ALL">All</TabsTrigger>
            <TabsTrigger value="OPEN">Unpaid</TabsTrigger>
            <TabsTrigger value="OVERDUE">Overdue</TabsTrigger>
            <TabsTrigger value="PAID">Paid</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select aria-label="Direction" value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="sm:w-56">
          <option value="any">Paying and receiving</option>
          <option value="payer">We pay</option>
          <option value="payee">We are paid</option>
        </Select>
      </div>
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No invoices" />}>
        {(items) => <InvoiceRows items={items} />}
      </QueryView>
    </div>
  );
}
