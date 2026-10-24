'use client';

import Link from 'next/link';
import { DISPUTE_CATEGORY_LABELS, type DisputeDto } from '@harvestslot/contracts';
import { Money, StatusBadge, When } from '@/components/domain/display';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Badge, Table, Td, Th } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';

export default function AdminDisputes() {
  const q = useApi<DisputeDto[]>(['disputes', 'admin'], '/disputes');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Disputes" description="Open one to read both sides, review evidence and record a decision with rationale. A decision records any invoice adjustment; it never moves money." />
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No disputes" />}>
        {(rows) => (
          <Table caption="Disputes">
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Category</Th>
                <Th>Status</Th>
                <Th>Booking</Th>
                <Th>Amount</Th>
                <Th>Response due</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <Td>
                    <Link className="font-mono font-semibold text-leaf underline" href={`/disputes/${d.id}`}>
                      {d.reference}
                    </Link>
                  </Td>
                  <Td>{DISPUTE_CATEGORY_LABELS[d.category]}</Td>
                  <Td>
                    <StatusBadge kind="dispute" status={d.status} /> {d.overdue ? <Badge tone="danger">Overdue</Badge> : null}
                  </Td>
                  <Td>{d.bookingReference}</Td>
                  <Td>
                    <Money kobo={d.amountInQuestionKobo} />
                  </Td>
                  <Td>
                    <When at={d.responseDeadline} relative />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </QueryView>
    </div>
  );
}
