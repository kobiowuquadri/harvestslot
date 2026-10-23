import { Inject, Injectable, Logger } from '@nestjs/common';
import { DomainError } from '@harvestslot/core';
import type { Db } from '@harvestslot/db';
import { hmacHex, numericCode, randomToken, safeEqual, sha256Hex } from '../../common/crypto.js';
import { PrismaService } from '../../common/prisma.service.js';
import { ENV, MESSAGING, type Env, type Messaging } from '../../common/tokens.js';

type OtpPurpose = 'PHONE_VERIFY' | 'PHONE_RECOVERY' | 'ACCOUNT_CLAIM';

const OTP_TTL_MS = 10 * 60_000;
const RESEND_INTERVAL_MS = 60_000;
const MAX_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

/**
 * One-time codes and link tokens. Only hashes are stored. OTPs expire after 10 minutes, allow 5
 * attempts, and cannot be re-sent more than once a minute or 5 times an hour per destination.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger('Otp');
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(MESSAGING) private readonly messaging: Messaging,
  ) {}

  get smsAvailable(): boolean {
    return this.messaging.sms !== null;
  }

  private otpHash(purpose: string, target: string, code: string, nonce: string): string {
    return hmacHex(this.env.SESSION_SECRET, `otp:${purpose}:${target}:${code}:${nonce}`);
  }

  /** Creates and sends an SMS code. Throws if SMS is unavailable or the destination is throttled. */
  async sendSmsCode(purpose: OtpPurpose, phone: string, userId: string | null, extra: { farmerProfileId?: string } = {}): Promise<void> {
    if (!this.messaging.sms) throw new DomainError('INTEGRATION_NOT_CONFIGURED', 'SMS is not configured, so phone codes are unavailable');
    const now = Date.now();
    const recent = await this.prisma.db.verificationToken.findMany({
      where: { target: phone, purpose, createdAt: { gt: new Date(now - 3_600_000) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (recent[0] && now - recent[0].createdAt.getTime() < RESEND_INTERVAL_MS) {
      throw new DomainError('RATE_LIMITED', 'Wait a minute before requesting another code', { retryAfterSeconds: 60 });
    }
    if (recent.length >= MAX_PER_HOUR) throw new DomainError('RATE_LIMITED', 'Too many codes requested. Try again later.', { retryAfterSeconds: 3600 });
    const code = numericCode(6);
    const nonce = randomToken(12);
    await this.prisma.db.$transaction([
      this.prisma.db.verificationToken.updateMany({ where: { target: phone, purpose, consumedAt: null }, data: { consumedAt: new Date() } }),
      this.prisma.db.verificationToken.create({
        data: {
          userId,
          farmerProfileId: extra.farmerProfileId ?? null,
          purpose,
          target: phone,
          tokenHash: this.otpHash(purpose, phone, code, nonce),
          expiresAt: new Date(now + OTP_TTL_MS),
          maxAttempts: MAX_ATTEMPTS,
          metadata: { nonce },
        },
      }),
    ]);
    const label = purpose === 'PHONE_VERIFY' ? 'verify your phone' : purpose === 'ACCOUNT_CLAIM' ? 'claim your account' : 'reset your password';
    try {
      await this.messaging.sms.send(phone, `Your HarvestSlot code to ${label} is ${code}. It expires in 10 minutes. Never share it.`);
    } catch (error) {
      this.logger.warn(`SMS send failed: ${String(error)}`);
      throw new DomainError('PROVIDER_UNAVAILABLE', 'The code could not be sent. Try again shortly.');
    }
  }

  /** Verifies the latest code for a destination; counts attempts; consumes on success. */
  async verifySmsCode(purpose: OtpPurpose, phone: string, code: string, db: Db = this.prisma.db) {
    const token = await db.verificationToken.findFirst({
      where: { target: phone, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!token || token.expiresAt <= new Date()) throw new DomainError('TOKEN_INVALID', 'The code has expired. Request a new one.');
    if (token.attempts >= token.maxAttempts) throw new DomainError('RATE_LIMITED', 'Too many wrong codes. Request a new one.', { retryAfterSeconds: 60 });
    const nonce = (token.metadata as { nonce?: string } | null)?.nonce ?? '';
    if (!safeEqual(token.tokenHash, this.otpHash(purpose, phone, code, nonce))) {
      await db.verificationToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
      throw new DomainError('TOKEN_INVALID', 'That code is not correct');
    }
    const consumed = await db.verificationToken.updateMany({ where: { id: token.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (consumed.count !== 1) throw new DomainError('TOKEN_INVALID', 'That code was already used');
    return token;
  }

  /** Single-use link token (email verification, password reset, invites). Returns the raw token to embed in a link. */
  async createLinkToken(
    db: Db,
    purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET' | 'STAFF_INVITE' | 'ACCOUNT_CLAIM',
    target: string,
    ttlMs: number,
    refs: { userId?: string | null; farmerProfileId?: string | null; organisationId?: string | null; raw?: string } = {},
  ): Promise<string> {
    const raw = refs.raw ?? randomToken(32);
    await db.verificationToken.updateMany({
      where: {
        target,
        purpose,
        consumedAt: null,
        ...(refs.farmerProfileId ? { farmerProfileId: refs.farmerProfileId } : {}),
        ...(refs.organisationId ? { organisationId: refs.organisationId } : {}),
      },
      data: { consumedAt: new Date() },
    });
    await db.verificationToken.create({
      data: {
        userId: refs.userId ?? null,
        farmerProfileId: refs.farmerProfileId ?? null,
        organisationId: refs.organisationId ?? null,
        purpose,
        target,
        tokenHash: sha256Hex(`${purpose}:${raw}`),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return raw;
  }

  async findLinkToken(db: Db, purpose: string, raw: string) {
    const token = await db.verificationToken.findUnique({ where: { tokenHash: sha256Hex(`${purpose}:${raw}`) } });
    if (!token || token.purpose !== purpose || token.consumedAt || token.expiresAt <= new Date()) {
      throw new DomainError('TOKEN_INVALID', 'This link is invalid or has expired. Request a new one.');
    }
    return token;
  }

  async consumeLinkToken(db: Db, id: string): Promise<void> {
    const r = await db.verificationToken.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (r.count !== 1) throw new DomainError('TOKEN_INVALID', 'This link was already used');
  }

  /** Sends an email after commit; failures are logged (the user can request again). */
  async sendEmail(to: string, subject: string, text: string): Promise<void> {
    try {
      await this.messaging.mail.send({ to, subject, text });
    } catch (error) {
      this.logger.warn(`Email to ${to.replace(/(.{2}).*@/, '$1***@')} failed: ${String(error)}`);
    }
  }
}
