import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { devToolsAllowed, resolveFromRoot, type Env } from '@harvestslot/config';
import { notificationPrefsSchema, type NotificationPrefs } from '@harvestslot/contracts';
import type { PrismaClient } from '@harvestslot/db';
import nodemailer, { type Transporter } from 'nodemailer';
import { backoffDelayMs } from './outbox.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailTransport {
  readonly mode: 'smtp' | 'dev-capture';
  /** True when messages never leave this machine (Mailpit or the dev mailbox). */
  readonly localOnly: boolean;
  send(msg: MailMessage): Promise<{ messageId: string }>;
}

export interface SmsTransport {
  readonly mode: 'termii' | 'dev-capture';
  readonly localOnly: boolean;
  send(to: string, text: string): Promise<{ messageId: string }>;
}

// ───────────── Development mailbox (local capture, never in production) ─────────────

export interface CapturedMessage {
  id: string;
  channel: 'EMAIL' | 'SMS';
  to: string;
  subject: string | null;
  text: string;
  capturedAt: string;
}

function devMailboxDir(): string {
  return resolveFromRoot('.local/dev-mailbox');
}

export function captureLocally(channel: 'EMAIL' | 'SMS', to: string, subject: string | null, text: string): CapturedMessage {
  const dir = devMailboxDir();
  mkdirSync(dir, { recursive: true });
  const msg: CapturedMessage = { id: randomUUID(), channel, to, subject, text, capturedAt: new Date().toISOString() };
  writeFileSync(join(dir, `${Date.now()}-${msg.id}.json`), JSON.stringify(msg, null, 2));
  return msg;
}

export function listCapturedMessages(limit = 50): CapturedMessage[] {
  let files: string[] = [];
  try {
    files = readdirSync(devMailboxDir()).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return files
    .sort()
    .reverse()
    .slice(0, limit)
    .map((f) => JSON.parse(readFileSync(join(devMailboxDir(), f), 'utf8')) as CapturedMessage);
}

class DevCaptureMail implements MailTransport {
  readonly mode = 'dev-capture' as const;
  readonly localOnly = true;
  async send(msg: MailMessage) {
    return { messageId: captureLocally('EMAIL', msg.to, msg.subject, msg.text).id };
  }
}

class SmtpMail implements MailTransport {
  readonly mode = 'smtp' as const;
  private readonly transporter: Transporter;
  constructor(
    private readonly env: Env,
    readonly localOnly: boolean,
  ) {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } : undefined,
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  async send(msg: MailMessage) {
    const info = await this.transporter.sendMail({ from: this.env.MAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text });
    return { messageId: String(info.messageId) };
  }
}

/** Termii SMS adapter (POST /api/sms/send). Exercised only when credentials are configured. */
export class TermiiSms implements SmsTransport {
  readonly mode = 'termii' as const;
  readonly localOnly = false;
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly senderId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}
  async send(to: string, text: string) {
    const res = await this.fetchImpl(`${this.baseUrl}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: this.apiKey, to: to.replace(/^\+/, ''), from: this.senderId, sms: text, type: 'plain', channel: 'generic' }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { message_id?: string; message?: string };
    if (!res.ok || !body.message_id) throw new Error(`Termii rejected the message: ${body.message ?? res.statusText}`);
    return { messageId: body.message_id };
  }
}

class DevCaptureSms implements SmsTransport {
  readonly mode = 'dev-capture' as const;
  readonly localOnly = true;
  async send(to: string, text: string) {
    return { messageId: captureLocally('SMS', to, null, text).id };
  }
}

export interface Messaging {
  mail: MailTransport;
  /** null when no SMS provider is configured (and dev tools are off): SMS is UNAVAILABLE. */
  sms: SmsTransport | null;
}

export function createMessaging(env: Env): Messaging {
  const mail: MailTransport =
    env.MAIL_TRANSPORT === 'dev-capture' && env.NODE_ENV !== 'production' ? new DevCaptureMail() : new SmtpMail(env, env.MAIL_LOCAL_CAPTURE);
  let sms: SmsTransport | null = null;
  if (env.SMS_PROVIDER === 'termii' && env.TERMII_API_KEY && env.TERMII_SENDER_ID) {
    sms = new TermiiSms(env.TERMII_BASE_URL, env.TERMII_API_KEY, env.TERMII_SENDER_ID);
  } else if (devToolsAllowed(env)) {
    sms = new DevCaptureSms();
  }
  return { mail, sms };
}

// ───────────── Notification delivery (worker) ─────────────

function mask(destination: string): string {
  if (destination.includes('@')) {
    const [u, d] = destination.split('@');
    return `${u!.slice(0, 2)}***@${d}`;
  }
  return `${destination.slice(0, 5)}***${destination.slice(-2)}`;
}

export function parsePrefs(raw: unknown): NotificationPrefs {
  const parsed = notificationPrefsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : notificationPrefsSchema.parse({});
}

export type DeliveryResult = 'done' | 'retry';

const MAX_CHANNEL_ATTEMPTS = 6;

/**
 * Delivers one notification over the external channels the user consented to. Idempotent per
 * (notification, channel): a channel already SENT/CAPTURED/SUPPRESSED/UNAVAILABLE/DEAD is never re-sent.
 * Returns "retry" when a channel failed transiently so the outbox event is retried with backoff.
 */
export async function deliverNotification(
  prisma: PrismaClient,
  messaging: Messaging,
  env: Env,
  notificationId: string,
  category: string,
  now = new Date(),
): Promise<DeliveryResult> {
  const n = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: {
      user: {
        select: {
          email: true,
          emailVerifiedAt: true,
          phone: true,
          phoneVerifiedAt: true,
          isDemo: true,
          notificationPrefs: true,
          status: true,
          consents: { orderBy: { createdAt: 'desc' }, select: { type: true, granted: true } },
        },
      },
    },
  });
  if (!n) return 'done';
  const prefs = parsePrefs(n.user.notificationPrefs);
  const latestConsent = (type: string) => n.user.consents.find((c) => c.type === type)?.granted ?? false;
  const muted = prefs.mutedCategories.includes(category as NotificationPrefs['mutedCategories'][number]);
  const link = n.link ? `${env.PUBLIC_BASE_URL}${n.link}` : env.PUBLIC_BASE_URL;
  let needsRetry = false;

  const channels: Array<{ channel: 'EMAIL' | 'SMS'; destination: string | null; wanted: boolean; why: string }> = [
    {
      channel: 'EMAIL',
      destination: n.user.email,
      wanted: !!n.user.email && !!n.user.emailVerifiedAt && prefs.email && latestConsent('CONTACT_EMAIL') && !muted,
      why: !n.user.email ? 'no email address' : !n.user.emailVerifiedAt ? 'email not verified' : muted ? 'category muted' : 'email notifications off or no consent',
    },
    {
      channel: 'SMS',
      destination: n.user.phone,
      wanted: !!n.user.phone && !!n.user.phoneVerifiedAt && prefs.sms && latestConsent('CONTACT_SMS') && !muted,
      why: !n.user.phone ? 'no phone number' : !n.user.phoneVerifiedAt ? 'phone not verified' : muted ? 'category muted' : 'SMS notifications off or no consent',
    },
  ];

  for (const ch of channels) {
    if (!ch.wanted) continue; // no row: the in-app notification is the only channel
    const existing = await prisma.deliveryAttempt.findUnique({ where: { notificationId_channel: { notificationId, channel: ch.channel } } });
    if (existing && !['QUEUED', 'FAILED'].includes(existing.status)) continue;
    if (existing?.nextAttemptAt && existing.nextAttemptAt > now) {
      needsRetry = true;
      continue;
    }
    const attemptNo = (existing?.attemptNo ?? 0) + 1;
    const base = { notificationId, channel: ch.channel, destinationMasked: ch.destination ? mask(ch.destination) : null, attemptNo };
    const upsert = (data: Record<string, unknown>) =>
      prisma.deliveryAttempt.upsert({
        where: { notificationId_channel: { notificationId, channel: ch.channel } },
        create: { ...base, ...data },
        update: { attemptNo, ...data },
      });

    if (n.user.status !== 'ACTIVE') {
      await upsert({ status: 'SUPPRESSED', error: 'Account not active' });
      continue;
    }
    if (ch.channel === 'EMAIL') {
      if (n.user.isDemo && !messaging.mail.localOnly) {
        await upsert({ status: 'SUPPRESSED', error: 'Demo account: external delivery suppressed' });
        continue;
      }
      const text = `${n.body}\n\nOpen HarvestSlot: ${link}\n\nYou receive this because email notifications are on in your HarvestSlot settings.`;
      try {
        const r = await messaging.mail.send({ to: ch.destination!, subject: n.title, text });
        const captured = messaging.mail.mode === 'dev-capture';
        await upsert({
          status: captured ? 'CAPTURED_LOCALLY' : 'SENT',
          provider: captured ? 'dev-capture' : messaging.mail.localOnly ? 'smtp-local-capture' : 'smtp',
          providerMessageId: r.messageId,
          sentAt: now,
          error: null,
          nextAttemptAt: null,
          capturedSubject: captured ? n.title : null,
          capturedBody: captured ? text : null,
        });
      } catch (error) {
        const dead = attemptNo >= MAX_CHANNEL_ATTEMPTS;
        await upsert({ status: dead ? 'DEAD' : 'FAILED', error: String(error).slice(0, 500), nextAttemptAt: dead ? null : new Date(now.getTime() + backoffDelayMs(attemptNo)) });
        if (!dead) needsRetry = true;
      }
    } else {
      if (n.user.isDemo && messaging.sms?.mode !== 'dev-capture') {
        await upsert({ status: 'SUPPRESSED', error: 'Demo account: SMS suppressed' });
        continue;
      }
      if (!messaging.sms) {
        await upsert({ status: 'UNAVAILABLE', error: 'No SMS provider configured' });
        continue;
      }
      const text = `HarvestSlot: ${n.title}. ${link}`.slice(0, 300);
      try {
        const r = await messaging.sms.send(ch.destination!, text);
        const captured = messaging.sms.mode === 'dev-capture';
        await upsert({
          status: captured ? 'CAPTURED_LOCALLY' : 'SENT',
          provider: messaging.sms.mode,
          providerMessageId: r.messageId,
          sentAt: now,
          error: null,
          nextAttemptAt: null,
          capturedSubject: null,
          capturedBody: captured ? text : null,
        });
      } catch (error) {
        const dead = attemptNo >= MAX_CHANNEL_ATTEMPTS;
        await upsert({ status: dead ? 'DEAD' : 'FAILED', error: String(error).slice(0, 500), nextAttemptAt: dead ? null : new Date(now.getTime() + backoffDelayMs(attemptNo)) });
        if (!dead) needsRetry = true;
      }
    }
  }
  return needsRetry ? 'retry' : 'done';
}
