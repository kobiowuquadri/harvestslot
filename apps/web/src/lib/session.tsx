'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Me, MembershipRole, OrgStatus, PublicConfig } from '@harvestslot/contracts';
import { ApiError, get, post } from './api';
import { clearAllDrafts } from './drafts';

export type Workspace =
  | { kind: 'farmer'; key: string; label: string; farmerProfileId: string }
  | { kind: 'cooperative'; key: string; label: string; orgId: string; roles: MembershipRole[]; status: OrgStatus }
  | { kind: 'processor'; key: string; label: string; orgId: string; roles: MembershipRole[]; status: OrgStatus }
  | { kind: 'transporter'; key: string; label: string; orgId: string; roles: MembershipRole[]; status: OrgStatus }
  | { kind: 'admin'; key: string; label: string };

export function workspacesFor(me: Me): Workspace[] {
  const out: Workspace[] = [];
  if (me.farmerProfile) out.push({ kind: 'farmer', key: 'farmer', label: 'My farm', farmerProfileId: me.farmerProfile.id });
  for (const m of me.memberships) {
    const kind = m.organisationType === 'PROCESSOR' ? 'processor' : m.organisationType === 'TRANSPORTER' ? 'transporter' : 'cooperative';
    out.push({ kind, key: `${kind}:${m.organisationId}`, label: m.organisationName, orgId: m.organisationId, roles: m.roles, status: m.organisationStatus } as Workspace);
  }
  if (me.user.platformRole === 'ADMIN') out.push({ kind: 'admin', key: 'admin', label: 'HarvestSlot admin' });
  return out;
}

interface SessionValue {
  me: Me | undefined;
  config: PublicConfig | undefined;
  status: 'loading' | 'authenticated' | 'unauthenticated' | 'mfa';
  workspaces: Workspace[];
  workspace: Workspace | undefined;
  setWorkspace: (key: string) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await get<Me>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.code === 'MFA_REQUIRED')) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 2,
  });
  const configQuery = useQuery({ queryKey: ['public-config'], queryFn: () => get<PublicConfig>('/config/public'), staleTime: 10 * 60_000 });
  const me = meQuery.data ?? undefined;
  const workspaces = useMemo(() => (me ? workspacesFor(me) : []), [me]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(`hs.workspace:${me.user.id}`);
    } catch {
      // storage unavailable (private mode): fall back to the first workspace
    }
    setSelected(stored && workspaces.some((w) => w.key === stored) ? stored : (workspaces[0]?.key ?? null));
  }, [me, workspaces]);

  const setWorkspace = useCallback(
    (key: string) => {
      setSelected(key);
      try {
        if (me) window.localStorage.setItem(`hs.workspace:${me.user.id}`, key);
      } catch {
        // non-essential preference
      }
    },
    [me],
  );

  const status: SessionValue['status'] = meQuery.isLoading ? 'loading' : me ? (me.session.mfaPending ? 'mfa' : 'authenticated') : 'unauthenticated';

  const value: SessionValue = {
    me,
    config: configQuery.data,
    status,
    workspaces,
    workspace: workspaces.find((w) => w.key === selected) ?? workspaces[0],
    setWorkspace,
    refresh: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
    signOut: async () => {
      const userId = me?.user.id;
      await post('/auth/logout').catch(() => undefined);
      // Offline drafts are scoped to the account and removed at sign-out.
      if (userId) await clearAllDrafts(userId).catch(() => undefined);
      navigator.serviceWorker?.controller?.postMessage('clear-pages');
      qc.clear();
      window.location.assign('/login');
    },
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** Org id of the active workspace of the given kind (throws in components rendered for other kinds). */
export function useOrgWorkspace(kind: 'processor' | 'transporter' | 'cooperative') {
  const { workspace } = useSession();
  if (!workspace || workspace.kind !== kind) return null;
  return workspace as Extract<Workspace, { kind: typeof kind }>;
}
