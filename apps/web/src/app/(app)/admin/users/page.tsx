'use client';

import { useState } from 'react';
import { ReasonActionDialog } from '@/components/domain/dialogs';
import { DemoTag, StatusBadge, When } from '@/components/domain/display';
import { EmptyState, PageHeader, QueryView } from '@/components/domain/states';
import { Input } from '@/components/ui/form';
import { Badge, Table, Td, Th } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';

type AdminUser = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  platformRole: string;
  memberships: Array<{ organisationName: string; roles: string[] }>;
  hasFarmerProfile: boolean;
  mfaEnabled: boolean;
  isDemo: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  version: number;
};

export default function AdminUsers() {
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const q = useApi<AdminUser[]>(['admin', 'users', applied], `/admin/users${applied ? `?q=${encodeURIComponent(applied)}` : ''}`);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Users" description="Suspending a user signs them out everywhere. Every change needs a reason and is audited." />
      <form
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(search.trim());
        }}
      >
        <Input aria-label="Search users" placeholder="Name, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
      </form>
      <QueryView query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No users found" />}>
        {(users) => (
          <Table caption="Users">
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Roles</Th>
                <Th>Status</Th>
                <Th>Last sign-in</Th>
                <Th>
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <Td>
                    <span className="font-medium">{u.displayName}</span> {u.isDemo ? <DemoTag /> : null}
                    <span className="block text-xs text-muted">{u.email ?? u.phone}</span>
                  </Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {u.platformRole === 'ADMIN' ? <Badge tone="info">Admin</Badge> : null}
                      {u.hasFarmerProfile ? <Badge tone="neutral">Farmer</Badge> : null}
                      {u.memberships.map((m) => (
                        <Badge key={m.organisationName} tone="neutral">
                          {m.organisationName}: {m.roles.join(', ').toLowerCase()}
                        </Badge>
                      ))}
                      {u.mfaEnabled ? <Badge tone="success">2FA</Badge> : null}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge kind="generic" status={u.status} />
                  </Td>
                  <Td>{u.lastLoginAt ? <When at={u.lastLoginAt} relative /> : 'Never'}</Td>
                  <Td>
                    {u.status === 'ACTIVE' ? (
                      <ReasonActionDialog trigger="Suspend" triggerSize="sm" title={`Suspend ${u.displayName}?`} confirmLabel="Suspend" path={`/admin/users/${u.id}/status`} body={{ expectedVersion: u.version, status: 'SUSPENDED' }} invalidate={[['admin', 'users']]} success="User suspended" />
                    ) : (
                      <ReasonActionDialog trigger="Reactivate" triggerSize="sm" tone="primary" title={`Reactivate ${u.displayName}?`} confirmLabel="Reactivate" path={`/admin/users/${u.id}/status`} body={{ expectedVersion: u.version, status: 'ACTIVE' }} invalidate={[['admin', 'users']]} success="User reactivated" />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </QueryView>
    </div>
  );
}
