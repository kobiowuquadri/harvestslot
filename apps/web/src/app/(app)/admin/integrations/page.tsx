'use client';

import type { IntegrationStatus } from '@harvestslot/contracts';
import { PageHeader, QueryView } from '@/components/domain/states';
import { Badge, Card, CardContent } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';

const TONE = { configured: 'success', simulated: 'accent', unconfigured: 'warning', disabled: 'neutral' } as const;
const LABEL = { configured: 'Working integration', simulated: 'Simulated (development)', unconfigured: 'Awaiting credentials', disabled: 'Disabled' } as const;

export default function AdminIntegrations() {
  const q = useApi<IntegrationStatus>(['integrations'], '/integrations/status');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Integrations" description="What is actually connected in this environment. Simulated services never contact real providers; unconfigured ones fall back as described." />
      <QueryView query={q}>
        {(s) => (
          <>
            <p className="text-sm">
              Environment: <strong>{s.environment}</strong>
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {s.capabilities.map((c) => (
                <Card key={c.key}>
                  <CardContent className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.label}</span>
                      <Badge tone={TONE[c.status]}>{LABEL[c.status]}</Badge>
                    </div>
                    <p className="text-sm text-muted">{c.detail}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </QueryView>
    </div>
  );
}
