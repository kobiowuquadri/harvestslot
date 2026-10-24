'use client';

import Link from 'next/link';
import { HARVEST_STATUS_LABELS, LOT_STATUS_LABELS, SHIPMENT_STATUS_LABELS } from '@harvestslot/contracts';
import { Badge, Table, Td, Th } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { Kg, StatusBadge, Window } from './display';
import { EmptyState, QueryView } from './states';

export type IntakeRow = {
  bookingId: string;
  reference: string;
  status: string;
  farmerName: string;
  quantityKg: string;
  lineName: string;
  deliveryWindow: { start: string; end: string };
  ready: boolean;
  transportStatus: string;
  harvestStatus: string | null;
  receivingStatus: string | null;
  delayed: boolean;
};

export function transportLabel(s: string) {
  return (SHIPMENT_STATUS_LABELS as Record<string, string>)[s] ?? (s === 'AGREED' ? 'Transport agreed' : s === 'NOT_ARRANGED' ? 'Not arranged' : s);
}

export function IntakeTable({ orgId, receivingOnly }: { orgId: string; receivingOnly?: boolean }) {
  const q = useApi<IntakeRow[]>(['intake', orgId], `/organisations/${orgId}/intake`, { refetchInterval: 30_000 });
  return (
    <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="Nothing scheduled" />}>
      {(rows) => {
        const list = receivingOnly ? rows.filter((r) => ['IN_TRANSIT', 'ARRIVED_AT_FACILITY', 'DELIVERED'].includes(r.transportStatus) || r.receivingStatus) : rows;
        if (!list.length) return <EmptyState title="No deliveries to receive right now" />;
        return (
          <Table caption={receivingOnly ? 'Deliveries to receive' : 'Intake schedule'}>
            <thead>
              <tr>
                <Th>Booking</Th>
                <Th>Farmer</Th>
                <Th>Quantity</Th>
                <Th>Line</Th>
                <Th>Delivery window</Th>
                <Th>Transport</Th>
                <Th>Harvest</Th>
                <Th>Receiving</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.bookingId}>
                  <Td>
                    <Link className="font-mono font-semibold text-leaf underline" href={receivingOnly ? `/bookings/${r.bookingId}/receiving` : `/bookings/${r.bookingId}`}>
                      {r.reference}
                    </Link>
                    <span className="mt-1 block">
                      <StatusBadge kind="booking" status={r.status} />
                    </span>
                  </Td>
                  <Td>{r.farmerName}</Td>
                  <Td>
                    <Kg kg={r.quantityKg} />
                  </Td>
                  <Td>{r.lineName}</Td>
                  <Td>
                    <Window start={r.deliveryWindow.start} end={r.deliveryWindow.end} />
                    {r.delayed ? <Badge tone="danger" className="ml-1">Late</Badge> : null}
                  </Td>
                  <Td>{transportLabel(r.transportStatus)}</Td>
                  <Td>{r.harvestStatus ? ((LOT_STATUS_LABELS as Record<string, string>)[r.harvestStatus] ?? (HARVEST_STATUS_LABELS as Record<string, string>)[r.harvestStatus] ?? r.harvestStatus) : '—'}</Td>
                  <Td>{r.receivingStatus ? <StatusBadge kind="receiving" status={r.receivingStatus} /> : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        );
      }}
    </QueryView>
  );
}
