import type { BookingParty, DelegationScope, MembershipRole, OrgType, PlatformRole } from '@harvestslot/contracts';

/** The authenticated user performing a request, resolved server-side from the session. */
export interface Actor {
  userId: string;
  displayName: string;
  platformRole: PlatformRole;
  isDemo: boolean;
  requestId?: string;
  ip?: string;
}

export interface MembershipFact {
  organisationId: string;
  organisationType: OrgType;
  organisationStatus: string;
  organisationName: string;
  roles: MembershipRole[];
}

/** How an actor is entitled to act for a farmer. */
export type FarmerAuthority =
  | { mode: 'SELF'; farmerProfileId: string; farmerName: string }
  | {
      mode: 'DELEGATE';
      farmerProfileId: string;
      farmerName: string;
      delegationId: string;
      cooperativeId: string;
      cooperativeName: string;
      scopes: DelegationScope[];
    }
  | { mode: 'ADMIN'; farmerProfileId: string; farmerName: string };

export interface PartyAuthority {
  party: BookingParty;
  organisationId?: string;
  farmer?: FarmerAuthority;
}

export function actingFields(authority: FarmerAuthority | undefined): {
  actingForFarmerId: string | null;
  delegationId: string | null;
} {
  if (!authority) return { actingForFarmerId: null, delegationId: null };
  return {
    actingForFarmerId: authority.farmerProfileId,
    delegationId: authority.mode === 'DELEGATE' ? authority.delegationId : null,
  };
}
