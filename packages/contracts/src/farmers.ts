import { z } from 'zod';
import { emailAddress, lgaName, nigeriaPoint, optionalText, phoneNumber, reasonText, shortText, uuid } from './common.js';
import { ConsentMethodE, DelegationScopeE, FarmerClaimStatusE, LocationSourceE } from './enums.js';

export const updateFarmerProfileSchema = z.object({
  expectedVersion: z.number().int().min(1),
  displayName: shortText(120).optional(),
  phone: phoneNumber.optional(),
  preferredLanguage: z.enum(['en', 'yo']).optional(),
  lga: lgaName.optional(),
  community: optionalText(120),
  contactConsent: z.boolean().optional(),
  locationConsent: z.boolean().optional(),
});

export const farmLocationInputSchema = z.object({
  label: shortText(80),
  lga: lgaName,
  community: optionalText(120),
  point: nigeriaPoint.optional(),
  accuracyM: z.number().int().min(0).max(100_000).optional(),
  source: LocationSourceE.schema,
  directions: optionalText(500),
});
export type FarmLocationInput = z.infer<typeof farmLocationInputSchema>;

export const updateFarmLocationSchema = farmLocationInputSchema.extend({ expectedVersion: z.number().int().min(1) });

export const farmLocationSchema = z.object({
  id: uuid,
  label: z.string(),
  lga: z.string(),
  community: z.string().nullable(),
  approx: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  /** Present only for the farmer, their delegates and authorised booking participants. */
  exact: z.object({ lat: z.number(), lng: z.number(), accuracyM: z.number().nullable() }).nullable(),
  source: LocationSourceE.schema,
  directions: z.string().nullable(),
  archived: z.boolean(),
  version: z.number(),
});
export type FarmLocationDto = z.infer<typeof farmLocationSchema>;

export const farmerProfileSchema = z.object({
  id: uuid,
  displayName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  preferredLanguage: z.string(),
  lga: z.string().nullable(),
  community: z.string().nullable(),
  claimStatus: FarmerClaimStatusE.schema,
  hasAccount: z.boolean(),
  contactConsent: z.boolean(),
  locationConsent: z.boolean(),
  isDemo: z.boolean(),
  version: z.number(),
  locations: z.array(farmLocationSchema),
});
export type FarmerProfileDto = z.infer<typeof farmerProfileSchema>;

// ───────────── Cooperatives & delegation ─────────────

export const registerMemberSchema = z
  .object({
    displayName: shortText(120),
    phone: phoneNumber.optional(),
    email: emailAddress.optional(),
    lga: lgaName,
    community: optionalText(120),
    memberRef: optionalText(40),
    preferredLanguage: z.enum(['en', 'yo']).default('en'),
    /** Consent recorded by the representative at registration. */
    consent: z.object({
      scopes: z.array(DelegationScopeE.schema).min(1, 'Choose at least one permission'),
      witnessName: optionalText(120),
      evidenceAttachmentId: uuid.optional(),
      note: optionalText(500),
      expiresAt: z.iso.datetime({ offset: true }).optional(),
      contactConsent: z.boolean(),
    }),
  })
  .refine((v) => v.consent.witnessName || v.consent.evidenceAttachmentId, {
    message: 'Record a witness or attach the signed consent form',
    path: ['consent', 'witnessName'],
  });
export type RegisterMemberInput = z.infer<typeof registerMemberSchema>;

export const linkExistingFarmerSchema = z.object({
  farmerEmailOrPhone: z.string().trim().min(3).max(254),
  memberRef: optionalText(40),
});

export const grantDelegationSchema = z.object({
  cooperativeId: uuid,
  scopes: z.array(DelegationScopeE.schema).min(1),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});

export const recordDelegationSchema = z
  .object({
    scopes: z.array(DelegationScopeE.schema).min(1),
    witnessName: optionalText(120),
    evidenceAttachmentId: uuid.optional(),
    note: optionalText(500),
    expiresAt: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((v) => v.witnessName || v.evidenceAttachmentId, {
    message: 'Record a witness or attach the signed consent form',
    path: ['witnessName'],
  });

export const revokeDelegationSchema = z.object({ reason: reasonText });

export const delegationSchema = z.object({
  id: uuid,
  cooperativeId: uuid,
  cooperativeName: z.string(),
  farmerProfileId: uuid,
  farmerName: z.string(),
  scopes: z.array(DelegationScopeE.schema),
  method: ConsentMethodE.schema,
  recordedBy: z.string(),
  witnessName: z.string().nullable(),
  hasEvidence: z.boolean(),
  grantedAt: z.string(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  revokeReason: z.string().nullable(),
  active: z.boolean(),
});
export type DelegationDto = z.infer<typeof delegationSchema>;

export const coopMemberSchema = z.object({
  membershipId: uuid,
  farmerProfileId: uuid,
  displayName: z.string(),
  lga: z.string().nullable(),
  community: z.string().nullable(),
  memberRef: z.string().nullable(),
  claimStatus: FarmerClaimStatusE.schema,
  joinedAt: z.string(),
  status: z.enum(['ACTIVE', 'ENDED']),
  activeDelegation: delegationSchema.nullable(),
  openRequests: z.number(),
  activeBookings: z.number(),
});
export type CoopMemberDto = z.infer<typeof coopMemberSchema>;

export const claimInviteResultSchema = z.object({
  claimCode: z.string(),
  sentVia: z.array(z.enum(['SMS', 'EMAIL'])),
  unavailable: z.array(z.string()),
  expiresAt: z.string(),
});
