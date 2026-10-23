import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions } from 'express';
import type { Actor } from '@harvestslot/core';
import { PrismaService } from './prisma.service.js';
import { ENV, type Env } from './tokens.js';
import { issueCsrfToken, randomToken, sha256Hex } from './crypto.js';
import { CSRF_COOKIE, SESSION_COOKIE, type AppRequest, type AppResponse, type SessionContext } from './http.js';

const TOUCH_INTERVAL_MS = 60_000;

export interface LoadedSession {
  actor: Actor;
  session: SessionContext;
  userStatus: string;
}

/**
 * Server-side sessions: the browser holds an opaque random token in an HttpOnly cookie; the database
 * stores only its SHA-256 hash, with idle and absolute expiry and per-session revocation.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  cookieOptions(maxAgeMs?: number): CookieOptions {
    return { httpOnly: true, secure: this.env.COOKIE_SECURE, sameSite: 'lax', path: '/', ...(maxAgeMs ? { maxAge: maxAgeMs } : {}) };
  }

  csrfCookieOptions(): CookieOptions {
    // Readable by the page's script (double-submit), same-site only.
    return { httpOnly: false, secure: this.env.COOKIE_SECURE, sameSite: 'lax', path: '/' };
  }

  async create(req: AppRequest, res: AppResponse, userId: string, opts: { mfaPending: boolean }): Promise<string> {
    const token = randomToken(32);
    const now = Date.now();
    const absolute = new Date(now + this.env.SESSION_ABSOLUTE_TIMEOUT_DAYS * 86_400_000);
    const session = await this.prisma.db.session.create({
      data: {
        userId,
        tokenHash: sha256Hex(token),
        idleExpiresAt: new Date(now + this.env.SESSION_IDLE_TIMEOUT_MINUTES * 60_000),
        absoluteExpiresAt: absolute,
        ip: req.ip ?? null,
        userAgent: (req.headers['user-agent'] ?? '').slice(0, 300) || null,
        mfaPending: opts.mfaPending,
      },
    });
    res.cookie(SESSION_COOKIE, token, this.cookieOptions(absolute.getTime() - now));
    res.cookie(CSRF_COOKIE, issueCsrfToken(this.env.SESSION_SECRET, session.id), this.csrfCookieOptions());
    return session.id;
  }

  async load(token: string | undefined): Promise<LoadedSession | null> {
    if (!token || token.length < 20 || token.length > 100) return null;
    const session = await this.prisma.db.session.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { user: { select: { id: true, displayName: true, platformRole: true, isDemo: true, status: true } } },
    });
    const now = new Date();
    if (!session || session.revokedAt || session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) return null;
    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      const idle = new Date(now.getTime() + this.env.SESSION_IDLE_TIMEOUT_MINUTES * 60_000);
      await this.prisma.db.session.update({
        where: { id: session.id },
        data: { lastSeenAt: now, idleExpiresAt: idle < session.absoluteExpiresAt ? idle : session.absoluteExpiresAt },
      });
    }
    return {
      actor: {
        userId: session.user.id,
        displayName: session.user.displayName,
        platformRole: session.user.platformRole,
        isDemo: session.user.isDemo,
      },
      session: { id: session.id, mfaPending: session.mfaPending, mfaVerifiedAt: session.mfaVerifiedAt, absoluteExpiresAt: session.absoluteExpiresAt },
      userStatus: session.user.status,
    };
  }

  async revoke(sessionId: string, reason: string): Promise<void> {
    await this.prisma.db.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason } });
  }

  async revokeAllForUser(userId: string, reason: string, exceptSessionId?: string): Promise<number> {
    const r = await this.prisma.db.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    return r.count;
  }

  clearCookies(res: AppResponse): void {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
    res.cookie(CSRF_COOKIE, issueCsrfToken(this.env.SESSION_SECRET, 'anon'), this.csrfCookieOptions());
  }
}
