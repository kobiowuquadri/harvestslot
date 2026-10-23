import { z } from 'zod';

/**
 * Stable API error codes. Clients branch on `error.code`, never on message text.
 * HTTP status is listed for documentation; the API maps each code to exactly this status.
 */
export const ERROR_CODES = {
  VALIDATION_FAILED: 422,
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  MFA_REQUIRED: 401,
  FORBIDDEN: 403,
  CSRF_FAILED: 403,
  ACCOUNT_SUSPENDED: 403,
  ORG_NOT_APPROVED: 403,
  DELEGATION_SCOPE_MISSING: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  INVALID_STATE_TRANSITION: 409,
  CAPACITY_EXCEEDED: 409,
  SUPPLY_EXCEEDED: 409,
  HOLD_EXPIRED: 409,
  OFFER_EXPIRED: 409,
  TERMS_CHANGED: 409,
  SLOT_OVERLAP: 409,
  CAPACITY_BELOW_COMMITTED: 409,
  VEHICLE_CONFLICT: 409,
  DRIVER_CONFLICT: 409,
  NOT_READY: 409,
  OVERPAYMENT: 409,
  INVOICE_DISPUTED: 409,
  OVER_TOLERANCE: 409,
  DUPLICATE: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  IDEMPOTENCY_KEY_REUSED: 422,
  VEHICLE_CAPACITY_EXCEEDED: 422,
  QUANTITY_MISMATCH: 422,
  HANDOVER_CODE_INVALID: 422,
  TOKEN_INVALID: 400,
  UPLOAD_REJECTED: 422,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  ACCOUNT_LOCKED: 429,
  HANDOVER_CODE_LOCKED: 429,
  INTEGRATION_NOT_CONFIGURED: 503,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_ERROR: 502,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export const errorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;

/** Field-level validation details returned with VALIDATION_FAILED. */
export interface FieldIssue {
  path: string;
  message: string;
}
