'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { addDays, lagosDateString } from '@harvestslot/contracts';
import { PageHeader } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Card, CardContent } from '@/components/ui/primitives';

const DATASETS = [
  ['bookings', 'Bookings'],
  ['invoices', 'Invoices'],
  ['payments', 'Payments'],
  ['slots', 'Capacity slots'],
  ['disputes', 'Disputes'],
  ['audit', 'Audit log'],
] as const;

export default function AdminExports() {
  const today = lagosDateString(new Date());
  const [dataset, setDataset] = useState('bookings');
  const [scope, setScope] = useState('live');
  const [from, setFrom] = useState(addDays(today, -30));
  const [to, setTo] = useState(today);
  const href = `/api/v1/admin/exports?${new URLSearchParams({ dataset, dataScope: scope, from, to }).toString()}`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Exports" description="CSV downloads for accounting and reporting. Each export is audited. Cells that could be read as spreadsheet formulas are escaped." />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Dataset">
              <Select value={dataset} onChange={(e) => setDataset(e.target.value)}>
                {DATASETS.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Records">
              <Select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="live">Live only</option>
                <option value="demo">Demo only</option>
              </Select>
            </Field>
            <Field label="From">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          {scope === 'demo' ? <Alert tone="warning">Demo exports contain fictional data and are marked as such.</Alert> : null}
          <Button asChild className="self-start">
            <a href={href} download>
              <Download className="size-4" aria-hidden /> Download CSV
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
