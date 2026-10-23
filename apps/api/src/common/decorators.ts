import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Actor } from '@harvestslot/core';
import { DomainError } from '@harvestslot/core';
import type { AppRequest } from './http.js';

export const IS_PUBLIC = 'hs:public';
export const ALLOW_MFA_PENDING = 'hs:allowMfaPending';
export const ADMIN_ONLY = 'hs:adminOnly';
export const SKIP_CSRF = 'hs:skipCsrf';
export const IDEMPOTENT = 'hs:idempotent';
export const RATE_LIMITS = 'hs:rateLimits';

/** No session required (the actor is still attached when a valid session cookie is present). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Reachable after the password step while TOTP is still pending (MFA verify, logout, me). */
export const AllowMfaPending = () => SetMetadata(ALLOW_MFA_PENDING, true);
/** Platform administrators only; MFA-verified sessions when ADMIN_REQUIRE_MFA is on. */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);
/** Signature-verified server-to-server endpoints (webhooks) only. */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);
/** Requires an Idempotency-Key header; scoped to actor + operation and bound to the request hash. */
export const Idempotent = (operation: string) => SetMetadata(IDEMPOTENT, operation);

export interface RateLimitRule {
  name: string;
  limit: number;
  windowSec: number;
  /** Builds the bucket key from the request; return null to skip this rule. */
  key: (req: AppRequest) => string | null | undefined;
}
export const RateLimit = (...rules: RateLimitRule[]) => SetMetadata(RATE_LIMITS, rules);

export const byIp: RateLimitRule['key'] = (req) => req.ip ?? 'unknown';
export const byActor: RateLimitRule['key'] = (req) => req.actor?.userId ?? req.ip ?? 'anon';
export const byBodyField = (field: string): RateLimitRule['key'] => (req) => {
  const v = (req.body as Record<string, unknown> | undefined)?.[field];
  return typeof v === 'string' ? v.trim().toLowerCase() : null;
};

/** The authenticated actor (throws 401 if absent — use only on non-public routes). */
export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.actor) throw new DomainError('UNAUTHENTICATED', 'Sign in to continue');
  return req.actor;
});

export const OptionalActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor | undefined => {
  return ctx.switchToHttp().getRequest<AppRequest>().actor;
});

export const Req = createParamDecorator((_data: unknown, ctx: ExecutionContext): AppRequest => ctx.switchToHttp().getRequest<AppRequest>());
