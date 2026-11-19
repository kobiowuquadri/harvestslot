'use client';

import Link from 'next/link';
import { ORG_STATUS_LABELS } from '@harvestslot/contracts';
import { Alert } from '@/components/ui/primitives';
import { useSession, type Workspace } from '@/lib/session';

export type Page<T> = { items: T[]; nextCursor: string | null };

export function OrgStatusAlert({ workspace }: { workspace: Extract<Workspace, { status: unknown }> }) {
  if (workspace.status === 'APPROVED') return null;
  return (
    <Alert
      tone={workspace.status === 'PENDING_REVIEW' ? 'warning' : 'danger'}
      title={`Organisation status: ${ORG_STATUS_LABELS[workspace.status]}`}
    >
      {workspace.status === 'PENDING_REVIEW'
        ? 'You can set things up now. Publishing capacity, making offers and quoting are available once an administrator has reviewed your organisation documents.'
        : 'Contact HarvestSlot support about your organisation status.'}{' '}
      <Link className="underline" href="/organisation">
        Organisation details
      </Link>
    </Alert>
  );
}

export function useFirstName(): string {
  const { me } = useSession();
  const name = me?.farmerProfile?.displayName ?? me?.user.displayName ?? '';
  return name.split(/\s+/)[0] ?? '';
}

export const windowLabel = (start: string, end: string) => {
  const day = new Intl.DateTimeFormat('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Lagos',
  }).format(new Date(start));
  const t = new Intl.DateTimeFormat('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Africa/Lagos',
  });
  return { day, time: `${t.format(new Date(start))}–${t.format(new Date(end))}` };
};
