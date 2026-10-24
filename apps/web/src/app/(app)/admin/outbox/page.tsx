'use client';

import { ReasonActionDialog } from '@/components/domain/dialogs';
import { StatusBadge, When } from '@/components/domain/display';
import { PageHeader, QueryView } from '@/components/domain/states';
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, Td, Th } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';

type Outbox = {
  events: Array<{ id: string; type: string; aggregateType: string; aggregateId: string; status: string; attempts: number; maxAttempts: number; nextAttemptAt: string; lastError: string | null; createdAt: string }>;
  deliveries: Array<{ id: string; channel: string; status: string; destination: string | null; error: string | null; attemptNo: number; updatedAt: string }>;
  counts: Record<string, number>;
};
type Webhook = { id: string; provider: string; eventType: string | null; environment: string | null; status: string; attempts: number; processingError: string | null; receivedAt: string; processedAt: string | null };

export default function AdminOutbox() {
  const outbox = useApi<Outbox>(['admin', 'outbox'], '/admin/outbox', { refetchInterval: 30_000 });
  const webhooks = useApi<Webhook[]>(['admin', 'webhooks'], '/admin/webhooks');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Messages and webhooks" description="Background events (notifications, payment webhooks, exports) are retried with backoff. Dead events can be re-queued after the cause is fixed." />
      <QueryView query={outbox}>
        {(o) => (
          <>
            <div className="flex flex-wrap gap-2">
              {Object.entries(o.counts).map(([k, v]) => (
                <Badge key={k} tone={k === 'DEAD' || k === 'FAILED' ? 'danger' : 'neutral'}>
                  {k.toLowerCase()}: {v}
                </Badge>
              ))}
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Events needing attention</CardTitle>
              </CardHeader>
              <CardContent>
                {o.events.length === 0 ? (
                  <p className="text-sm text-muted">None.</p>
                ) : (
                  <Table caption="Outbox events">
                    <thead>
                      <tr>
                        <Th>Type</Th>
                        <Th>Status</Th>
                        <Th>Attempts</Th>
                        <Th>Next attempt</Th>
                        <Th>Last error</Th>
                        <Th>
                          <span className="sr-only">Actions</span>
                        </Th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.events.map((e) => (
                        <tr key={e.id}>
                          <Td>
                            <span className="font-mono text-xs">{e.type}</span>
                            <span className="block text-xs text-muted">
                              {e.aggregateType} · <When at={e.createdAt} />
                            </span>
                          </Td>
                          <Td>
                            <StatusBadge kind="generic" status={e.status} />
                          </Td>
                          <Td>
                            {e.attempts}/{e.maxAttempts}
                          </Td>
                          <Td>
                            <When at={e.nextAttemptAt} relative />
                          </Td>
                          <Td className="max-w-xs break-words text-xs text-danger">{e.lastError ?? '—'}</Td>
                          <Td>{['DEAD', 'FAILED'].includes(e.status) ? <ReasonActionDialog trigger="Re-queue" triggerSize="sm" tone="primary" title="Re-queue this event?" confirmLabel="Re-queue" path={`/admin/outbox/${e.id}/requeue`} invalidate={[['admin', 'outbox']]} success="Re-queued" /> : null}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Email/SMS deliveries that did not go out</CardTitle>
              </CardHeader>
              <CardContent>
                {o.deliveries.length === 0 ? (
                  <p className="text-sm text-muted">None.</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {o.deliveries.map((d) => (
                      <li key={d.id}>
                        {d.channel} to {d.destination ?? '—'} · <StatusBadge kind="generic" status={d.status} /> · attempt {d.attemptNo} · {d.error ?? ''} · <When at={d.updatedAt} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </QueryView>
      <Card>
        <CardHeader>
          <CardTitle>Payment webhooks</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryView query={webhooks} isEmpty={(d) => d.length === 0} empty={<p className="text-sm text-muted">No webhooks received.</p>}>
            {(rows) => (
              <Table caption="Webhooks">
                <thead>
                  <tr>
                    <Th>Provider</Th>
                    <Th>Event</Th>
                    <Th>Status</Th>
                    <Th>Received</Th>
                    <Th>Error</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((w) => (
                    <tr key={w.id}>
                      <Td>
                        {w.provider} {w.provider === 'simulated' || w.environment === 'simulated' ? <Badge tone="accent">Simulated</Badge> : w.environment ? <Badge tone="neutral">{w.environment}</Badge> : null}
                      </Td>
                      <Td className="font-mono text-xs">{w.eventType ?? '—'}</Td>
                      <Td>
                        <StatusBadge kind="generic" status={w.status} />
                      </Td>
                      <Td>
                        <When at={w.receivedAt} />
                      </Td>
                      <Td className="text-xs text-danger">{w.processingError ?? '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </QueryView>
        </CardContent>
      </Card>
    </div>
  );
}
