import { Inject, Injectable } from '@nestjs/common';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { z } from 'zod';
import { demoFeaturesAllowed, devToolsAllowed } from '@harvestslot/config';
import {
  changePasswordSchema,
  claimCompleteSchema,
  notificationPrefsSchema,
  phoneNumber,
  registerSchema,
  updateAccountSchema,
  type DemoPersona,
  type Me,
  type SessionInfo,
} from '@harvestslot/contracts';
import { audit, DomainError, withTransaction, type Actor } from '@harvestslot/core';
import type { Prisma } from '@harvestslot/db';
import { decryptSecret, encryptSecret, newTotpSecret, recoveryCodes, sha256Hex, verifyTotp } from '../../common/crypto.js';
import type { AppRequest, AppResponse } from '../../common/http.js';
import { PrismaService } from '../../common/prisma.service.js';
import { SessionService } from '../../common/sessions.service.js';
import { ENV, type Env } from '../../common/tokens.js';
import { OtpService } from './otp.service.js';

const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const LOCK_AFTER = 5;
const DUMMY_HASH_PROMISE = argonHash('not-a-real-password-x9', ARGON);
const TERMS_VERSION = '2026-10-draft';

export const DEMO_PERSONAS: Record<DemoPersona, string> = {
  farmer: 'farmer.adunni@demo.harvestslot.example',
  'processor-manager': 'manager@ibadan-starch.demo.harvestslot.example',
  'tomato-buyer': 'manager@egbeda-tomato.demo.harvestslot.example',
  'receiving-officer': 'receiving@ibadan-starch.demo.harvestslot.example',
  'finance-officer': 'finance@ibadan-starch.demo.harvestslot.example',
  cooperative: 'rep@akinyele-coop.demo.harvestslot.example',
  admin: 'admin@demo.harvestslot.example',
};

function normaliseIdentifier(identifier: string): { email?: string; phone?: string } {
  const v = identifier.trim();
  if (v.includes('@')) return { email: v.toLowerCase() };
  const parsed = phoneNumber.safeParse(v);
  return parsed.success ? { phone: parsed.data } : { email: v.toLowerCase() };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly otp: OtpService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  hashPassword(password: string): Promise<string> {
    return argonHash(password, ARGON);
  }

  // ───────────── Registration ─────────────

  async register(req: AppRequest, res: AppResponse, input: z.infer<typeof registerSchema>): Promise<Me> {
    if (input.phone && !input.email && !this.otp.smsAvailable) {
      throw new DomainError('INTEGRATION_NOT_CONFIGURED', 'Phone-only sign-up needs SMS verification, which is not configured. Use an email address.');
    }
    const clash = await this.prisma.db.user.findFirst({
      where: { OR: [...(input.email ? [{ email: input.email }] : []), ...(input.phone ? [{ phone: input.phone }] : [])] },
      select: { id: true },
    });
    if (clash) throw new DomainError('DUPLICATE', 'An account already uses this email or phone number. Sign in or reset your password.');
    const passwordHash = await this.hashPassword(input.password);
    const emailToken = { raw: '' };

    const userId = await withTransaction(this.prisma.db, async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email ?? null,
          phone: input.phone ?? null,
          passwordHash,
          displayName: input.displayName,
          notificationPrefs: notificationPrefsSchema.parse({ email: input.contactConsentEmail, sms: input.contactConsentSms }),
        },
      });
      const consents: Prisma.ConsentRecordCreateManyInput[] = [
        { userId: user.id, type: 'TERMS', documentVersion: TERMS_VERSION, granted: true, method: 'FARMER_IN_APP' },
        { userId: user.id, type: 'PRIVACY', documentVersion: TERMS_VERSION, granted: true, method: 'FARMER_IN_APP' },
        { userId: user.id, type: 'CONTACT_EMAIL', documentVersion: TERMS_VERSION, granted: input.contactConsentEmail, method: 'FARMER_IN_APP' },
        { userId: user.id, type: 'CONTACT_SMS', documentVersion: TERMS_VERSION, granted: input.contactConsentSms, method: 'FARMER_IN_APP' },
      ];
      await tx.consentRecord.createMany({ data: consents });
      if (input.accountType === 'FARMER') {
        await tx.farmerProfile.create({
          data: {
            userId: user.id,
            displayName: input.displayName,
            phone: input.phone ?? null,
            email: input.email ?? null,
            // Farm details are asked for when the farmer adds a harvest.
            lga: input.lga ?? null,
            community: input.community ?? null,
            claimStatus: 'SELF_REGISTERED',
            contactConsentAt: input.contactConsentEmail || input.contactConsentSms ? new Date() : null,
            createdByUserId: user.id,
          },
        });
      } else if (input.accountType === 'PROCESSOR') {
        // Facility details are asked for when the buyer publishes their first buying slot.
        const org = await tx.organisation.create({
          data: {
            type: 'PROCESSOR',
            name: input.organisationName!,
            lga: input.lga ?? null,
            registrationNumber: input.registrationNumber ?? null,
            contactEmail: input.email ?? null,
            contactPhone: input.phone ?? null,
          },
        });
        await tx.membership.create({ data: { userId: user.id, organisationId: org.id, roles: ['OWNER'] } });
        await audit(tx, { action: 'organisation.registered', entityType: 'organisation', entityId: org.id, organisationId: org.id, data: { type: org.type } });
      }
      if (input.email) emailToken.raw = await this.otp.createLinkToken(tx, 'EMAIL_VERIFY', input.email, 48 * 3_600_000, { userId: user.id });
      await audit(tx, { action: 'user.registered', entityType: 'user', entityId: user.id, data: { accountType: input.accountType } });
      return user.id;
    });

    if (input.email) {
      await this.otp.sendEmail(
        input.email,
        'Confirm your HarvestSlot email',
        `Welcome to HarvestSlot.\n\nConfirm your email address: ${this.env.PUBLIC_BASE_URL}/verify-email?token=${emailToken.raw}\n\nThis link expires in 48 hours. If you did not create an account, ignore this message.`,
      );
    }
    if (input.phone && this.otp.smsAvailable) {
      await this.otp.sendSmsCode('PHONE_VERIFY', input.phone, userId).catch(() => undefined);
    }
    await this.sessions.create(req, res, userId, { mfaPending: false });
    return this.me(userId, (await this.latestSessionId(userId))!);
  }

  private async latestSessionId(userId: string): Promise<string | undefined> {
    const s = await this.prisma.db.session.findFirst({ where: { userId, revokedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    return s?.id;
  }

  // ───────────── Login / MFA / logout ─────────────

  async login(req: AppRequest, res: AppResponse, identifier: string, password: string): Promise<{ mfaRequired: boolean }> {
    const where = normaliseIdentifier(identifier);
    const user = await this.prisma.db.user.findFirst({ where });
    const now = new Date();
    if (!user || !user.passwordHash) {
      await argonVerify(await DUMMY_HASH_PROMISE, password).catch(() => false);
      throw new DomainError('INVALID_CREDENTIALS', 'Email/phone or password is incorrect');
    }
    if (user.lockedUntil && user.lockedUntil > now) {
      throw new DomainError('RATE_LIMITED', 'Too many attempts. Try again later or reset your password.', {
        retryAfterSeconds: Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000),
      });
    }
    const ok = await argonVerify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      const lockMinutes = failed >= LOCK_AFTER ? Math.min(15 * 2 ** (failed - LOCK_AFTER), 24 * 60) : 0;
      await this.prisma.db.user.update({
        where: { id: user.id },
        data: { failedLoginCount: failed, lockedUntil: lockMinutes ? new Date(now.getTime() + lockMinutes * 60_000) : null },
      });
      throw new DomainError('INVALID_CREDENTIALS', 'Email/phone or password is incorrect');
    }
    if (user.status !== 'ACTIVE') throw new DomainError('ACCOUNT_SUSPENDED', 'This account is not active. Contact HarvestSlot support.');
    await this.prisma.db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now } });
    const mfaRequired = Boolean(user.mfaEnabledAt);
    await this.sessions.create(req, res, user.id, { mfaPending: mfaRequired });
    await audit(this.prisma.db, { actor: { userId: user.id, displayName: user.displayName, platformRole: user.platformRole, isDemo: user.isDemo, requestId: req.requestId, ip: req.ip }, action: 'auth.login', entityType: 'user', entityId: user.id, data: { mfaRequired } });
    return { mfaRequired };
  }

  async verifyMfa(actor: Actor, sessionId: string, code: string): Promise<void> {
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (!user.mfaEnabledAt || !user.mfaSecretEnc) throw new DomainError('BAD_REQUEST', 'Two-factor authentication is not enabled');
    const trimmed = code.trim();
    let ok = false;
    if (/^\d{6}$/.test(trimmed)) {
      ok = verifyTotp(decryptSecret(this.env.DATA_ENCRYPTION_KEY, user.mfaSecretEnc), trimmed);
    } else {
      const h = sha256Hex(trimmed.toLowerCase());
      if (user.mfaRecoveryCodeHashes.includes(h)) {
        ok = true;
        await this.prisma.db.user.update({ where: { id: user.id }, data: { mfaRecoveryCodeHashes: user.mfaRecoveryCodeHashes.filter((x) => x !== h) } });
        await audit(this.prisma.db, { actor, action: 'auth.mfa-recovery-code-used', entityType: 'user', entityId: user.id });
      }
    }
    if (!ok) throw new DomainError('INVALID_CREDENTIALS', 'That code is not correct');
    await this.prisma.db.session.update({ where: { id: sessionId }, data: { mfaPending: false, mfaVerifiedAt: new Date() } });
  }

  async logout(res: AppResponse, sessionId: string | undefined): Promise<void> {
    if (sessionId) await this.sessions.revoke(sessionId, 'logout');
    this.sessions.clearCookies(res);
  }

  async demoLogin(req: AppRequest, res: AppResponse, persona: DemoPersona): Promise<void> {
    if (!demoFeaturesAllowed(this.env)) throw new DomainError('NOT_FOUND', 'Not found');
    const user = await this.prisma.db.user.findUnique({ where: { email: DEMO_PERSONAS[persona] } });
    if (!user || !user.isDemo || user.status !== 'ACTIVE') {
      throw new DomainError('NOT_FOUND', 'Demo account not found. Run `pnpm db:seed` to create the demonstration data.');
    }
    await this.sessions.create(req, res, user.id, { mfaPending: false });
    await audit(this.prisma.db, { actor: { userId: user.id, displayName: user.displayName, platformRole: user.platformRole, isDemo: true, requestId: req.requestId, ip: req.ip }, action: 'auth.demo-login', entityType: 'user', entityId: user.id, data: { persona } });
  }

  // ───────────── Verification and recovery ─────────────

  async verifyEmail(token: string): Promise<void> {
    await withTransaction(this.prisma.db, async (tx) => {
      const t = await this.otp.findLinkToken(tx, 'EMAIL_VERIFY', token);
      await this.otp.consumeLinkToken(tx, t.id);
      if (!t.userId) throw new DomainError('TOKEN_INVALID', 'This link is invalid');
      const user = await tx.user.findUniqueOrThrow({ where: { id: t.userId } });
      if (user.email !== t.target) throw new DomainError('TOKEN_INVALID', 'This link is for a different email address');
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      await audit(tx, { action: 'auth.email-verified', entityType: 'user', entityId: user.id });
    });
  }

  async resendEmailVerification(actor: Actor): Promise<void> {
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (!user.email || user.emailVerifiedAt) return;
    const raw = await this.otp.createLinkToken(this.prisma.db, 'EMAIL_VERIFY', user.email, 48 * 3_600_000, { userId: user.id });
    await this.otp.sendEmail(user.email, 'Confirm your HarvestSlot email', `Confirm your email address: ${this.env.PUBLIC_BASE_URL}/verify-email?token=${raw}\n\nThis link expires in 48 hours.`);
  }

  /** Always answers the same way, whether or not an account exists. */
  async forgotPassword(identifier: string): Promise<void> {
    const where = normaliseIdentifier(identifier);
    const user = await this.prisma.db.user.findFirst({ where });
    if (!user || user.status !== 'ACTIVE') return;
    if (where.email && user.email) {
      const raw = await this.otp.createLinkToken(this.prisma.db, 'PASSWORD_RESET', user.email, 30 * 60_000, { userId: user.id });
      await this.otp.sendEmail(
        user.email,
        'Reset your HarvestSlot password',
        `Someone asked to reset the password for this HarvestSlot account.\n\nReset it here: ${this.env.PUBLIC_BASE_URL}/reset-password?token=${raw}\n\nThis link expires in 30 minutes and works once. If it was not you, ignore this message — your password is unchanged.`,
      );
    } else if (where.phone && user.phone && user.phoneVerifiedAt && this.otp.smsAvailable) {
      await this.otp.sendSmsCode('PHONE_RECOVERY', user.phone, user.id).catch(() => undefined);
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const hash = await this.hashPassword(newPassword);
    await withTransaction(this.prisma.db, async (tx) => {
      const t = await this.otp.findLinkToken(tx, 'PASSWORD_RESET', token);
      await this.otp.consumeLinkToken(tx, t.id);
      await tx.user.update({ where: { id: t.userId! }, data: { passwordHash: hash, failedLoginCount: 0, lockedUntil: null } });
      await tx.session.updateMany({ where: { userId: t.userId!, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'password reset' } });
      await audit(tx, { action: 'auth.password-reset', entityType: 'user', entityId: t.userId! });
    });
  }

  async phoneRecoveryComplete(phone: string, code: string, newPassword: string): Promise<void> {
    const hash = await this.hashPassword(newPassword);
    await withTransaction(this.prisma.db, async (tx) => {
      const token = await this.otp.verifySmsCode('PHONE_RECOVERY', phone, code, tx);
      const user = await tx.user.findFirst({ where: { phone } });
      if (!user || user.id !== token.userId) throw new DomainError('TOKEN_INVALID', 'That code is not correct');
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: hash, failedLoginCount: 0, lockedUntil: null } });
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: 'password reset by phone' } });
      await audit(tx, { action: 'auth.password-reset-phone', entityType: 'user', entityId: user.id });
    });
  }

  async sendPhoneVerification(actor: Actor): Promise<void> {
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (!user.phone) throw new DomainError('BAD_REQUEST', 'Add a phone number in your account settings first');
    if (user.phoneVerifiedAt) return;
    await this.otp.sendSmsCode('PHONE_VERIFY', user.phone, user.id);
  }

  async verifyPhone(actor: Actor, code: string): Promise<void> {
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (!user.phone) throw new DomainError('BAD_REQUEST', 'No phone number on this account');
    await withTransaction(this.prisma.db, async (tx) => {
      await this.otp.verifySmsCode('PHONE_VERIFY', user.phone!, code, tx);
      await tx.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } });
      await audit(tx, { actor, action: 'auth.phone-verified', entityType: 'user', entityId: user.id });
    });
  }

  // ───────────── Account settings & sessions ─────────────

  async changePassword(actor: Actor, sessionId: string, input: z.infer<typeof changePasswordSchema>): Promise<void> {
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (!user.passwordHash || !(await argonVerify(user.passwordHash, input.currentPassword).catch(() => false))) {
      throw new DomainError('INVALID_CREDENTIALS', 'Current password is incorrect');
    }
    const hash = await this.hashPassword(input.newPassword);
    await this.prisma.db.user.update({ where: { id: user.id }, data: { passwordHash: hash, version: { increment: 1 } } });
    await this.sessions.revokeAllForUser(user.id, 'password changed', sessionId);
    await audit(this.prisma.db, { actor, action: 'auth.password-changed', entityType: 'user', entityId: user.id });
  }

  async updateAccount(actor: Actor, input: z.infer<typeof updateAccountSchema>): Promise<void> {
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: actor.userId } });
    const data: Prisma.UserUpdateInput = { version: { increment: 1 } };
    if (input.displayName) data.displayName = input.displayName;
    if (input.locale) data.locale = input.locale;
    if (input.notificationPrefs) data.notificationPrefs = input.notificationPrefs;
    let verifyEmail = false;
    if (input.email && input.email !== user.email) {
      const taken = await this.prisma.db.user.findUnique({ where: { email: input.email } });
      if (taken) throw new DomainError('DUPLICATE', 'That email address is already used by another account');
      data.email = input.email;
      data.emailVerifiedAt = null;
      verifyEmail = true;
    }
    if (input.phone && input.phone !== user.phone) {
      const taken = await this.prisma.db.user.findUnique({ where: { phone: input.phone } });
      if (taken) throw new DomainError('DUPLICATE', 'That phone number is already used by another account');
      data.phone = input.phone;
      data.phoneVerifiedAt = null;
    }
    await withTransaction(this.prisma.db, async (tx) => {
      await tx.user.update({ where: { id: user.id }, data });
      if (input.notificationPrefs) {
        // Preference changes are also contact-consent records.
        await tx.consentRecord.createMany({
          data: [
            { userId: user.id, type: 'CONTACT_EMAIL', documentVersion: TERMS_VERSION, granted: input.notificationPrefs.email, method: 'FARMER_IN_APP' },
            { userId: user.id, type: 'CONTACT_SMS', documentVersion: TERMS_VERSION, granted: input.notificationPrefs.sms, method: 'FARMER_IN_APP' },
          ],
        });
      }
      await audit(tx, { actor, action: 'account.updated', entityType: 'user', entityId: user.id, data: { fields: Object.keys(input) } });
    });
    if (verifyEmail) await this.resendEmailVerification(actor);
  }

  async listSessions(actor: Actor, currentSessionId: string): Promise<SessionInfo[]> {
    const rows = await this.prisma.db.session.findMany({
      where: { userId: actor.userId, revokedAt: null, absoluteExpiresAt: { gt: new Date() }, idleExpiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      ip: s.ip,
      userAgent: s.userAgent,
      current: s.id === currentSessionId,
    }));
  }

  async revokeSession(actor: Actor, sessionId: string): Promise<void> {
    const s = await this.prisma.db.session.findUnique({ where: { id: sessionId } });
    if (!s || s.userId !== actor.userId) throw new DomainError('NOT_FOUND', 'Session not found');
    await this.sessions.revoke(sessionId, 'revoked by user');
    await audit(this.prisma.db, { actor, action: 'auth.session-revoked', entityType: 'session', entityId: sessionId });
  }

  // ───────────── MFA management ─────────────

  async mfaSetup(actor: Actor): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (user.mfaEnabledAt) throw new DomainError('BAD_REQUEST', 'Two-factor authentication is already on. Disable it first to re-enrol.');
    const secret = newTotpSecret();
    await this.prisma.db.user.update({ where: { id: user.id }, data: { mfaSecretEnc: encryptSecret(this.env.DATA_ENCRYPTION_KEY, secret) } });
    const label = encodeURIComponent(`HarvestSlot:${user.email ?? user.phone ?? user.displayName}`);
    return { secret, otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=HarvestSlot&algorithm=SHA1&digits=6&period=30` };
  }

  async mfaEnable(actor: Actor, sessionId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (!user.mfaSecretEnc || user.mfaEnabledAt) throw new DomainError('BAD_REQUEST', 'Start set-up first');
    if (!verifyTotp(decryptSecret(this.env.DATA_ENCRYPTION_KEY, user.mfaSecretEnc), code)) throw new DomainError('INVALID_CREDENTIALS', 'That code is not correct');
    const codes = recoveryCodes();
    await this.prisma.db.user.update({ where: { id: user.id }, data: { mfaEnabledAt: new Date(), mfaRecoveryCodeHashes: codes.map((c) => sha256Hex(c)) } });
    await this.prisma.db.session.update({ where: { id: sessionId }, data: { mfaVerifiedAt: new Date() } });
    await audit(this.prisma.db, { actor, action: 'auth.mfa-enabled', entityType: 'user', entityId: user.id });
    return { recoveryCodes: codes };
  }

  async mfaDisable(actor: Actor, code: string): Promise<void> {
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (!user.mfaEnabledAt || !user.mfaSecretEnc) return;
    if (!verifyTotp(decryptSecret(this.env.DATA_ENCRYPTION_KEY, user.mfaSecretEnc), code)) throw new DomainError('INVALID_CREDENTIALS', 'That code is not correct');
    await this.prisma.db.user.update({ where: { id: user.id }, data: { mfaEnabledAt: null, mfaSecretEnc: null, mfaRecoveryCodeHashes: [] } });
    await audit(this.prisma.db, { actor, action: 'auth.mfa-disabled', entityType: 'user', entityId: user.id });
  }

  // ───────────── Staff invitations & account claims ─────────────

  async acceptInvitation(actor: Actor, token: string): Promise<void> {
    await withTransaction(this.prisma.db, async (tx) => {
      const t = await this.otp.findLinkToken(tx, 'STAFF_INVITE', token);
      const user = await tx.user.findUniqueOrThrow({ where: { id: actor.userId } });
      if (!user.email || user.email !== t.target) throw new DomainError('FORBIDDEN', 'This invitation was sent to a different email address');
      const invite = await tx.staffInvitation.findUnique({ where: { tokenHash: t.tokenHash } });
      if (!invite || invite.revokedAt || invite.acceptedAt) throw new DomainError('TOKEN_INVALID', 'This invitation is no longer valid');
      await this.otp.consumeLinkToken(tx, t.id);
      await tx.membership.upsert({
        where: { userId_organisationId: { userId: user.id, organisationId: invite.organisationId } },
        create: { userId: user.id, organisationId: invite.organisationId, roles: invite.roles, invitedByUserId: invite.invitedByUserId },
        update: { roles: invite.roles, status: 'ACTIVE', revokedAt: null, version: { increment: 1 } },
      });
      if (invite.roles.includes('DRIVER')) {
        await tx.driver.upsert({
          where: { organisationId_userId: { organisationId: invite.organisationId, userId: user.id } },
          create: { organisationId: invite.organisationId, userId: user.id, displayName: user.displayName, phone: user.phone },
          update: { status: 'ACTIVE' },
        });
      }
      await tx.staffInvitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date(), acceptedByUserId: user.id } });
      await audit(tx, { actor, action: 'membership.invitation-accepted', entityType: 'organisation', entityId: invite.organisationId, organisationId: invite.organisationId, data: { roles: invite.roles } });
    });
  }

  /** Step 1 of a represented farmer claiming their profile: validate the code and send an OTP to the contact on file. */
  async claimStart(claimCodeRaw: string): Promise<{ sentTo: string }> {
    const t = await this.otp.findLinkToken(this.prisma.db, 'ACCOUNT_CLAIM', claimCodeRaw.toUpperCase());
    const profile = await this.prisma.db.farmerProfile.findUniqueOrThrow({ where: { id: t.farmerProfileId! } });
    if (profile.userId) throw new DomainError('TOKEN_INVALID', 'This profile has already been claimed');
    if (!profile.phone) throw new DomainError('BAD_REQUEST', 'No phone number is on file for this profile. Ask your cooperative to add one.');
    await this.otp.sendSmsCode('ACCOUNT_CLAIM', profile.phone, null, { farmerProfileId: profile.id });
    return { sentTo: `${profile.phone.slice(0, 7)}***${profile.phone.slice(-2)}` };
  }

  /** Step 2: prove possession of the phone and create credentials; the profile becomes the farmer's own. */
  async claimComplete(req: AppRequest, res: AppResponse, input: z.infer<typeof claimCompleteSchema>): Promise<void> {
    const hash = await this.hashPassword(input.password);
    const userId = await withTransaction(this.prisma.db, async (tx) => {
      const t = await this.otp.findLinkToken(tx, 'ACCOUNT_CLAIM', input.claimCode.toUpperCase());
      const profile = await tx.farmerProfile.findUniqueOrThrow({ where: { id: t.farmerProfileId! } });
      if (profile.userId || !profile.phone) throw new DomainError('TOKEN_INVALID', 'This profile cannot be claimed');
      await this.otp.verifySmsCode('ACCOUNT_CLAIM', profile.phone, input.otp, tx);
      await this.otp.consumeLinkToken(tx, t.id);
      if (await tx.user.findFirst({ where: { OR: [{ phone: profile.phone }, ...(input.email ? [{ email: input.email }] : [])] } })) {
        throw new DomainError('DUPLICATE', 'An account already uses this phone or email. Sign in and contact support to link the profile.');
      }
      const user = await tx.user.create({
        data: { phone: profile.phone, phoneVerifiedAt: new Date(), email: input.email ?? null, passwordHash: hash, displayName: profile.displayName, locale: profile.preferredLanguage },
      });
      await tx.farmerProfile.update({ where: { id: profile.id }, data: { userId: user.id, claimStatus: 'CLAIMED', version: { increment: 1 } } });
      await tx.consentRecord.createMany({
        data: [
          { userId: user.id, farmerProfileId: profile.id, type: 'TERMS', documentVersion: TERMS_VERSION, granted: true, method: 'FARMER_IN_APP' },
          { userId: user.id, farmerProfileId: profile.id, type: 'PRIVACY', documentVersion: TERMS_VERSION, granted: true, method: 'FARMER_IN_APP' },
        ],
      });
      await audit(tx, { action: 'farmer.profile-claimed', entityType: 'farmer_profile', entityId: profile.id, data: { userId: user.id } });
      return user.id;
    });
    await this.sessions.create(req, res, userId, { mfaPending: false });
  }

  // ───────────── Me ─────────────

  async me(userId: string, sessionId: string): Promise<Me> {
    const user = await this.prisma.db.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        farmerProfile: true,
        memberships: { where: { status: 'ACTIVE' }, include: { organisation: true } },
        sessions: { where: { id: sessionId } },
      },
    });
    const session = user.sessions[0];
    const coopIds = user.memberships.filter((m) => m.organisation.type === 'COOPERATIVE' && m.roles.some((r) => r === 'OWNER' || r === 'REPRESENTATIVE')).map((m) => m.organisationId);
    const now = new Date();
    const delegations = coopIds.length
      ? await this.prisma.db.delegationConsent.findMany({
          where: { cooperativeId: { in: coopIds }, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          include: { farmerProfile: { select: { displayName: true, coopMemberships: { select: { cooperativeId: true, status: true } } } }, cooperative: { select: { name: true } } },
          orderBy: { grantedAt: 'asc' },
        })
      : [];
    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        emailVerified: Boolean(user.emailVerifiedAt),
        phone: user.phone,
        phoneVerified: Boolean(user.phoneVerifiedAt),
        platformRole: user.platformRole,
        locale: user.locale,
        mfaEnabled: Boolean(user.mfaEnabledAt),
        isDemo: user.isDemo,
        notificationPrefs: notificationPrefsSchema.parse(user.notificationPrefs ?? {}),
      },
      session: {
        id: sessionId,
        mfaPending: session?.mfaPending ?? false,
        mfaVerified: Boolean(session?.mfaVerifiedAt),
        absoluteExpiresAt: (session?.absoluteExpiresAt ?? now).toISOString(),
      },
      farmerProfile: user.farmerProfile
        ? { id: user.farmerProfile.id, displayName: user.farmerProfile.displayName, claimStatus: user.farmerProfile.claimStatus, lga: user.farmerProfile.lga }
        : null,
      memberships: user.memberships.map((m) => ({
        organisationId: m.organisationId,
        organisationName: m.organisation.name,
        organisationType: m.organisation.type,
        organisationStatus: m.organisation.status,
        roles: m.roles,
      })),
      represented: delegations
        .filter((d) => d.farmerProfile.coopMemberships.some((cm) => cm.cooperativeId === d.cooperativeId && cm.status === 'ACTIVE'))
        .map((d) => ({
          farmerProfileId: d.farmerProfileId,
          displayName: d.farmerProfile.displayName,
          cooperativeId: d.cooperativeId,
          cooperativeName: d.cooperative.name,
          delegationId: d.id,
          scopes: d.scopes,
        })),
    };
  }

  devToolsEnabled(): boolean {
    return devToolsAllowed(this.env);
  }
}
