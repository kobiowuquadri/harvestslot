'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ORG_STATUS_LABELS, ROLE_LABELS, type MembershipRole, type OrganisationDto } from '@harvestslot/contracts';
import { ReasonActionDialog } from '@/components/domain/dialogs';
import { DemoTag, ReviewedTag, StatusBadge, When } from '@/components/domain/display';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, DescriptionList, Dialog, DialogContent } from '@/components/ui/primitives';
import { ApiError, uploadFile } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useAction } from '@/lib/mutations';
import { useSession } from '@/lib/session';

type Staff = {
  members: Array<{ membershipId: string; userId: string; displayName: string; email: string | null; roles: MembershipRole[]; status: 'ACTIVE' | 'REVOKED'; version: number; isMe: boolean }>;
  invitations: Array<{ id: string; email: string; roles: MembershipRole[]; expiresAt: string }>;
  allowedRoles: MembershipRole[];
};

function EditProfile({ org }: { org: OrganisationDto }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(org.name);
  const [address, setAddress] = useState(org.address ?? '');
  const [registrationNumber, setReg] = useState(org.registrationNumber ?? '');
  const [contactEmail, setEmail] = useState(org.contactEmail ?? '');
  const [contactPhone, setPhone] = useState(org.contactPhone ?? '');
  const [description, setDescription] = useState(org.description ?? '');
  const save = useAction({
    request: () => ({ path: `/organisations/${org.id}`, method: 'PATCH', idempotent: false, body: { expectedVersion: org.version, name, address: address || undefined, registrationNumber: registrationNumber || undefined, contactEmail: contactEmail || undefined, contactPhone: contactPhone || undefined, description: description || undefined } }),
    invalidate: [['organisation', org.id], ['me']],
    success: 'Saved',
    toastErrors: false,
    onSuccess: () => setOpen(false),
  });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Edit details
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Organisation details">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            {save.error ? <Alert tone="danger">{save.error.message}</Alert> : null}
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Address">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <Field label="Registration number" hint="Self-reported. Changing it after review sends the organisation back for review.">
              <Input value={registrationNumber} onChange={(e) => setReg(e.target.value)} />
            </Field>
            <Field label="Contact email">
              <Input type="email" value={contactEmail} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Contact phone">
              <Input type="tel" value={contactPhone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Description">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InviteDialog({ orgId, allowed }: { orgId: string; allowed: MembershipRole[] }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<MembershipRole[]>([]);
  const invite = useAction({ request: () => ({ path: `/organisations/${orgId}/invitations`, body: { email, roles }, idempotent: false }), invalidate: [['staff', orgId]], success: 'Invitation sent', toastErrors: false, onSuccess: () => setOpen(false) });
  return (
    <>
      <Button onClick={() => setOpen(true)}>Invite staff</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Invite a staff member" description="They receive a link to join with these roles. Roles decide what they can see and do.">
          <div className="flex flex-col gap-4">
            {invite.error ? <Alert tone="danger">{invite.error.message}</Alert> : null}
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-medium">Roles</legend>
              {allowed.map((r) => (
                <Checkbox key={r} label={ROLE_LABELS[r]} checked={roles.includes(r)} onChange={(e) => setRoles((p) => (e.target.checked ? [...p, r] : p.filter((x) => x !== r)))} />
              ))}
            </fieldset>
            <Button onClick={() => invite.mutate()} loading={invite.isPending} disabled={!email || !roles.length}>
              Send invitation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RolesDialog({ orgId, member, allowed }: { orgId: string; member: Staff['members'][number]; allowed: MembershipRole[] }) {
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<MembershipRole[]>(member.roles);
  const save = useAction({ request: () => ({ path: `/organisations/${orgId}/members/${member.membershipId}/roles`, body: { expectedVersion: member.version, roles }, idempotent: false }), invalidate: [['staff', orgId]], success: 'Roles updated', onSuccess: () => setOpen(false) });
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Change roles
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Roles for ${member.displayName}`}>
          {allowed.map((r) => (
            <Checkbox key={r} label={ROLE_LABELS[r]} checked={roles.includes(r)} onChange={(e) => setRoles((p) => (e.target.checked ? [...p, r] : p.filter((x) => x !== r)))} />
          ))}
          <Button className="mt-4" onClick={() => save.mutate()} loading={save.isPending} disabled={!roles.length}>
            Save roles
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function OrganisationPage() {
  const { workspace } = useSession();
  const qc = useQueryClient();
  const orgId = workspace && 'orgId' in workspace ? workspace.orgId : null;
  const org = useApi<OrganisationDto>(['organisation', orgId], orgId ? `/organisations/${orgId}` : null);
  const staff = useApi<Staff>(['staff', orgId], orgId ? `/organisations/${orgId}/staff` : null);
  const [uploading, setUploading] = useState(false);
  if (!orgId) return <EmptyState title="Choose an organisation workspace first" />;
  const isOwner = workspace && 'roles' in workspace && workspace.roles.includes('OWNER');
  const canEdit = workspace && 'roles' in workspace && (workspace.roles.includes('OWNER') || (workspace.kind === 'processor' && workspace.roles.includes('MANAGER')));
  return (
    <QueryView query={org}>
      {(o) => (
        <div className="flex flex-col gap-6">
          <PageHeader
            title={
              <span className="flex flex-wrap items-center gap-2">
                {o.name} {o.isDemo ? <DemoTag /> : null}
              </span>
            }
            description={`${o.type.toLowerCase()} · ${o.lga}, ${o.state}`}
            actions={canEdit ? <EditProfile org={o} /> : null}
          />
          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge kind="generic" status={o.status} label={ORG_STATUS_LABELS[o.status]} />
                <ReviewedTag approved={o.status === 'APPROVED'} />
              </div>
              {o.statusReason ? <Alert tone={o.status === 'APPROVED' ? 'info' : 'warning'}>{o.statusReason}</Alert> : null}
              <DescriptionList
                items={[
                  ['Registration number', <span key="r">{o.registrationNumber ?? '—'} <span className="block text-xs text-muted">{o.registrationNumberNote}</span></span>],
                  ['Address', o.address ?? '—'],
                  ['Contact email', o.contactEmail ?? '—'],
                  ['Contact phone', o.contactPhone ?? '—'],
                  ['Reviewed', o.reviewedAt ? <When key="w" at={o.reviewedAt} /> : 'Not yet'],
                  ['Description', o.description ?? '—'],
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Documents for review</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p className="text-muted">Upload your registration certificate or other documents. An administrator checks them; this is a HarvestSlot review, not an official registry check.</p>
              <ul className="flex flex-col gap-1">
                {o.documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2">
                    {d.filename} <Badge tone={d.reviewStatus === 'ADMIN_APPROVED' ? 'success' : d.reviewStatus === 'ADMIN_REJECTED' ? 'danger' : 'warning'}>{d.reviewStatus === 'UNREVIEWED' ? 'Awaiting review' : d.reviewStatus === 'ADMIN_APPROVED' ? 'Approved' : 'Rejected'}</Badge>
                    {d.scanStatus === 'NOT_SCANNED' ? <Badge tone="neutral">Not virus-scanned</Badge> : null}
                  </li>
                ))}
                {o.documents.length === 0 ? <li className="text-muted">No documents yet.</li> : null}
              </ul>
              {canEdit ? (
                <label className="inline-flex w-fit cursor-pointer items-center rounded-lg border border-line-strong px-3 py-2 font-medium hover:bg-leaf-50">
                  {uploading ? 'Uploading…' : 'Upload a document (PDF or photo)'}
                  <input
                    type="file"
                    className="sr-only"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      setUploading(true);
                      try {
                        await uploadFile(file, { purpose: 'ORG_DOCUMENT', organisationId: o.id });
                        toast.success('Uploaded for review');
                        await qc.invalidateQueries({ queryKey: ['organisation', o.id] });
                      } catch (err) {
                        toast.error(err instanceof ApiError ? err.message : 'Upload failed');
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </label>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Staff</CardTitle>
                {isOwner && staff.data ? <InviteDialog orgId={o.id} allowed={staff.data.allowedRoles} /> : null}
              </div>
            </CardHeader>
            <CardContent>
              <QueryView query={staff}>
                {(s) => (
                  <div className="flex flex-col gap-3">
                    <ul className="flex flex-col gap-2 text-sm">
                      {s.members.map((m) => (
                        <li key={m.membershipId} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-3">
                          <span className="flex-1">
                            <span className="font-medium">{m.displayName}</span> {m.isMe ? <Badge tone="info">You</Badge> : null}
                            <span className="block text-muted">{m.email}</span>
                          </span>
                          <span className="flex flex-wrap gap-1">
                            {m.roles.map((r) => (
                              <Badge key={r} tone="neutral">
                                {ROLE_LABELS[r]}
                              </Badge>
                            ))}
                          </span>
                          {m.status === 'REVOKED' ? <Badge tone="danger">Removed</Badge> : null}
                          {isOwner && !m.isMe && m.status === 'ACTIVE' ? (
                            <>
                              <RolesDialog orgId={o.id} member={m} allowed={s.allowedRoles} />
                              <ReasonActionDialog trigger="Remove" triggerSize="sm" triggerVariant="ghost" title={`Remove ${m.displayName}?`} description="They lose access immediately. Their past actions stay in the record." confirmLabel="Remove" path={`/organisations/${o.id}/members/${m.membershipId}/revoke`} invalidate={[['staff', o.id]]} success="Removed" />
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {s.invitations.length ? (
                      <>
                        <p className="text-sm font-medium">Pending invitations</p>
                        <ul className="flex flex-col gap-1 text-sm">
                          {s.invitations.map((i) => (
                            <li key={i.id} className="flex flex-wrap items-center gap-2">
                              {i.email} · {i.roles.map((r) => ROLE_LABELS[r]).join(', ')} · expires <When at={i.expiresAt} relative />
                              {isOwner ? <ReasonActionDialog trigger="Revoke" triggerSize="sm" triggerVariant="ghost" title="Revoke invitation?" confirmLabel="Revoke" path={`/organisations/${o.id}/invitations/${i.id}/revoke`} reasonOptional invalidate={[['staff', o.id]]} success="Invitation revoked" /> : null}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </div>
                )}
              </QueryView>
            </CardContent>
          </Card>
        </div>
      )}
    </QueryView>
  );
}
