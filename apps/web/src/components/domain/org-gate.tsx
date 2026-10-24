'use client';

import type { ReactNode } from 'react';
import { useSession, type Workspace } from '@/lib/session';
import { EmptyState } from './states';

type OrgKind = 'processor' | 'transporter' | 'cooperative';

/** Renders children with the active organisation workspace of the required kind. */
export function OrgGate<K extends OrgKind>({ kind, children }: { kind: K; children: (w: Extract<Workspace, { kind: K }>) => ReactNode }) {
  const { workspace, workspaces, setWorkspace } = useSession();
  if (workspace?.kind === kind) return <>{children(workspace as Extract<Workspace, { kind: K }>)}</>;
  const other = workspaces.find((w) => w.kind === kind);
  return (
    <EmptyState
      title={`This page is for ${kind} organisations`}
      action={
        other ? (
          <button type="button" className="font-medium text-leaf underline" onClick={() => setWorkspace(other.key)}>
            Switch to {other.label}
          </button>
        ) : undefined
      }
    />
  );
}
