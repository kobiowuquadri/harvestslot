'use client';

import { useQuery, type QueryKey } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { roleGrants, scopeAllows, type DelegationScope, type FarmerAction, type OrgPermission } from '@harvestslot/contracts';
import { get } from './api';
import { useSession, type Workspace } from './session';

/** GET query against the API. Pass `null` as the path to keep it disabled. */
export function useApi<T>(key: QueryKey, path: string | null, options: { refetchInterval?: number | false; enabled?: boolean } = {}) {
  return useQuery<T>({
    queryKey: key,
    queryFn: ({ signal }) => get<T>(path!, signal),
    enabled: path !== null && (options.enabled ?? true),
    refetchInterval: options.refetchInterval,
  });
}

export interface FarmerContext {
  farmerProfileId: string;
  displayName: string;
  /** Set when a cooperative representative acts for a member farmer. */
  acting: { cooperativeName: string; scopes: DelegationScope[] } | null;
}

/**
 * The farmer whose data a farmer screen shows: the signed-in farmer, or — with `?farmer=<id>` — a
 * member the user represents through an active cooperative delegation. The API enforces the same.
 */
export function useFarmerContext(): FarmerContext | null {
  const params = useSearchParams();
  const { me } = useSession();
  if (!me) return null;
  const requested = params.get('farmer');
  if (requested && requested !== me.farmerProfile?.id) {
    const r = me.represented.find((x) => x.farmerProfileId === requested);
    return r ? { farmerProfileId: r.farmerProfileId, displayName: r.displayName, acting: { cooperativeName: r.cooperativeName, scopes: r.scopes } } : null;
  }
  return me.farmerProfile ? { farmerProfileId: me.farmerProfile.id, displayName: me.farmerProfile.displayName, acting: null } : null;
}

/** Keeps the acting-for parameter on links between farmer screens. */
export function withFarmer(path: string, ctx: FarmerContext | null): string {
  if (!ctx?.acting) return path;
  return `${path}${path.includes('?') ? '&' : '?'}farmer=${ctx.farmerProfileId}`;
}

export function farmerCan(ctx: FarmerContext | null, action: FarmerAction): boolean {
  if (!ctx) return false;
  return ctx.acting ? scopeAllows(action, ctx.acting.scopes) : true;
}

/** UI-only permission check (the API re-checks everything). */
export function can(workspace: Workspace | undefined, permission: OrgPermission): boolean {
  if (!workspace || workspace.kind === 'farmer' || workspace.kind === 'admin') return false;
  const orgType = workspace.kind === 'processor' ? 'PROCESSOR' : workspace.kind === 'transporter' ? 'TRANSPORTER' : 'COOPERATIVE';
  return roleGrants(permission, orgType, workspace.roles);
}
