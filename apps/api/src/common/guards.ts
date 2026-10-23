import { CanActivate, ExecutionContext, Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import type { NextFunction } from 'express';
import { allowedOrigins } from '@harvestslot/config';
import { DomainError } from '@harvestslot/core';
import { verifyCsrfToken } from './crypto.js';
import { ADMIN_ONLY, ALLOW_MFA_PENDING, IS_PUBLIC, RATE_LIMITS, SKIP_CSRF, type RateLimitRule } from './decorators.js';
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE, type AppRequest, type AppResponse } from './http.js';
import { RateLimitService } from './rate-limit.service.js';
import { SessionService } from './sessions.service.js';
import { ENV, type Env } from './tokens.js';

/** Assigns a request id (honouring a well-formed inbound X-Request-Id) and echoes it back. */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: AppRequest, res: AppResponse, next: NextFunction): void {
    const inbound = req.headers['x-request-id'];
    req.requestId = typeof inbound === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(inbound) ? inbound : randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  }
}

/** Resolves the session cookie into an actor on every request; enforces login, MFA and admin rules. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const loaded = await this.sessions.load(req.cookies?.[SESSION_COOKIE]);
    if (loaded) {
      if (loaded.userStatus !== 'ACTIVE') {
        await this.sessions.revoke(loaded.session.id, `user ${loaded.userStatus.toLowerCase()}`);
        if (!isPublic) throw new DomainError('ACCOUNT_SUSPENDED', 'This account is not active. Contact HarvestSlot support.');
      } else {
        req.actor = { ...loaded.actor, requestId: req.requestId, ip: req.ip };
        req.sessionCtx = loaded.session;
      }
    }
    if (isPublic) return true;
    if (!req.actor || !req.sessionCtx) throw new DomainError('UNAUTHENTICATED', 'Sign in to continue');
    if (req.sessionCtx.mfaPending && !this.reflector.getAllAndOverride<boolean>(ALLOW_MFA_PENDING, targets)) {
      throw new DomainError('MFA_REQUIRED', 'Enter your authenticator code to finish signing in');
    }
    if (this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, targets)) {
      if (req.actor.platformRole !== 'ADMIN') throw new DomainError('NOT_FOUND', 'Not found');
      if (this.env.ADMIN_REQUIRE_MFA && !req.sessionCtx.mfaVerifiedAt) {
        throw new DomainError('MFA_REQUIRED', 'Administrator actions require two-factor authentication. Set it up in Security settings.');
      }
    }
    return true;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for every state-changing request: the X-CSRF-Token header must equal the
 * hs_csrf cookie, the token's HMAC must bind it to the current session, and Origin (or Referer)
 * must be an allowed origin. Webhooks verified by signature are exempt.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly origins: Set<string>;
  constructor(
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.origins = new Set(allowedOrigins(env));
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AppRequest>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [context.getHandler(), context.getClass()])) return true;
    const origin = req.headers.origin ?? (req.headers.referer ? safeOrigin(req.headers.referer) : undefined);
    if (origin && !this.origins.has(origin)) throw new DomainError('CSRF_FAILED', 'Request origin not allowed');
    const header = req.headers[CSRF_HEADER];
    const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
    const token = typeof header === 'string' ? header : undefined;
    const sessionKey = req.sessionCtx?.id ?? 'anon';
    if (!token || !cookie || token !== cookie || !verifyCsrfToken(this.env.SESSION_SECRET, sessionKey, token)) {
      throw new DomainError('CSRF_FAILED', 'Security check failed. Reload the page and try again.');
    }
    return true;
  }
}

function safeOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** Applies @RateLimit rules plus a coarse per-IP ceiling on all mutations. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const rules = this.reflector.getAllAndOverride<RateLimitRule[] | undefined>(RATE_LIMITS, [context.getHandler(), context.getClass()]) ?? [];
    const all: RateLimitRule[] = SAFE_METHODS.has(req.method)
      ? [{ name: 'read-ip', limit: 1200, windowSec: 60, key: (r) => r.ip ?? 'unknown' }, ...rules]
      : [{ name: 'write-ip', limit: 240, windowSec: 60, key: (r) => r.ip ?? 'unknown' }, ...rules];
    for (const rule of all) {
      const key = rule.key(req);
      if (!key) continue;
      const result = await this.limiter.consume(`${rule.name}:${key}`, rule.limit, rule.windowSec);
      if (!result.allowed) {
        throw new DomainError('RATE_LIMITED', `Too many attempts. Try again in ${Math.ceil(result.retryAfterSeconds / 60)} minute(s).`, {
          retryAfterSeconds: result.retryAfterSeconds,
        });
      }
    }
    return true;
  }
}
