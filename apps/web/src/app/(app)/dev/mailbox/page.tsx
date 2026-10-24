'use client';

import { When } from '@/components/domain/display';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Alert, Badge, Card, CardContent } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';

type Mailbox = { label: string; messages: Array<{ id: string; channel: 'EMAIL' | 'SMS'; to: string; subject: string | null; text: string; capturedAt: string }> };

export default function DevMailbox() {
  const q = useApi<Mailbox>(['dev-mailbox'], '/dev/mailbox', { refetchInterval: 5_000 });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Development mailbox" description="Emails and SMS captured on this machine instead of being sent. Available only in local and test environments." />
      <QueryView query={q}>
        {(m) => (
          <>
            <Alert tone="warning">{m.label}</Alert>
            {m.messages.length === 0 ? <EmptyState title="Nothing captured yet" /> : null}
            <ul className="flex flex-col gap-2">
              {m.messages.map((msg) => (
                <li key={msg.id}>
                  <Card>
                    <CardContent className="flex flex-col gap-1 text-sm">
                      <p className="flex flex-wrap items-center gap-2">
                        <Badge tone="accent">{msg.channel}</Badge> to <strong>{msg.to}</strong> · <When at={msg.capturedAt} relative />
                      </p>
                      {msg.subject ? <p className="font-medium">{msg.subject}</p> : null}
                      <pre className="whitespace-pre-wrap break-words font-sans text-muted">{msg.text}</pre>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryView>
    </div>
  );
}
