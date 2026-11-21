import { z } from 'zod';
import { emailAddress, lgaName, optionalText, phoneNumber, shortText, uuid } from './common.js';
import {
  DelegationScopeE,
  FarmerClaimStatusE,
  MembershipRoleE,
  OrgStatusE,
  OrgTypeE,
  PlatformRoleE,
} from './enums.js';

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '1234567890',
  '12345678910',
  'qwertyuiop',
  'iloveyou123',
  'harvestslot',
  'cassava123',
  'nigeria123',
]);

export const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters')
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), 'This password is too common')
  .refine((v) => new Set(v).size >= 4, 'Use a less repetitive password');

/** STAFF creates a plain account for someone invited to join an organisation (driver, officer…). */
export const accountTypeSchema = z.enum(['FARMER', 'PROCESSOR', 'TRANSPORTER', 'COOPERATIVE', 'STAFF']);
export type AccountType = z.infer<typeof accountTypeSchema>;
/** What public registration accepts. Transporter and cooperative organisations are created by an administrator. */
export const registrationAccountTypeSchema = z.enum(['FARMER', 'PROCESSOR', 'STAFF']);

export const registerSchema = z
  .object({
    /** Public registration offers selling (FARMER) or buying (PROCESSOR); STAFF is for invited staff. */
    accountType: registrationAccountTypeSchema,
    displayName: shortText(120),
    email: emailAddress.optional(),
    phone: phoneNumber.optional(),
    password,
    lga: lgaName.optional(),
    community: optionalText(120),
    organisationName: optionalText(160),
    registrationNumber: optionalText(60),
    acceptTerms: z.literal(true, { message: 'You must accept the terms to continue' }),
    acceptPrivacy: z.literal(true, { message: 'You must acknowledge the privacy notice' }),
    contactConsentSms: z.boolean().default(false),
    contactConsentEmail: z.boolean().default(true),
  })
  .refine((v) => v.email || v.phone, { message: 'Provide an email address or a phone number', path: ['email'] })
  .refine((v) => v.accountType !== 'PROCESSOR' || (v.organisationName && v.organisationName.length >= 2), {
    message: 'Enter your business name',
    path: ['organisationName'],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email or phone number').max(254),
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const mfaCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^(\d{6}|[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4})$/, 'Enter the 6-digit code or a recovery code'),
});

export const forgotPasswordSchema = z.object({ identifier: z.string().trim().min(3).max(254) });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), newPassword: password });
export const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });
export const otpSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });
export const phoneRecoveryStartSchema = z.object({ phone: phoneNumber });
export const phoneRecoveryCompleteSchema = z.object({ phone: phoneNumber, code: z.string().regex(/^\d{6}$/), newPassword: password });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: password });

export const notificationPrefsSchema = z.object({
  email: z.boolean().default(true),
  sms: z.boolean().default(false),
  /** Event categories muted for external channels (in-app is always kept). */
  mutedCategories: z.array(z.enum(['offers', 'bookings', 'transport', 'receiving', 'payments', 'disputes'])).default([]),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const updateAccountSchema = z.object({
  displayName: shortText(120).optional(),
  locale: z.enum(['en', 'yo']).optional(),
  notificationPrefs: notificationPrefsSchema.optional(),
  email: emailAddress.optional(),
  phone: phoneNumber.optional(),
});

export const demoLoginSchema = z.object({
  persona: z.enum(['farmer', 'processor-manager', 'tomato-buyer', 'receiving-officer', 'cooperative', 'admin', 'finance-officer']),
});
export type DemoPersona = z.infer<typeof demoLoginSchema>['persona'];

export const meSchema = z.object({
  user: z.object({
    id: uuid,
    displayName: z.string(),
    email: z.string().nullable(),
    emailVerified: z.boolean(),
    phone: z.string().nullable(),
    phoneVerified: z.boolean(),
    platformRole: PlatformRoleE.schema,
    locale: z.string(),
    mfaEnabled: z.boolean(),
    isDemo: z.boolean(),
    notificationPrefs: notificationPrefsSchema,
  }),
  session: z.object({ id: uuid, mfaPending: z.boolean(), mfaVerified: z.boolean(), absoluteExpiresAt: z.string() }),
  farmerProfile: z
    .object({ id: uuid, displayName: z.string(), claimStatus: FarmerClaimStatusE.schema, lga: z.string().nullable() })
    .nullable(),
  memberships: z.array(
    z.object({
      organisationId: uuid,
      organisationName: z.string(),
      organisationType: OrgTypeE.schema,
      organisationStatus: OrgStatusE.schema,
      roles: z.array(MembershipRoleE.schema),
    }),
  ),
  /** Farmers this user may act for through a cooperative delegation. */
  represented: z.array(
    z.object({
      farmerProfileId: uuid,
      displayName: z.string(),
      cooperativeId: uuid,
      cooperativeName: z.string(),
      delegationId: uuid,
      scopes: z.array(DelegationScopeE.schema),
    }),
  ),
});
export type Me = z.infer<typeof meSchema>;

export const sessionSchema = z.object({
  id: uuid,
  createdAt: z.string(),
  lastSeenAt: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof sessionSchema>;

export const loginResultSchema = z.object({ mfaRequired: z.boolean() });

export const mfaSetupResultSchema = z.object({ secret: z.string(), otpauthUrl: z.string() });
export const mfaEnableResultSchema = z.object({ recoveryCodes: z.array(z.string()) });

export const claimStartSchema = z.object({ claimCode: z.string().trim().min(6).max(64) });
export const claimCompleteSchema = z.object({
  claimCode: z.string().trim().min(6).max(64),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  email: emailAddress.optional(),
  password,
  acceptTerms: z.literal(true),
  acceptPrivacy: z.literal(true),
});

export const integrationStatusSchema = z.object({
  environment: z.string(),
  capabilities: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      status: z.enum(['configured', 'simulated', 'unconfigured', 'disabled']),
      detail: z.string(),
    }),
  ),
});
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

export const publicConfigSchema = z.object({
  demoMode: z.boolean(),
  devTools: z.boolean(),
  smsAvailable: z.boolean(),
  paymentProvider: z.enum(['none', 'paystack', 'simulated']),
  voiceDrafts: z.boolean(),
  mapStyleUrl: z.string().nullable(),
  mapAttribution: z.string().nullable(),
  routing: z.enum(['none', 'osrm']),
  roadDistanceFactor: z.number(),
  supportedLgas: z.array(z.string()),
});
export type PublicConfig = z.infer<typeof publicConfigSchema>;
