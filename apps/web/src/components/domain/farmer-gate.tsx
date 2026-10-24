'use client';

import type { ReactNode } from 'react';
import type { FarmerProfileDto } from '@harvestslot/contracts';
import { useApi, useFarmerContext, type FarmerContext } from '@/lib/hooks';
import { ActingForBanner } from './banners';
import { EmptyState, QueryView } from './states';

/** Resolves which farmer a farmer screen is for, and shows the acting-for banner for representatives. */
export function FarmerGate({ children }: { children: (ctx: FarmerContext) => ReactNode }) {
  const ctx = useFarmerContext();
  if (!ctx) {
    return (
      <EmptyState title="No farmer profile here">
        This screen is for farmers, or for cooperative representatives acting for a member with an active permission.
      </EmptyState>
    );
  }
  return (
    <>
      {ctx.acting ? <ActingForBanner farmerName={ctx.displayName} cooperativeName={ctx.acting.cooperativeName} scopes={ctx.acting.scopes} /> : null}
      {children(ctx)}
    </>
  );
}

export function useFarmerProfile(ctx: FarmerContext | null) {
  return useApi<FarmerProfileDto>(['farmer-profile', ctx?.farmerProfileId], ctx ? `/farmers/${ctx.farmerProfileId}` : null);
}

export function WithFarmerProfile({ ctx, children }: { ctx: FarmerContext; children: (p: FarmerProfileDto) => ReactNode }) {
  const q = useFarmerProfile(ctx);
  return <QueryView query={q}>{children}</QueryView>;
}
