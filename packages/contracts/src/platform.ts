import { z } from 'zod';
import { emailAddress, lgaName, optionalText, reasonText, shortText, uuid } from './common.js';
import {
  AttachmentPurposeE,
  DataRequestStatusE,
  DataRequestTypeE,
  DeliveryStatusE,
  DocumentReviewStatusE,
  MembershipRoleE,
  NotificationChannelE,
  OrgStatusE,
  OrgTypeE,
  OutboxStatusE,
  ScanStatusE,
  UserStatusE,
} from './enums.js';

// ───────────── Organisations & staff ─────────────

export const createOrganisationSchema = z.object({
  type: OrgTypeE.schema,
  name: shortText(160),
  lga: lgaName,
  address: optionalText(300),
  registrationNumber: optionalText(60),
  contactEmail: emailAddress.optional(),
  contactPhone: z.string().trim().max(20).optional(),
  description: optionalText(1000),
});

export const updateOrganisationSchema = createOrganisationSchema
  .omit({ type: true })
  .partial()
  .extend({ expectedVersion: z.number().int().min(1) });

export const organisationSchema = z.object({
  id: uuid,
  type: OrgTypeE.schema,
  name: z.string(),
  status: OrgStatusE.schema,
  statusReason: z.string().nullable(),
  lga: z.string(),
  state: z.string(),
  address: z.string().nullable(),
  registrationNumber: z.string().nullable(),
  registrationNumberNote: z.string(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  description: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  documents: z.array(
    z.object({ id: uuid, filename: z.string(), reviewStatus: DocumentReviewStatusE.schema, scanStatus: ScanStatusE.schema, createdAt: z.string() }),
  ),
  myRoles: z.array(MembershipRoleE.schema),
  isDemo: z.boolean(),
  version: z.number(),
});
export type OrganisationDto = z.infer<typeof organisationSchema>;

export const inviteStaffSchema = z.object({ email: emailAddress, roles: z.array(MembershipRoleE.schema).min(1) });
export const updateMemberRolesSchema = z.object({ expectedVersion: z.number().int().min(1), roles: z.array(MembershipRoleE.schema).min(1) });
export const staffSchema = z.object({
  membershipId: uuid,
  userId: uuid,
  displayName: z.string(),
  email: z.string().nullable(),
  roles: z.array(MembershipRoleE.schema),
  status: z.enum(['ACTIVE', 'REVOKED']),
  version: z.number(),
  isMe: z.boolean(),
});
export const invitationSchema = z.object({ id: uuid, email: z.string(), roles: z.array(MembershipRoleE.schema), expiresAt: z.string(), acceptedAt: z.string().nullable() });

// ───────────── Notifications ─────────────

export const notificationSchema = z.object({
  id: uuid,
  type: z.string(),
  title: z.string(),
  body: z.string(),
  link: z.string().nullable(),
  bookingId: uuid.nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
  deliveries: z.array(z.object({ channel: NotificationChannelE.schema, status: DeliveryStatusE.schema, detail: z.string() })),
});
export type NotificationDto = z.infer<typeof notificationSchema>;

// ───────────── Uploads ─────────────

export const uploadMetaSchema = z.object({
  purpose: AttachmentPurposeE.schema,
  bookingId: uuid.optional(),
  disputeId: uuid.optional(),
  harvestRequestId: uuid.optional(),
  organisationId: uuid.optional(),
  farmerProfileId: uuid.optional(),
  /** Device capture time supplied by the client (kept as evidence metadata, marked self-reported). */
  capturedAt: z.iso.datetime({ offset: true }).optional(),
});

export const attachmentSchema = z.object({
  id: uuid,
  purpose: AttachmentPurposeE.schema,
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
  scanStatus: ScanStatusE.schema,
  reviewStatus: DocumentReviewStatusE.schema,
  createdAt: z.string(),
  uploadedBy: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});
export type AttachmentDto = z.infer<typeof attachmentSchema>;
export const attachmentLinkSchema = z.object({ url: z.string(), expiresAt: z.string() });

// ───────────── Privacy ─────────────

export const dataRequestInputSchema = z.object({ type: DataRequestTypeE.schema, note: optionalText(1000) });
export const dataRequestSchema = z.object({
  id: uuid,
  type: DataRequestTypeE.schema,
  status: DataRequestStatusE.schema,
  note: z.string().nullable(),
  outcomeNote: z.string().nullable(),
  resultAttachmentId: uuid.nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

// ───────────── Admin ─────────────

export const adminReviewOrgSchema = z.object({
  expectedVersion: z.number().int().min(1),
  decision: z.enum(['APPROVE', 'REJECT', 'SUSPEND', 'REINSTATE']),
  reason: reasonText,
});
export const adminReviewDocumentSchema = z.object({ decision: z.enum(['ADMIN_APPROVED', 'ADMIN_REJECTED']), note: reasonText });
export const adminUserStatusSchema = z.object({ expectedVersion: z.number().int().min(1), status: UserStatusE.schema, reason: reasonText });
export const adminPolicyUpdateSchema = z.object({
  key: z.enum([
    'platformFeeBps',
    'platformFeeEnabled',
    'offerHoldHours',
    'bookingConfirmationHoldHours',
    'transportBufferMinutes',
    'receivingReviewHours',
    'disputeResponseHours',
    'matchingWeights',
  ]),
  value: z.unknown(),
  reason: reasonText,
});
export const adminLocationSchema = z.object({ lga: lgaName, active: z.boolean(), reason: reasonText });
export const adminDataRequestDecisionSchema = z.object({ status: z.enum(['IN_PROGRESS', 'COMPLETED', 'REJECTED']), outcomeNote: reasonText });

export const adminUserSchema = z.object({
  id: uuid,
  displayName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  status: UserStatusE.schema,
  platformRole: z.string(),
  memberships: z.array(z.object({ organisationName: z.string(), roles: z.array(z.string()) })),
  hasFarmerProfile: z.boolean(),
  mfaEnabled: z.boolean(),
  isDemo: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  version: z.number(),
});

export const outboxItemSchema = z.object({
  id: uuid,
  type: z.string(),
  aggregateType: z.string(),
  aggregateId: z.string(),
  status: OutboxStatusE.schema,
  attempts: z.number(),
  maxAttempts: z.number(),
  nextAttemptAt: z.string(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  processedAt: z.string().nullable(),
});

export const auditEventSchema = z.object({
  id: uuid,
  actor: z.string().nullable(),
  actorUserId: uuid.nullable(),
  actorParty: z.string().nullable(),
  actingForFarmer: z.string().nullable(),
  organisationId: uuid.nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  reason: z.string().nullable(),
  data: z.unknown(),
  requestId: z.string().nullable(),
  createdAt: z.string(),
});
export const auditQuerySchema = z.object({
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(60).optional(),
  actorUserId: uuid.optional(),
  action: z.string().max(80).optional(),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const exportQuerySchema = z.object({
  dataset: z.enum(['bookings', 'invoices', 'payments', 'slots', 'disputes', 'audit']),
  dataScope: z.enum(['live', 'demo']).default('live'),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

// ───────────── Analytics ─────────────

export const metricDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  definition: z.string(),
  sources: z.array(z.string()),
  exclusions: z.string(),
  unit: z.enum(['count', 'kg', 'kobo', 'hours', 'percent']),
});
export const metricValueSchema = z.object({
  key: z.string(),
  value: z.union([z.number(), z.string()]).nullable(),
  emptyReason: z.string().nullable(),
  breakdown: z.array(z.object({ label: z.string(), value: z.union([z.number(), z.string()]) })).optional(),
});
export const analyticsResponseSchema = z.object({
  scope: z.object({ kind: z.enum(['platform', 'processor', 'cooperative', 'transporter', 'farmer']), id: uuid.nullable(), name: z.string() }),
  dataScope: z.enum(['live', 'demo']),
  range: z.object({ from: z.string(), to: z.string() }),
  generatedAt: z.string(),
  definitions: z.array(metricDefinitionSchema),
  values: z.array(metricValueSchema),
  notes: z.array(z.string()),
});
export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>;
export const analyticsQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  dataScope: z.enum(['live', 'demo']).optional(),
});
