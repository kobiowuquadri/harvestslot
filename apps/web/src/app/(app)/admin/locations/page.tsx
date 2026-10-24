'use client';

import { ReasonActionDialog } from '@/components/domain/dialogs';
import { PageHeader, QueryView } from '@/components/domain/states';
import { Badge } from '@/components/ui/primitives';
import { useApi } from '@/lib/hooks';

type Location = { id: string; state: string; lga: string; active: boolean };

export default function AdminLocations() {
  const q = useApi<Location[]>(['admin', 'locations'], '/admin/locations');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Supported locations" description="Local government areas where farmers and organisations can register and be matched. This release covers Oyo State." />
      <QueryView query={q}>
        {(rows) => (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((l) => (
              <li key={l.id} className="flex items-center gap-2 rounded-lg border border-line bg-surface p-3 text-sm">
                <span className="flex-1">
                  {l.lga} <span className="text-muted">({l.state})</span>
                </span>
                <Badge tone={l.active ? 'success' : 'neutral'}>{l.active ? 'Active' : 'Inactive'}</Badge>
                <ReasonActionDialog
                  trigger={l.active ? 'Deactivate' : 'Activate'}
                  triggerSize="sm"
                  triggerVariant="ghost"
                  tone={l.active ? 'danger' : 'primary'}
                  title={`${l.active ? 'Deactivate' : 'Activate'} ${l.lga}?`}
                  description={l.active ? 'Existing records stay; new registrations and matches there stop.' : undefined}
                  confirmLabel={l.active ? 'Deactivate' : 'Activate'}
                  path="/admin/locations"
                  body={{ lga: l.lga, active: !l.active }}
                  invalidate={[['admin', 'locations'], ['public-config']]}
                  success="Updated"
                />
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}
