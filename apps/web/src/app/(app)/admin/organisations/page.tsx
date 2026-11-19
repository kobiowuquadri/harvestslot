'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ORG_STATUS_LABELS, type OrgStatus } from '@harvestslot/contracts';
import { ReasonActionDialog } from '@/components/domain/dialogs';
import { DemoTag, StatusBadge, When } from '@/components/domain/display';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Select } from '@/components/ui/form';
import { Badge, Card, CardContent } from '@/components/ui/primitives';
import { ApiError, get } from '@/lib/api';
import { useApi } from '@/lib/hooks';

type AdminOrg = {
  id: string;
  type: string;
  name: string;
  status: OrgStatus;
  statusReason: string | null;
  lga: string;
  registrationNumber: string | null;
  owners: Array<{ name: string; email: string | null }>;
  documents: Array<{ id: string; filename: string; reviewStatus: string; scanStatus: string }>;
  isDemo: boolean;
  version: number;
  createdAt: string;
};

export default function AdminOrganisations() {
  const [status, setStatus] = useState('PENDING_REVIEW');
  const [type, setType] = useState('');
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (type) params.set('type', type);
  const q = useApi<AdminOrg[]>(['admin', 'orgs', params.toString()], `/admin/organisations?${params.toString()}`);
  const open = async (id: string) => {
    try {
      const link = await get<{ url: string }>(`/attachments/${id}/link`);
      window.open(link.url, '_blank', 'noopener');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not open');
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Organisation verification" description="Review uploaded documents. Approval means a HarvestSlot administrator reviewed them — it is not an official registry check and is labelled that way to users." />
      <div className="flex flex-wrap gap-3">
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-56">
          <option value="">All statuses</option>
          {Object.entries(ORG_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} className="w-48">
          <option value="">All types</option>
          <option value="PROCESSOR">Processors</option>
          <option value="TRANSPORTER">Transporters</option>
          <option value="COOPERATIVE">Cooperatives</option>
        </Select>
      </div>
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="Nothing here" />}>
        {(orgs) => (
          <ul className="flex flex-col gap-3">
            {orgs.map((o) => (
              <li key={o.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{o.name}</span>
                      <Badge tone="neutral">{o.type.toLowerCase()}</Badge>
                      <StatusBadge kind="generic" status={o.status} label={ORG_STATUS_LABELS[o.status]} />
                      {o.isDemo ? <DemoTag /> : null}
                      <span className="ml-auto text-muted">
                        {o.lga} · registered <When at={o.createdAt} />
                      </span>
                    </div>
                    <p>
                      Registration number (self-reported): {o.registrationNumber ?? '—'} · Owners: {o.owners.map((x) => `${x.name}${x.email ? ` <${x.email}>` : ''}`).join(', ')}
                    </p>
                    {o.statusReason ? <p className="text-muted">Last decision: {o.statusReason}</p> : null}
                    <div className="flex flex-col gap-1">
                      {o.documents.length === 0 ? <p className="text-amber-ink">No documents uploaded.</p> : null}
                      {o.documents.map((d) => (
                        <div key={d.id} className="flex flex-wrap items-center gap-2">
                          <button type="button" className="text-leaf underline" onClick={() => void open(d.id)}>
                            {d.filename}
                          </button>
                          <Badge tone={d.reviewStatus === 'ADMIN_APPROVED' ? 'success' : d.reviewStatus === 'ADMIN_REJECTED' ? 'danger' : 'warning'}>{d.reviewStatus.replace('ADMIN_', '').toLowerCase()}</Badge>
                          {d.scanStatus !== 'CLEAN' ? <Badge tone="neutral">scan: {d.scanStatus.toLowerCase().replace('_', ' ')}</Badge> : null}
                          {d.reviewStatus === 'UNREVIEWED' ? (
                            <>
                              <ReasonActionDialog trigger="Approve document" triggerSize="sm" tone="primary" title="Approve this document?" confirmLabel="Approve" path={`/admin/attachments/${d.id}/review`} body={{ decision: 'ADMIN_APPROVED' }} bodyKey="note" reasonLabel="Review note" invalidate={[['admin', 'orgs']]} success="Document approved" />
                              <ReasonActionDialog trigger="Reject document" triggerSize="sm" title="Reject this document?" confirmLabel="Reject" path={`/admin/attachments/${d.id}/review`} body={{ decision: 'ADMIN_REJECTED' }} bodyKey="note" reasonLabel="What is wrong?" invalidate={[['admin', 'orgs']]} success="Document rejected" />
                            </>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {o.status !== 'APPROVED' && o.status !== 'SUSPENDED' ? <ReasonActionDialog trigger="Approve organisation" triggerSize="sm" tone="primary" triggerVariant="primary" title={`Approve ${o.name}?`} description="They can then publish capacity, make offers or quote." confirmLabel="Approve" path={`/admin/organisations/${o.id}/review`} body={{ expectedVersion: o.version, decision: 'APPROVE' }} invalidate={[['admin', 'orgs']]} success="Approved" /> : null}
                      {o.status === 'PENDING_REVIEW' ? <ReasonActionDialog trigger="Reject" triggerSize="sm" title={`Reject ${o.name}?`} confirmLabel="Reject" path={`/admin/organisations/${o.id}/review`} body={{ expectedVersion: o.version, decision: 'REJECT' }} invalidate={[['admin', 'orgs']]} success="Rejected" /> : null}
                      {o.status === 'APPROVED' ? <ReasonActionDialog trigger="Suspend" triggerSize="sm" title={`Suspend ${o.name}?`} description="They can no longer make new commitments. Existing bookings stay visible." confirmLabel="Suspend" path={`/admin/organisations/${o.id}/review`} body={{ expectedVersion: o.version, decision: 'SUSPEND' }} invalidate={[['admin', 'orgs']]} success="Suspended" /> : null}
                      {o.status === 'SUSPENDED' || o.status === 'REJECTED' ? <ReasonActionDialog trigger="Reinstate" triggerSize="sm" tone="primary" title={`Reinstate ${o.name}?`} confirmLabel="Reinstate" path={`/admin/organisations/${o.id}/review`} body={{ expectedVersion: o.version, decision: 'REINSTATE' }} invalidate={[['admin', 'orgs']]} success="Reinstated" /> : null}
                    </div>
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
