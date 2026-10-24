'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { When } from '@/components/domain/display';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { Table, Td, Th } from '@/components/ui/primitives';
import { get } from '@/lib/api';

type AuditRow = { id: string; actor: string | null; actorParty: string | null; actingForFarmer: string | null; action: string; entityType: string; entityId: string; reason: string | null; data: unknown; requestId: string | null; createdAt: string };

export default function AdminAudit() {
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [action, setAction] = useState('');
  const [applied, setApplied] = useState({ entityType: '', entityId: '', action: '' });
  const params = new URLSearchParams({ limit: '50' });
  for (const [k, v] of Object.entries(applied)) if (v) params.set(k, v);
  const q = useInfiniteQuery({
    queryKey: ['admin', 'audit', params.toString()],
    queryFn: ({ pageParam, signal }) => get<{ items: AuditRow[]; nextCursor: string | null }>(`/admin/audit?${params.toString()}${pageParam ? `&cursor=${pageParam}` : ''}`, signal),
    initialPageParam: '' as string,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit log" description="Append-only record of consequential actions, including who acted for whom. Personal data in the details is redacted." />
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ entityType, entityId, action });
        }}
      >
        <Field label="Entity type">
          <Input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="booking" />
        </Field>
        <Field label="Entity id">
          <Input value={entityId} onChange={(e) => setEntityId(e.target.value)} />
        </Field>
        <Field label="Action">
          <Input value={action} onChange={(e) => setAction(e.target.value)} placeholder="booking.confirmed" />
        </Field>
        <Button type="submit">Filter</Button>
      </form>
      {q.isLoading ? <LoadingState /> : q.isError ? <ErrorState error={q.error} /> : rows.length === 0 ? <EmptyState title="No matching events" /> : null}
      {rows.length ? (
        <Table caption="Audit events">
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Entity</Th>
              <Th>Reason / details</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap">
                  <When at={r.createdAt} />
                </Td>
                <Td>
                  {r.actor ?? 'System'} {r.actorParty ? <span className="text-xs text-muted">({r.actorParty.toLowerCase()})</span> : null}
                  {r.actingForFarmer ? <span className="block text-xs text-info">for {r.actingForFarmer}</span> : null}
                </Td>
                <Td className="font-mono text-xs">{r.action}</Td>
                <Td className="text-xs">
                  {r.entityType}
                  <span className="block font-mono text-muted">{r.entityId}</span>
                </Td>
                <Td className="max-w-sm text-xs">
                  {r.reason ? <p>{r.reason}</p> : null}
                  {r.data ? <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all text-muted">{JSON.stringify(r.data)}</pre> : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
      {q.hasNextPage ? (
        <Button variant="outline" className="self-center" onClick={() => void q.fetchNextPage()} loading={q.isFetchingNextPage}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}
