'use client';

import { ReasonActionDialog } from '@/components/domain/dialogs';
import { StatusBadge, When } from '@/components/domain/display';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Alert, Badge, Card, CardContent } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';

type Row = { id: string; type: 'EXPORT' | 'DELETION'; status: string; user: string; email: string | null; note: string | null; outcomeNote: string | null; createdAt: string; completedAt: string | null };

export default function AdminDataRequests() {
  const q = useApi<Row[]>(['admin', 'data-requests'], '/admin/data-requests');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Privacy requests" description="Exports are produced automatically by the worker. Deletion requests are reviewed here: personal data is removed or anonymised, while transaction records required by law are kept in pseudonymised form." />
      <Alert tone="info">Before completing a deletion, check that the person has no open bookings, unpaid invoices or open disputes.</Alert>
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No requests" />}>
        {(rows) => (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.id}>
                <Card>
                  <CardContent className="flex flex-col gap-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={r.type === 'DELETION' ? 'danger' : 'neutral'}>{r.type === 'DELETION' ? 'Deletion' : 'Export'}</Badge>
                      <StatusBadge kind="generic" status={r.status} />
                      <span className="font-medium">{r.user}</span>
                      <span className="text-muted">{r.email}</span>
                      <span className="ml-auto text-muted">
                        <When at={r.createdAt} />
                      </span>
                    </div>
                    {r.note ? <p>“{r.note}”</p> : null}
                    {r.outcomeNote ? <p className="text-muted">Outcome: {r.outcomeNote}</p> : null}
                    {r.type === 'DELETION' && ['RECEIVED', 'IN_PROGRESS'].includes(r.status) ? (
                      <div className="flex flex-wrap gap-2">
                        {r.status === 'RECEIVED' ? <ReasonActionDialog trigger="Start review" triggerSize="sm" tone="primary" title="Mark as in progress?" confirmLabel="Start" path={`/admin/data-requests/${r.id}`} body={{ status: 'IN_PROGRESS' }} bodyKey="outcomeNote" reasonLabel="Note" invalidate={[['admin', 'data-requests']]} success="Marked in progress" /> : null}
                        <ReasonActionDialog trigger="Complete deletion" triggerSize="sm" title="Delete or anonymise this person’s data?" description="This cannot be undone. Retained transaction records are pseudonymised." confirmLabel="Complete deletion" path={`/admin/data-requests/${r.id}`} body={{ status: 'COMPLETED' }} bodyKey="outcomeNote" reasonLabel="Outcome note (shared with the person)" invalidate={[['admin', 'data-requests']]} success="Deletion completed" />
                        <ReasonActionDialog trigger="Reject" triggerSize="sm" triggerVariant="ghost" title="Reject this request?" confirmLabel="Reject" path={`/admin/data-requests/${r.id}`} body={{ status: 'REJECTED' }} bodyKey="outcomeNote" reasonLabel="Why (shared with the person)" invalidate={[['admin', 'data-requests']]} success="Rejected" />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}
