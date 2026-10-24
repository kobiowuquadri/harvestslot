'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { DELEGATION_SCOPE_LABELS, DelegationScopeE, type DelegationDto, type DelegationScope } from '@harvestslot/contracts';
import { ReasonActionDialog } from '@/components/domain/dialogs';
import { DateOnly, When } from '@/components/domain/display';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/form';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';

type DelegationsResponse = { delegations: DelegationDto[]; cooperatives: Array<{ id: string; name: string; memberSince: string }> };

function GrantDialog({ farmerProfileId, cooperative, current }: { farmerProfileId: string; cooperative: { id: string; name: string }; current?: DelegationDto }) {
  const [open, setOpen] = useState(false);
  const [scopes, setScopes] = useState<DelegationScope[]>(current?.scopes ?? ['ASSIST_DATA_ENTRY']);
  const grant = useAction({
    request: () => ({ path: `/farmers/${farmerProfileId}/delegations`, body: { cooperativeId: cooperative.id, scopes } }),
    invalidate: [['delegations', farmerProfileId], ['me']],
    success: 'Permissions saved',
    onSuccess: () => setOpen(false),
  });
  return (
    <>
      <Button size="sm" variant={current ? 'outline' : 'primary'} onClick={() => setOpen(true)}>
        {current ? 'Change permissions' : 'Give permissions'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`What may ${cooperative.name} do for you?`} description="You can change or remove this at any time. Every action they take is recorded with their name and yours.">
          <div className="flex flex-col gap-1">
            {DelegationScopeE.values.map((s) => (
              <Checkbox
                key={s}
                label={DELEGATION_SCOPE_LABELS[s].label}
                description={DELEGATION_SCOPE_LABELS[s].description}
                checked={scopes.includes(s)}
                onChange={(e) => setScopes((p) => (e.target.checked ? [...p, s] : p.filter((x) => x !== s)))}
              />
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => grant.mutate()} loading={grant.isPending} disabled={!scopes.length}>
              Save permissions
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function PermissionsPage() {
  const { me } = useSession();
  const params = useSearchParams();
  const farmerId = me?.farmerProfile?.id ?? null;
  const q = useApi<DelegationsResponse>(['delegations', farmerId], farmerId ? `/farmers/${farmerId}/delegations` : null);
  if (!farmerId) return <EmptyState title="Only farmers manage cooperative permissions" />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Cooperative permissions" description="Choose what your cooperative may do on your behalf. They can never act beyond what you allow." />
      {params.get('claimed') ? (
        <Alert tone="success" title="Your account is claimed">
          Check what your cooperative may do for you below. You can change or remove any permission.
        </Alert>
      ) : null}
      <QueryView query={q}>
        {(d) => (
          <>
            {d.cooperatives.length === 0 ? <EmptyState title="You are not a member of any cooperative on HarvestSlot" /> : null}
            {d.cooperatives.map((c) => {
              const active = d.delegations.find((x) => x.cooperativeId === c.id && x.active);
              return (
                <Card key={c.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle>{c.name}</CardTitle>
                      <span className="text-xs text-muted">
                        Member since <DateOnly date={c.memberSince} />
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {active ? (
                      <>
                        <ul className="flex flex-col gap-2">
                          {active.scopes.map((s) => (
                            <li key={s} className="flex gap-2 text-sm">
                              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-leaf" aria-hidden />
                              <span>
                                <span className="font-medium">{DELEGATION_SCOPE_LABELS[s].label}</span> — <span className="text-muted">{DELEGATION_SCOPE_LABELS[s].description}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="text-xs text-muted">
                          {active.method === 'RECORDED_BY_REPRESENTATIVE' ? `Recorded by ${active.recordedBy}${active.witnessName ? ` with witness ${active.witnessName}` : ''}${active.hasEvidence ? ' and a signed form' : ''}` : 'Given by you in the app'} on <When at={active.grantedAt} />
                          {active.expiresAt ? (
                            <>
                              {' '}
                              · expires <DateOnly date={active.expiresAt} />
                            </>
                          ) : null}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <GrantDialog farmerProfileId={farmerId} cooperative={c} current={active} />
                          <ReasonActionDialog trigger="Remove all permissions" triggerSize="sm" title={`Remove ${c.name}'s permissions?`} description="They will immediately stop being able to act for you. Bookings already agreed stay in place." confirmLabel="Remove permissions" path={`/delegations/${active.id}/revoke`} invalidate={[['delegations', farmerId], ['me']]} success="Permissions removed" />
                        </div>
                      </>
                    ) : (
                      <>
                        <Badge tone="neutral">No permissions</Badge>
                        <GrantDialog farmerProfileId={farmerId} cooperative={c} />
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {d.delegations.some((x) => !x.active) ? (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">Past permissions</summary>
                <ul className="mt-2 flex flex-col gap-1 text-muted">
                  {d.delegations
                    .filter((x) => !x.active)
                    .map((x) => (
                      <li key={x.id}>
                        {x.cooperativeName}: {x.scopes.map((s) => DELEGATION_SCOPE_LABELS[s].label).join(', ')} — {x.revokedAt ? <>ended <DateOnly date={x.revokedAt} /> ({x.revokeReason})</> : 'expired'}
                      </li>
                    ))}
                </ul>
              </details>
            ) : null}
          </>
        )}
      </QueryView>
    </div>
  );
}
