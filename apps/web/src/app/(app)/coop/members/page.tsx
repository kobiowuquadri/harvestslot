'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { DELEGATION_SCOPE_LABELS, DelegationScopeE, type CoopMemberDto, type DelegationScope } from '@harvestslot/contracts';
import { ReasonActionDialog } from '@/components/domain/dialogs';
import { DateOnly, When } from '@/components/domain/display';
import { OrgGate } from '@/components/domain/org-gate';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, CardContent, Dialog, DialogContent } from '@/components/ui/primitives';
import { ApiError, uploadFile } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';

const CLAIM_LABEL = { SELF_REGISTERED: 'Has own account', REPRESENTED_UNCLAIMED: 'No account yet', CLAIMED: 'Claimed account' } as const;

function RecordConsent({ coopId, m }: { coopId: string; m: CoopMemberDto }) {
  const [open, setOpen] = useState(false);
  const [scopes, setScopes] = useState<DelegationScope[]>(m.activeDelegation?.scopes ?? ['ASSIST_DATA_ENTRY']);
  const [witness, setWitness] = useState('');
  const [note, setNote] = useState('');
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const save = useAction({
    request: () => ({ path: `/cooperatives/${coopId}/members/${m.farmerProfileId}/delegations`, body: { scopes, witnessName: witness || undefined, note: note || undefined, evidenceAttachmentId: evidenceId ?? undefined } }),
    invalidate: [['coop-members', coopId], ['me']],
    success: 'Consent recorded',
    toastErrors: false,
    onSuccess: () => setOpen(false),
  });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {m.activeDelegation ? 'Update consent' : 'Record consent'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`What has ${m.displayName} agreed you may do?`} description="Record only what the farmer agreed to, with a witness or a signed form. The farmer can see and remove this once they claim their account.">
          <div className="flex flex-col gap-3">
            {save.error ? <Alert tone="danger">{save.error.message}</Alert> : null}
            {DelegationScopeE.values.map((s) => (
              <Checkbox key={s} label={DELEGATION_SCOPE_LABELS[s].label} description={DELEGATION_SCOPE_LABELS[s].description} checked={scopes.includes(s)} onChange={(e) => setScopes((p) => (e.target.checked ? [...p, s] : p.filter((x) => x !== s)))} />
            ))}
            <Field label="Witness name" hint="Someone present when the farmer agreed.">
              <Input value={witness} onChange={(e) => setWitness(e.target.value)} />
            </Field>
            <label className="inline-flex w-fit cursor-pointer items-center rounded-lg border border-line-strong px-3 py-2 text-sm font-medium hover:bg-leaf-50">
              {uploading ? 'Uploading…' : evidenceId ? 'Signed form attached ✓' : 'Attach signed consent form'}
              <input
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setUploading(true);
                  try {
                    const a = await uploadFile<{ id: string }>(file, { purpose: 'CONSENT_FORM', organisationId: coopId, farmerProfileId: m.farmerProfileId });
                    setEvidenceId(a.id);
                  } catch (err) {
                    toast.error(err instanceof ApiError ? err.message : 'Upload failed');
                  } finally {
                    setUploading(false);
                  }
                }}
              />
            </label>
            <Field label="Note">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!scopes.length || (!witness && !evidenceId)}>
              Record consent
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ClaimInvite({ coopId, m }: { coopId: string; m: CoopMemberDto }) {
  const [result, setResult] = useState<{ claimCode: string; sentVia: string[]; unavailable: string[]; expiresAt: string } | null>(null);
  const invite = useAction<void, { claimCode: string; sentVia: string[]; unavailable: string[]; expiresAt: string }>({ request: () => ({ path: `/cooperatives/${coopId}/members/${m.farmerProfileId}/claim-invite`, idempotent: false }), onSuccess: setResult });
  if (m.claimStatus !== 'REPRESENTED_UNCLAIMED') return null;
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => invite.mutate()} loading={invite.isPending}>
        Invite to claim account
      </Button>
      <Dialog open={result !== null} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent title="Claim invitation created">
          {result ? (
            <div className="flex flex-col gap-3 text-sm">
              <p>
                Give {m.displayName} this claim code: <strong className="font-mono text-lg">{result.claimCode}</strong>
              </p>
              <p className="text-muted">
                Expires <When at={result.expiresAt} />. {result.sentVia.length ? `Also sent by ${result.sentVia.join(' and ').toLowerCase()}.` : ''}
              </p>
              {result.unavailable.length ? <Alert tone="warning">{result.unavailable.join(' ')}</Alert> : null}
              <p>They will confirm with a code sent to the phone number on their profile, so only they can claim it.</p>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Members({ coopId }: { coopId: string }) {
  const q = useApi<CoopMemberDto[]>(['coop-members', coopId], `/cooperatives/${coopId}/members`);
  const [filter, setFilter] = useState('');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Members"
        description="You can act for a member only within the permissions they agreed to. Every action shows you and the farmer."
        actions={
          <Button asChild>
            <Link href="/coop/members/new">
              <Plus className="size-4" aria-hidden /> Register or link a member
            </Link>
          </Button>
        }
      />
      <Input aria-label="Search members" placeholder="Search by name, LGA or member number" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-md" />
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No members yet" />}>
        {(items) => (
          <ul className="flex flex-col gap-3">
            {items
              .filter((m) => !filter || `${m.displayName} ${m.lga} ${m.memberRef ?? ''}`.toLowerCase().includes(filter.toLowerCase()))
              .map((m) => (
                <li key={m.membershipId}>
                  <Card>
                    <CardContent className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-forest">{m.displayName}</span>
                        {m.memberRef ? <Badge tone="neutral">#{m.memberRef}</Badge> : null}
                        <Badge tone={m.claimStatus === 'REPRESENTED_UNCLAIMED' ? 'warning' : 'success'}>{CLAIM_LABEL[m.claimStatus]}</Badge>
                        {m.status === 'ENDED' ? <Badge tone="danger">Membership ended</Badge> : null}
                        <span className="ml-auto text-sm text-muted">
                          {m.community ? `${m.community}, ` : ''}
                          {m.lga} · joined <DateOnly date={m.joinedAt} />
                        </span>
                      </div>
                      {m.activeDelegation ? (
                        <p className="text-sm">
                          May: {m.activeDelegation.scopes.map((s) => DELEGATION_SCOPE_LABELS[s].label).join(', ')}
                          <span className="text-muted"> · {m.activeDelegation.method === 'FARMER_IN_APP' ? 'given by the farmer in the app' : `recorded by ${m.activeDelegation.recordedBy}`}</span>
                        </p>
                      ) : (
                        <Alert tone="warning">No active permission — you cannot act for this farmer.</Alert>
                      )}
                      <p className="text-sm text-muted">
                        {m.openRequests} open harvest request(s) · {m.activeBookings} active booking(s)
                      </p>
                      {m.status === 'ACTIVE' ? (
                        <div className="flex flex-wrap gap-2">
                          {m.activeDelegation ? (
                            <>
                              <Button asChild size="sm">
                                <Link href={`/farmer/harvests?farmer=${m.farmerProfileId}`}>Harvest requests</Link>
                              </Button>
                              <Button asChild size="sm" variant="outline">
                                <Link href={`/bookings?farmer=${m.farmerProfileId}`}>Bookings</Link>
                              </Button>
                              <Button asChild size="sm" variant="outline">
                                <Link href={`/farmer/locations?farmer=${m.farmerProfileId}`}>Farm locations</Link>
                              </Button>
                            </>
                          ) : null}
                          {m.claimStatus === 'REPRESENTED_UNCLAIMED' || !m.activeDelegation ? <RecordConsent coopId={coopId} m={m} /> : null}
                          <ClaimInvite coopId={coopId} m={m} />
                          {m.activeDelegation ? <ReasonActionDialog trigger="End permissions" triggerSize="sm" triggerVariant="ghost" title="End this permission?" confirmLabel="End permission" path={`/delegations/${m.activeDelegation.id}/revoke`} invalidate={[['coop-members', coopId], ['me']]} success="Permission ended" /> : null}
                          <ReasonActionDialog trigger="End membership" triggerSize="sm" triggerVariant="ghost" title={`End ${m.displayName}'s membership?`} description="Permissions end too. Their bookings and history stay with the farmer." confirmLabel="End membership" path={`/cooperatives/${coopId}/members/${m.farmerProfileId}/end`} invalidate={[['coop-members', coopId], ['me']]} success="Membership ended" />
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

export default function MembersPage() {
  return <OrgGate kind="cooperative">{(w) => <Members coopId={w.orgId} />}</OrgGate>;
}
