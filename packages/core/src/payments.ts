import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Env } from '@harvestslot/config';
import { formatNaira } from '@harvestslot/contracts';
import type { PrismaClient, Prisma, Tx } from '@harvestslot/db';
import { audit } from './audit.js';
import { DomainError } from './errors.js';
import { notifyPaymentEvent, refreshInvoice } from './invoicing.js';
import { adminUserIds, notify } from './notify.js';
import { lockRow, withTransaction } from './tx.js';

export type ProviderTxStatus = 'success' | 'failed' | 'abandoned' | 'reversed' | 'pending';

export interface ProviderVerification {
  found: boolean;
  status: ProviderTxStatus;
  amountKobo: bigint;
  currency: string;
  reference: string;
  environment: string;
  paidAt: Date | null;
  providerTransactionId: string | null;
  gatewayResponse: string | null;
}

export interface InitializeInput {
  email: string;
  amountKobo: bigint;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}

export interface PaymentProvider {
  readonly name: 'paystack' | 'simulated';
  /** test | live for Paystack; "simulated" for the local simulator. */
  readonly environment: string;
  initialize(input: InitializeInput): Promise<{ checkoutUrl: string }>;
  verify(reference: string): Promise<ProviderVerification>;
  verifySignature(rawBody: Buffer, signature: string | undefined): boolean;
}

export function hmacSha512Hex(key: string, body: Buffer): string {
  return createHmac('sha512', key).update(body).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function mapPaystackStatus(status: string): ProviderTxStatus {
  switch (status) {
    case 'success':
      return 'success';
    case 'failed':
      return 'failed';
    case 'abandoned':
      return 'abandoned';
    case 'reversed':
      return 'reversed';
    default:
      // ongoing, pending, processing, queued
      return 'pending';
  }
}

/**
 * Paystack adapter: backend initialisation, hosted checkout, HMAC-SHA512 webhook signatures over the
 * exact raw body (x-paystack-signature, keyed with the secret key) and server-side verification.
 */
export class PaystackProvider implements PaymentProvider {
  readonly name = 'paystack' as const;
  constructor(
    private readonly baseUrl: string,
    private readonly secretKey: string,
    readonly environment: 'test' | 'live',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${this.secretKey}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new DomainError('PROVIDER_UNAVAILABLE', 'Paystack could not be reached', { cause: String(error) });
    }
    const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: unknown } | null;
    if (!res.ok || !body?.status) {
      throw new DomainError('PROVIDER_ERROR', `Paystack error: ${body?.message ?? res.statusText}`, { httpStatus: res.status });
    }
    return body.data as T;
  }

  async initialize(input: InitializeInput): Promise<{ checkoutUrl: string }> {
    const data = await this.call<{ authorization_url: string; reference: string }>('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo.toString(),
        currency: 'NGN',
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    });
    if (data.reference !== input.reference) throw new DomainError('PROVIDER_ERROR', 'Paystack returned a different reference');
    return { checkoutUrl: data.authorization_url };
  }

  async verify(reference: string): Promise<ProviderVerification> {
    const data = await this.call<{
      id: number;
      status: string;
      amount: number;
      currency: string;
      reference: string;
      domain: string;
      paid_at: string | null;
      gateway_response: string | null;
    }>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' });
    return {
      found: true,
      status: mapPaystackStatus(data.status),
      amountKobo: BigInt(data.amount),
      currency: data.currency,
      reference: data.reference,
      environment: data.domain,
      paidAt: data.paid_at ? new Date(data.paid_at) : null,
      providerTransactionId: String(data.id),
      gatewayResponse: data.gateway_response,
    };
  }

  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    return safeEqualHex(hmacSha512Hex(this.secretKey, rawBody), signature.trim().toLowerCase());
  }
}

/**
 * Local development simulator. It records outcomes as signed "webhook" events in the same table the
 * Paystack webhook uses and is verified through the same reconciliation code. Refused in production.
 */
export class SimulatedProvider implements PaymentProvider {
  readonly name = 'simulated' as const;
  readonly environment = 'simulated';
  constructor(
    private readonly prisma: PrismaClient,
    private readonly secret: string,
    private readonly publicBaseUrl: string,
  ) {}

  async initialize(input: InitializeInput): Promise<{ checkoutUrl: string }> {
    return { checkoutUrl: `${this.publicBaseUrl}/dev/payment-simulator/${encodeURIComponent(input.reference)}` };
  }

  async verify(reference: string): Promise<ProviderVerification> {
    const attempt = await this.prisma.paymentAttempt.findUnique({ where: { providerReference: reference } });
    const event = await this.prisma.integrationWebhookEvent.findFirst({
      where: { provider: 'simulated', signatureValid: true, payload: { path: ['data', 'reference'], equals: reference } },
      orderBy: { receivedAt: 'desc' },
    });
    if (!attempt || !event) {
      return { found: Boolean(attempt), status: 'pending', amountKobo: attempt?.amountKobo ?? 0n, currency: 'NGN', reference, environment: this.environment, paidAt: null, providerTransactionId: null, gatewayResponse: null };
    }
    const data = (event.payload as { data: { status: string; amount: number; currency: string; paid_at?: string; id: string } }).data;
    return {
      found: true,
      status: mapPaystackStatus(data.status),
      amountKobo: BigInt(data.amount),
      currency: data.currency,
      reference,
      environment: this.environment,
      paidAt: data.paid_at ? new Date(data.paid_at) : null,
      providerTransactionId: data.id,
      gatewayResponse: 'Simulated outcome',
    };
  }

  sign(rawBody: Buffer): string {
    return hmacSha512Hex(this.secret, rawBody);
  }

  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    return !!signature && safeEqualHex(this.sign(rawBody), signature);
  }
}

export function createPaymentProvider(env: Env, prisma: PrismaClient): PaymentProvider | null {
  if (env.PAYMENT_PROVIDER === 'paystack' && env.PAYSTACK_SECRET_KEY) {
    return new PaystackProvider(env.PAYSTACK_BASE_URL, env.PAYSTACK_SECRET_KEY, env.PAYSTACK_MODE);
  }
  if (env.PAYMENT_PROVIDER === 'simulated' && env.PAYMENT_SIMULATOR_SECRET) {
    if (env.NODE_ENV === 'production' || env.APP_ENV === 'production') throw new Error('Payment simulator is not allowed in production');
    return new SimulatedProvider(prisma, env.PAYMENT_SIMULATOR_SECRET, env.PUBLIC_BASE_URL);
  }
  return null;
}

const STATUS_FOR: Record<ProviderTxStatus, 'PROVIDER_SUCCESS' | 'PROVIDER_FAILED' | 'PROVIDER_ABANDONED' | 'PROVIDER_REVERSED' | 'PROVIDER_PENDING'> = {
  success: 'PROVIDER_SUCCESS',
  failed: 'PROVIDER_FAILED',
  abandoned: 'PROVIDER_ABANDONED',
  reversed: 'PROVIDER_REVERSED',
  pending: 'PROVIDER_PENDING',
};

/** Which recorded statuses a verified provider status may replace. Prevents out-of-order downgrades. */
function allowedFrom(next: ProviderTxStatus): string[] {
  switch (next) {
    case 'success':
      return ['PROVIDER_PENDING', 'PROVIDER_FAILED', 'PROVIDER_ABANDONED'];
    case 'failed':
    case 'abandoned':
      return ['PROVIDER_PENDING'];
    case 'reversed':
      return ['PROVIDER_PENDING', 'PROVIDER_SUCCESS'];
    case 'pending':
      return [];
  }
}

export type ReconcileOutcome = 'applied' | 'unchanged' | 'mismatch' | 'unknown_reference';

/**
 * The single reconciliation path for callback redirects, webhooks and reconciliation jobs. It takes a
 * *server-side verification result* (never the browser's or the webhook's claim), checks reference,
 * status, currency, amount and environment against the internal attempt, and applies the change
 * idempotently under the invoice lock. Duplicate or out-of-order results cannot double-credit.
 */
export async function applyVerifiedPayment(
  prisma: PrismaClient,
  provider: Pick<PaymentProvider, 'name' | 'environment'>,
  v: ProviderVerification,
  source: 'callback' | 'webhook' | 'reconciliation',
  now = new Date(),
): Promise<ReconcileOutcome> {
  return withTransaction(prisma, async (tx) => {
    const peek = await tx.paymentAttempt.findUnique({ where: { providerReference: v.reference }, select: { invoiceId: true } });
    if (!peek) return 'unknown_reference';
    await lockRow(tx, 'invoices', peek.invoiceId);
    const attempt = await tx.paymentAttempt.findUniqueOrThrow({ where: { providerReference: v.reference } });

    const expectedMethod = provider.name === 'simulated' ? 'PAYSTACK_SIMULATED' : 'PAYSTACK';
    const problems: string[] = [];
    if (!v.found) problems.push('transaction not found at provider');
    if (attempt.method !== expectedMethod) problems.push(`attempt method ${attempt.method} does not match provider ${provider.name}`);
    if (v.currency !== 'NGN') problems.push(`currency ${v.currency}`);
    if (v.amountKobo !== attempt.amountKobo) problems.push(`amount ${v.amountKobo} ≠ expected ${attempt.amountKobo}`);
    if (v.environment !== attempt.providerEnvironment) problems.push(`environment ${v.environment} ≠ expected ${attempt.providerEnvironment}`);
    if (problems.length && v.status !== 'pending') {
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: { providerStatus: `MISMATCH: ${problems.join('; ')}`.slice(0, 500), version: { increment: 1 } },
      });
      await audit(tx, {
        action: 'payment.provider-mismatch',
        entityType: 'payment_attempt',
        entityId: attempt.id,
        actorParty: 'SYSTEM',
        data: { source, problems },
      });
      await notify(tx, {
        userIds: await adminUserIds(tx),
        type: 'payment.mismatch',
        category: 'payments',
        title: 'Payment verification mismatch',
        body: `Reference ${v.reference}: ${problems.join('; ')}. The invoice was not credited.`,
        link: `/admin/payments`,
        dedupeKey: `payment-mismatch:${attempt.id}:${v.status}`,
      });
      return 'mismatch';
    }

    const next = STATUS_FOR[v.status];
    if (attempt.status === next || !allowedFrom(v.status).includes(attempt.status)) {
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { providerStatus: v.gatewayResponse ?? v.status } });
      return 'unchanged';
    }
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: next,
        verificationLevel: provider.name === 'simulated' ? 'SIMULATED' : v.status === 'success' || v.status === 'reversed' ? 'VERIFIED_BY_PROVIDER' : attempt.verificationLevel,
        providerStatus: v.gatewayResponse ?? v.status,
        providerPaidAt: v.paidAt,
        providerVerifiedAt: now,
        version: { increment: 1 },
      },
    });
    await refreshInvoice(tx, attempt.invoiceId);
    await audit(tx, {
      action: `payment.provider-${v.status}`,
      entityType: 'payment_attempt',
      entityId: attempt.id,
      actorParty: 'SYSTEM',
      data: { source, reference: v.reference, amountKobo: v.amountKobo.toString(), environment: v.environment },
    });
    if (v.status === 'success' || v.status === 'reversed' || v.status === 'failed') {
      const label = provider.name === 'simulated' ? ' (simulated — no money moved)' : '';
      await notifyPaymentEvent(
        tx,
        attempt.invoiceId,
        'PAYER',
        `payment.${v.status}`,
        v.status === 'success' ? `Payment of ${formatNaira(attempt.amountKobo)} verified${label}` : `Payment ${v.status}${label}`,
        v.status === 'success'
          ? `${provider.name === 'simulated' ? 'The simulator' : 'Paystack'} confirmed reference ${v.reference}.`
          : `Reference ${v.reference} was ${v.status}. The invoice balance has been updated.`,
        now,
      );
    }
    return 'applied';
  });
}

export interface WebhookRecordResult {
  id: string;
  duplicate: boolean;
}

/**
 * Persists a verified webhook durably before acknowledging it. Deduplicated on the provider's event
 * identity, so redeliveries are recorded once. Processing happens afterwards (retryable).
 */
export async function recordWebhookEvent(
  prisma: PrismaClient,
  provider: string,
  rawBody: Buffer,
  signatureValid: boolean,
  environment: string,
): Promise<WebhookRecordResult> {
  const sha = createHash('sha256').update(rawBody).digest('hex');
  let payload: Prisma.InputJsonValue;
  try {
    payload = JSON.parse(rawBody.toString('utf8')) as Prisma.InputJsonValue;
  } catch {
    payload = { unparseable: true };
  }
  const p = payload as { event?: string; data?: { reference?: string; status?: string; id?: string | number } };
  const dedupeKey = p.event && p.data?.reference ? `${p.event}:${p.data.reference}:${p.data.status ?? ''}:${p.data.id ?? ''}` : sha;
  const existing = await prisma.integrationWebhookEvent.findUnique({ where: { provider_dedupeKey: { provider, dedupeKey } } });
  if (existing) return { id: existing.id, duplicate: true };
  try {
    const created = await prisma.integrationWebhookEvent.create({
      data: {
        provider,
        dedupeKey,
        eventType: p.event ?? 'unknown',
        environment,
        signatureValid,
        payload,
        rawBodySha256: sha,
        status: signatureValid ? 'RECEIVED' : 'IGNORED',
        processingError: signatureValid ? null : 'Invalid signature',
      },
    });
    return { id: created.id, duplicate: false };
  } catch (error) {
    const again = await prisma.integrationWebhookEvent.findUnique({ where: { provider_dedupeKey: { provider, dedupeKey } } });
    if (again) return { id: again.id, duplicate: true };
    throw error;
  }
}

/** Processes a stored webhook: re-verifies with the provider, then applies through the shared path. */
export async function processWebhookEvent(prisma: PrismaClient, provider: PaymentProvider, eventId: string, now = new Date()): Promise<ReconcileOutcome | 'ignored'> {
  const event = await prisma.integrationWebhookEvent.findUniqueOrThrow({ where: { id: eventId } });
  if (!event.signatureValid || event.status === 'PROCESSED' || event.status === 'IGNORED') return 'ignored';
  const payload = event.payload as { event?: string; data?: { reference?: string; amount?: number; transaction_reference?: string; id?: string | number } };
  const reference = payload.data?.reference ?? payload.data?.transaction_reference;
  try {
    let outcome: ReconcileOutcome | 'ignored' = 'ignored';
    if (payload.event?.startsWith('charge.') && reference) {
      const verification = await provider.verify(reference);
      outcome = await applyVerifiedPayment(prisma, provider, verification, 'webhook', now);
    } else if (payload.event === 'refund.processed' && reference) {
      outcome = await applyProviderRefund(prisma, reference, BigInt(payload.data?.amount ?? 0), String(payload.data?.id ?? event.id), now);
    }
    await prisma.integrationWebhookEvent.update({
      where: { id: eventId },
      data: { status: outcome === 'ignored' ? 'IGNORED' : 'PROCESSED', processedAt: now, attempts: { increment: 1 }, processingError: null },
    });
    return outcome;
  } catch (error) {
    await prisma.integrationWebhookEvent.update({
      where: { id: eventId },
      data: { status: 'FAILED', attempts: { increment: 1 }, processingError: String(error).slice(0, 1000) },
    });
    throw error;
  }
}

async function applyProviderRefund(prisma: PrismaClient, transactionReference: string, amountKobo: bigint, providerRefundId: string, now: Date): Promise<ReconcileOutcome> {
  return withTransaction(prisma, async (tx: Tx) => {
    const attempt = await tx.paymentAttempt.findUnique({ where: { providerReference: transactionReference } });
    if (!attempt) return 'unknown_reference';
    await lockRow(tx, 'invoices', attempt.invoiceId);
    const existing = await tx.refundRecord.findFirst({ where: { providerReference: providerRefundId } });
    if (existing) return 'unchanged';
    const systemUser = (await adminUserIds(tx))[0];
    if (!systemUser || amountKobo <= 0n) return 'unchanged';
    await tx.refundRecord.create({
      data: {
        invoiceId: attempt.invoiceId,
        paymentAttemptId: attempt.id,
        amountKobo,
        reason: 'Refund processed by Paystack',
        status: 'PROVIDER_PROCESSED',
        providerReference: providerRefundId,
        reportedByUserId: systemUser,
        confirmedAt: now,
      },
    });
    await refreshInvoice(tx, attempt.invoiceId);
    await audit(tx, { action: 'payment.refund-processed', entityType: 'payment_attempt', entityId: attempt.id, actorParty: 'SYSTEM', data: { amountKobo: amountKobo.toString() } });
    return 'applied';
  });
}
