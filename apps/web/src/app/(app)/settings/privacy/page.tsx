'use client';

import Link from 'next/link';
import { toast } from 'sonner';
import { When } from '@/components/domain/display';
import { QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives';
import { ApiError, get } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';
import { ReasonActionDialog } from '@/components/domain/dialogs';
import { StatusBadge } from '@/components/domain/display';

type Consent = { type: string; granted: boolean; documentVersion: string | null; method: string; createdAt: string };
type DataRequest = { id: string; type: 'EXPORT' | 'DELETION'; status: string; note: string | null; outcomeNote: string | null; resultAttachmentId: string | null; createdAt: string; completedAt: string | null };

export default function PrivacySettings() {
  const consents = useApi<Consent[]>(['consents'], '/privacy/consents');
  const requests = useApi<DataRequest[]>(['data-requests'], '/privacy/requests', { refetchInterval: 15_000 });
  const exportReq = useAction({ request: () => ({ path: '/privacy/requests', body: { type: 'EXPORT' }, idempotent: false }), invalidate: [['data-requests']], success: 'Export requested. It is prepared in the background; refresh in a minute.' });
  const download = async (attachmentId: string) => {
    try {
      const link = await get<{ url: string }>(`/attachments/${attachmentId}/link`);
      window.location.assign(link.url);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not download');
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="text-muted">
            Download a copy of your personal data, or ask for your account to be deleted. Transaction records (agreements, invoices, disputes, audit history) are kept for legal and accounting reasons, with your personal details removed where possible. See the <Link className="underline" href="/privacy">privacy notice</Link>.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => exportReq.mutate()} loading={exportReq.isPending}>
              Request a data export
            </Button>
            <ReasonActionDialog trigger="Request account deletion" title="Ask to delete your account?" description="An administrator reviews the request. Open bookings and unpaid invoices must be settled first." confirmLabel="Send request" path="/privacy/requests" body={{ type: 'DELETION' }} bodyKey="note" reasonLabel="Anything we should know?" reasonOptional invalidate={[['data-requests']]} success="Deletion request sent" />
          </div>
          <QueryView query={requests}>
            {(rows) =>
              rows.length ? (
                <ul className="flex flex-col gap-2">
                  {rows.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3">
                      <span className="font-medium">{r.type === 'EXPORT' ? 'Data export' : 'Account deletion'}</span>
                      <StatusBadge kind="generic" status={r.status} />
                      <span className="text-muted">
                        <When at={r.createdAt} />
                      </span>
                      {r.outcomeNote ? <span className="w-full text-muted">{r.outcomeNote}</span> : null}
                      {r.resultAttachmentId ? (
                        <Button size="sm" variant="outline" onClick={() => void download(r.resultAttachmentId!)}>
                          Download
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null
            }
          </QueryView>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Consents on record</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryView query={consents}>
            {(rows) => (
              <ul className="flex flex-col gap-1 text-sm">
                {rows.map((c, i) => (
                  <li key={i}>
                    {c.type.replace(/_/g, ' ').toLowerCase()}: <strong>{c.granted ? 'given' : 'withdrawn'}</strong> {c.documentVersion ? `(version ${c.documentVersion})` : ''} · {c.method.replace(/_/g, ' ').toLowerCase()} · <When at={c.createdAt} />
                  </li>
                ))}
              </ul>
            )}
          </QueryView>
        </CardContent>
      </Card>
    </div>
  );
}
