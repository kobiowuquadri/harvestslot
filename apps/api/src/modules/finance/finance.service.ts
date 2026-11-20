import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  INVOICE_KIND_LABELS,
  VERIFICATION_LABELS,
  formatKg,
  formatNaira,
  invoiceListQuerySchema,
  receiptDecisionSchema,
  reportPaymentSchema,
  reportRefundSchema,
  type InvoiceDto,
} from '@harvestslot/contracts';
import {
  applyVerifiedPayment,
  assertCanReportPayment,
  checkoutEmail,
  audit,
  DomainError,
  enqueueOutbox,
  hasOpenDispute,
  invoiceBalance,
  notifyPaymentEvent,
  processWebhookEvent,
  recordWebhookEvent,
  refreshInvoice,
  withTransaction,
  type Actor,
  type FarmerAuthority,
  type PaymentProvider,
  type SimulatedProvider,
} from '@harvestslot/core';
import type { Prisma } from '@harvestslot/db';
import { AccessService } from '../../common/access.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { iso, kg, kobo } from '../../common/serialize.js';
import { ENV, PAYMENTS, type Env } from '../../common/tokens.js';

const invoiceInclude = {
  lines: { orderBy: { sortOrder: 'asc' as const } },
  adjustments: { orderBy: { createdAt: 'asc' as const } },
  payments: { orderBy: { createdAt: 'asc' as const }, include: { evidence: true, receiptConfirmations: true } },
  refunds: { orderBy: { createdAt: 'asc' as const } },
  disputes: { select: { id: true, status: true } },
  booking: { select: { reference: true, farmerProfileId: true, processorOrgId: true } },
} as const;
type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;
type Side = 'PAYER' | 'PAYEE';

interface InvoiceAuthority {
  role: 'PAYER' | 'PAYEE' | 'ADMIN';
  canPay: boolean;
  canConfirm: boolean;
  farmer?: FarmerAuthority;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

@Injectable()
export class FinanceService {
  private readonly logger = new Logger('Finance');
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    @Inject(ENV) private readonly env: Env,
    @Inject(PAYMENTS) private readonly provider: PaymentProvider | null,
  ) {}

  // ───────────── Authority ─────────────

  /** Resolves whether the actor is the payer, the payee or an administrator for an invoice; 404 otherwise. */
  private async authority(actor: Actor, inv: { payerType: string; payerOrgId: string | null; payerFarmerId: string | null; payeeType: string; payeeOrgId: string | null; payeeFarmerId: string | null }): Promise<InvoiceAuthority> {
    const memberships = await this.access.memberships(actor);
    const sideFor = async (side: Side): Promise<InvoiceAuthority | null> => {
      const type = side === 'PAYER' ? inv.payerType : inv.payeeType;
      const orgId = side === 'PAYER' ? inv.payerOrgId : inv.payeeOrgId;
      const farmerId = side === 'PAYER' ? inv.payerFarmerId : inv.payeeFarmerId;
      if (type === 'ORGANISATION' && orgId) {
        const m = memberships.find((x) => x.organisationId === orgId);
        if (!m) return null;
        const finance = m.roles.some((r) => r === 'OWNER' || r === 'FINANCE_OFFICER');
        const viewer = finance || m.roles.includes('MANAGER');
        if (!viewer) return null;
        return { role: side, canPay: side === 'PAYER' && finance, canConfirm: side === 'PAYEE' && finance };
      }
      if (type === 'FARMER' && farmerId) {
        try {
          const a = await this.access.farmer(actor, farmerId, 'finance.view');
          if (a.mode === 'ADMIN') return null;
          const scopes = a.mode === 'DELEGATE' ? a.scopes : null;
          return {
            role: side,
            farmer: a,
            canPay: side === 'PAYER' && (scopes === null || scopes.includes('APPROVE_SALE')),
            canConfirm: side === 'PAYEE' && (scopes === null || scopes.includes('CONFIRM_PAYMENT_RECEIPT')),
          };
        } catch {
          return null;
        }
      }
      if (type === 'PLATFORM' && actor.platformRole === 'ADMIN' && side === 'PAYEE') return { role: 'PAYEE', canPay: false, canConfirm: true };
      return null;
    };
    const auth = (await sideFor('PAYER')) ?? (await sideFor('PAYEE'));
    if (auth) return auth;
    if (actor.platformRole === 'ADMIN') return { role: 'ADMIN', canPay: false, canConfirm: false };
    throw new DomainError('NOT_FOUND', 'Invoice not found');
  }

  private async partyName(type: string, orgId: string | null, farmerId: string | null): Promise<string> {
    if (type === 'PLATFORM') return 'HarvestSlot';
    if (type === 'ORGANISATION' && orgId) return (await this.prisma.db.organisation.findUnique({ where: { id: orgId }, select: { name: true } }))?.name ?? 'Organisation';
    if (type === 'FARMER' && farmerId) return (await this.prisma.db.farmerProfile.findUnique({ where: { id: farmerId }, select: { displayName: true } }))?.displayName ?? 'Farmer';
    return 'Unknown';
  }

  private async dto(inv: InvoiceRow, auth: InvoiceAuthority): Promise<InvoiceDto> {
    const users = await this.prisma.db.user.findMany({
      where: { id: { in: [...inv.payments.map((p) => p.reportedByUserId), ...inv.payments.flatMap((p) => p.receiptConfirmations.map((r) => r.decidedByUserId))].filter((x): x is string => !!x) } },
      select: { id: true, displayName: true },
    });
    const name = (id: string | null) => (id ? users.find((u) => u.id === id)?.displayName ?? 'Unknown' : null);
    const evidenceIds = inv.payments.flatMap((p) => p.evidence.map((e) => e.attachmentId));
    const files = await this.prisma.db.attachment.findMany({ where: { id: { in: evidenceIds } }, select: { id: true, originalFilename: true } });
    const pending = inv.payments.filter((p) => p.status === 'REPORTED' || p.status === 'PROVIDER_PENDING').reduce((s, p) => s + p.amountKobo, 0n);
    const outstanding = inv.totalKobo - inv.confirmedPaidKobo;
    const disputed = inv.disputes.some((d) => !['RESOLVED', 'WITHDRAWN'].includes(d.status));
    const actions: string[] = [];
    if (auth.canPay && outstanding - pending > 0n && inv.status !== 'VOID') {
      actions.push('reportPayment');
      if (inv.kind === 'PLATFORM_FEE' && this.provider) actions.push('payOnline');
    }
    if (auth.canConfirm) actions.push('confirmReceipt', 'reportRefund');
    if (auth.canPay) actions.push('confirmRefund');
    return {
      id: inv.id,
      number: inv.number,
      kind: inv.kind,
      bookingId: inv.bookingId,
      bookingReference: inv.booking.reference,
      payer: { type: inv.payerType, id: inv.payerOrgId ?? inv.payerFarmerId, name: await this.partyName(inv.payerType, inv.payerOrgId, inv.payerFarmerId) },
      payee: { type: inv.payeeType, id: inv.payeeOrgId ?? inv.payeeFarmerId, name: await this.partyName(inv.payeeType, inv.payeeOrgId, inv.payeeFarmerId) },
      currency: 'NGN',
      lines: inv.lines.map((l) => ({ description: l.description, quantityKg: kg(l.quantityKg), unitPriceKobo: kobo(l.unitPriceKobo), amountKobo: kobo(l.amountKobo) })),
      adjustments: inv.adjustments.map((a) => ({ id: a.id, amountKobo: kobo(a.amountKobo), reason: a.reason, createdAt: a.createdAt.toISOString(), disputeId: a.disputeId })),
      subtotalKobo: kobo(inv.subtotalKobo),
      adjustmentsKobo: kobo(inv.adjustmentsKobo),
      totalKobo: kobo(inv.totalKobo),
      confirmedPaidKobo: kobo(inv.confirmedPaidKobo),
      reportedPendingKobo: kobo(pending),
      outstandingKobo: kobo(outstanding),
      status: inv.status,
      overdue: outstanding > 0n && inv.dueAt < new Date(),
      disputed,
      issuedAt: inv.issuedAt.toISOString(),
      dueAt: inv.dueAt.toISOString(),
      payments: inv.payments.map((p) => {
        const receipt = p.receiptConfirmations[0];
        return {
          id: p.id,
          method: p.method,
          amountKobo: kobo(p.amountKobo),
          payerReference: p.payerReference,
          providerReference: p.providerReference,
          paidOn: iso(p.paidOn),
          status: p.status,
          verificationLevel: p.verificationLevel,
          verificationLabel: VERIFICATION_LABELS[p.verificationLevel].label,
          providerEnvironment: p.providerEnvironment,
          reportedBy: name(p.reportedByUserId),
          note: p.note,
          evidence: p.evidence.map((e) => ({ attachmentId: e.attachmentId, filename: files.find((f) => f.id === e.attachmentId)?.originalFilename ?? 'file' })),
          receipt: receipt ? { decision: receipt.decision, amountReceivedKobo: kobo(receipt.amountReceivedKobo), decidedBy: name(receipt.decidedByUserId) ?? 'Unknown', note: receipt.note, createdAt: receipt.createdAt.toISOString() } : null,
          createdAt: p.createdAt.toISOString(),
        };
      }),
      refunds: inv.refunds.map((r) => ({ id: r.id, amountKobo: kobo(r.amountKobo), reason: r.reason, status: r.status, createdAt: r.createdAt.toISOString() })),
      viewerRole: auth.role === 'ADMIN' ? 'ADMIN' : auth.role,
      allowedActions: actions,
      isDemo: inv.isDemo,
      version: inv.version,
    };
  }

  private async load(id: string): Promise<InvoiceRow> {
    const inv = await this.prisma.db.invoice.findUnique({ where: { id }, include: invoiceInclude });
    if (!inv) throw new DomainError('NOT_FOUND', 'Invoice not found');
    return inv;
  }

  async get(actor: Actor, id: string): Promise<InvoiceDto> {
    const inv = await this.load(id);
    return this.dto(inv, await this.authority(actor, inv));
  }

  async list(actor: Actor, q: z.infer<typeof invoiceListQuerySchema>): Promise<InvoiceDto[]> {
    let where: Prisma.InvoiceWhereInput;
    if (q.organisationId) {
      const m = (await this.access.memberships(actor)).find((x) => x.organisationId === q.organisationId);
      if (!m || !m.roles.some((r) => ['OWNER', 'FINANCE_OFFICER', 'MANAGER'].includes(r))) throw new DomainError('NOT_FOUND', 'Organisation not found');
      where = q.role === 'payer' ? { payerOrgId: q.organisationId } : q.role === 'payee' ? { payeeOrgId: q.organisationId } : { OR: [{ payerOrgId: q.organisationId }, { payeeOrgId: q.organisationId }] };
    } else {
      let farmerId = q.farmerProfileId;
      if (!farmerId) {
        const own = await this.prisma.db.farmerProfile.findUnique({ where: { userId: actor.userId }, select: { id: true } });
        if (!own) {
          if (actor.platformRole === 'ADMIN') where = { payeeType: 'PLATFORM' };
          else return [];
        }
        farmerId = own?.id;
      }
      if (farmerId) {
        await this.access.farmer(actor, farmerId, 'finance.view');
        where = q.role === 'payer' ? { payerFarmerId: farmerId } : q.role === 'payee' ? { payeeFarmerId: farmerId } : { OR: [{ payerFarmerId: farmerId }, { payeeFarmerId: farmerId }] };
      }
    }
    const now = new Date();
    const statusFilter: Prisma.InvoiceWhereInput =
      q.status === 'OPEN' ? { status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } : q.status === 'PAID' ? { status: 'PAID' } : q.status === 'OVERDUE' ? { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, dueAt: { lt: now } } : {};
    const rows = await this.prisma.db.invoice.findMany({ where: { AND: [where!, statusFilter, ...(q.kind ? [{ kind: q.kind }] : [])] }, include: invoiceInclude, orderBy: { issuedAt: 'desc' }, take: 200 });
    return Promise.all(rows.map(async (r) => this.dto(r, await this.authority(actor, r))));
  }

  // ───────────── Direct payments (bank transfer / cash) ─────────────

  async reportPayment(actor: Actor, invoiceId: string, input: z.infer<typeof reportPaymentSchema>): Promise<InvoiceDto> {
    const inv = await this.load(invoiceId);
    const auth = await this.authority(actor, inv);
    if (!auth.canPay) throw new DomainError('FORBIDDEN', 'Only the payer’s finance staff can report payments on this invoice');
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      await assertCanReportPayment(tx, invoiceId, BigInt(input.amountKobo));
      if (input.evidenceAttachmentIds.length) {
        const n = await tx.attachment.count({ where: { id: { in: input.evidenceAttachmentIds }, bookingId: inv.bookingId, purpose: 'PAYMENT_EVIDENCE' } });
        if (n !== input.evidenceAttachmentIds.length) throw new DomainError('VALIDATION_FAILED', 'Evidence must be payment evidence uploaded for this booking');
      }
      const attempt = await tx.paymentAttempt.create({
        data: {
          invoiceId,
          method: input.method,
          amountKobo: BigInt(input.amountKobo),
          payerReference: input.payerReference,
          paidOn: new Date(`${input.paidOn}T12:00:00+01:00`),
          status: 'REPORTED',
          // An uploaded screenshot never upgrades this; only the payee (or a provider) can.
          verificationLevel: 'REPORTED_BY_PAYER',
          reportedByUserId: actor.userId,
          reportedActingForFarmerId: auth.farmer?.mode === 'DELEGATE' ? auth.farmer.farmerProfileId : null,
          note: input.note ?? null,
          isDemo: inv.isDemo,
        },
      });
      for (const attachmentId of input.evidenceAttachmentIds) {
        await tx.paymentEvidence.create({ data: { paymentAttemptId: attempt.id, attachmentId, uploadedByUserId: actor.userId } });
      }
      await audit(tx, { actor, farmer: auth.farmer, action: 'payment.reported', entityType: 'invoice', entityId: invoiceId, data: { amountKobo: input.amountKobo, method: input.method } });
      await notifyPaymentEvent(tx, invoiceId, 'PAYEE', 'payment.reported', `Payment reported on ${inv.number}: ${formatNaira(input.amountKobo)}`, `The payer reports paying ${formatNaira(input.amountKobo)} (ref ${input.payerReference}). Confirm only once the money has actually arrived.`, now);
    });
    return this.get(actor, invoiceId);
  }

  /** The payee confirms (or disputes) that a reported payment actually arrived. */
  async receipt(actor: Actor, paymentId: string, input: z.infer<typeof receiptDecisionSchema>): Promise<InvoiceDto> {
    const attempt = await this.prisma.db.paymentAttempt.findUnique({ where: { id: paymentId } });
    if (!attempt) throw new DomainError('NOT_FOUND', 'Payment not found');
    const inv = await this.load(attempt.invoiceId);
    const auth = await this.authority(actor, inv);
    if (!auth.canConfirm) throw new DomainError('FORBIDDEN', 'Only the recipient can confirm that money arrived');
    const now = new Date();
    await withTransaction(this.prisma.db, async (tx) => {
      await tx.$queryRawUnsafe('SELECT id FROM invoices WHERE id = $1::uuid FOR UPDATE', inv.id);
      const fresh = await tx.paymentAttempt.findUniqueOrThrow({ where: { id: paymentId } });
      if (fresh.status !== 'REPORTED') throw new DomainError('INVALID_STATE_TRANSITION', 'This payment is not awaiting confirmation');
      await tx.receiptConfirmation.create({
        data: {
          paymentAttemptId: paymentId,
          decision: input.decision,
          amountReceivedKobo: input.amountReceivedKobo === undefined ? null : BigInt(input.amountReceivedKobo),
          decidedByUserId: actor.userId,
          actingForFarmerId: auth.farmer?.mode === 'DELEGATE' ? auth.farmer.farmerProfileId : null,
          delegationId: auth.farmer?.mode === 'DELEGATE' ? auth.farmer.delegationId : null,
          note: input.note ?? null,
        },
      });
      const confirmed = input.decision === 'CONFIRMED';
      await tx.paymentAttempt.update({
        where: { id: paymentId },
        data: { status: confirmed ? 'CONFIRMED_BY_RECIPIENT' : 'REJECTED_BY_RECIPIENT', verificationLevel: confirmed ? 'CONFIRMED_BY_RECIPIENT' : fresh.verificationLevel, version: { increment: 1 } },
      });
      await refreshInvoice(tx, inv.id);
      await audit(tx, { actor, farmer: auth.farmer, action: `payment.receipt-${input.decision.toLowerCase()}`, entityType: 'payment_attempt', entityId: paymentId, data: { amountReceivedKobo: input.amountReceivedKobo ?? null } });
      await notifyPaymentEvent(
        tx,
        inv.id,
        'PAYER',
        confirmed ? 'payment.confirmed' : 'payment.not-received',
        confirmed ? `${inv.number}: payment of ${formatNaira(fresh.amountKobo)} confirmed by the recipient` : `${inv.number}: recipient says the payment ${input.decision === 'NOT_RECEIVED' ? 'did not arrive' : 'amount differs'}`,
        confirmed
          ? 'The recipient confirmed the money arrived.'
          : `${input.note ?? ''} ${input.decision === 'AMOUNT_DIFFERS' ? `They report receiving ${formatNaira(input.amountReceivedKobo ?? 0)}. Report the correct amount, or open a dispute.` : 'Check the transfer, or open a dispute.'}`.trim(),
        now,
      );
    });
    return this.get(actor, inv.id);
  }

  async reportRefund(actor: Actor, invoiceId: string, input: z.infer<typeof reportRefundSchema>): Promise<InvoiceDto> {
    const inv = await this.load(invoiceId);
    const auth = await this.authority(actor, inv);
    if (!auth.canConfirm) throw new DomainError('FORBIDDEN', 'Only the payee can report a refund or repayment');
    const bal = await invoiceBalance(this.prisma.db, invoiceId);
    if (BigInt(input.amountKobo) > bal.confirmedPaidKobo) throw new DomainError('VALIDATION_FAILED', 'A refund cannot exceed what was confirmed as paid');
    await this.prisma.db.refundRecord.create({ data: { invoiceId, paymentAttemptId: input.paymentAttemptId ?? null, amountKobo: BigInt(input.amountKobo), reason: input.reason, reportedByUserId: actor.userId } });
    await audit(this.prisma.db, { actor, action: 'refund.reported', entityType: 'invoice', entityId: invoiceId, reason: input.reason, data: { amountKobo: input.amountKobo } });
    await notifyPaymentEvent(this.prisma.db as never, invoiceId, 'PAYER', 'refund.reported', `${inv.number}: refund of ${formatNaira(input.amountKobo)} reported`, 'Confirm when the money is back in your account.', new Date());
    return this.get(actor, invoiceId);
  }

  async confirmRefund(actor: Actor, refundId: string): Promise<InvoiceDto> {
    const refund = await this.prisma.db.refundRecord.findUnique({ where: { id: refundId } });
    if (!refund) throw new DomainError('NOT_FOUND', 'Refund not found');
    const inv = await this.load(refund.invoiceId);
    const auth = await this.authority(actor, inv);
    if (!auth.canPay) throw new DomainError('FORBIDDEN', 'Only the payer confirms that a refund arrived');
    await withTransaction(this.prisma.db, async (tx) => {
      await tx.$queryRawUnsafe('SELECT id FROM invoices WHERE id = $1::uuid FOR UPDATE', inv.id);
      const r = await tx.refundRecord.updateMany({ where: { id: refundId, status: 'REPORTED' }, data: { status: 'CONFIRMED_BY_RECIPIENT', confirmedByUserId: actor.userId, confirmedAt: new Date() } });
      if (r.count !== 1) throw new DomainError('INVALID_STATE_TRANSITION', 'This refund is not awaiting confirmation');
      await refreshInvoice(tx, inv.id);
      await audit(tx, { actor, action: 'refund.confirmed', entityType: 'invoice', entityId: inv.id, data: { refundId } });
    });
    return this.get(actor, inv.id);
  }

  // ───────────── Online checkout for HarvestSlot fee invoices ─────────────

  async checkout(actor: Actor, invoiceId: string) {
    if (!this.provider) throw new DomainError('INTEGRATION_NOT_CONFIGURED', 'Online payment is not configured. Pay by bank transfer and report it.');
    const inv = await this.load(invoiceId);
    if (inv.kind !== 'PLATFORM_FEE') throw new DomainError('BAD_REQUEST', 'Online checkout is only for HarvestSlot service-fee invoices. Produce and freight are paid directly.');
    const auth = await this.authority(actor, inv);
    if (!auth.canPay) throw new DomainError('FORBIDDEN', 'Only the payer’s finance staff can pay this invoice');
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: actor.userId } });
    const reference = `HS-${inv.number}-${randomBytes(5).toString('hex')}`;
    const attempt = await withTransaction(this.prisma.db, async (tx) => {
      const bal = await invoiceBalance(tx, invoiceId);
      const amount = bal.outstandingKobo - bal.pendingReportedKobo;
      if (amount <= 0n) throw new DomainError('OVERPAYMENT', 'Nothing is left to pay, or a payment is already awaiting confirmation');
      await assertCanReportPayment(tx, invoiceId, amount);
      const a = await tx.paymentAttempt.create({
        data: {
          invoiceId,
          method: this.provider!.name === 'simulated' ? 'PAYSTACK_SIMULATED' : 'PAYSTACK',
          amountKobo: amount,
          providerReference: reference,
          status: 'PROVIDER_PENDING',
          verificationLevel: this.provider!.name === 'simulated' ? 'SIMULATED' : 'REPORTED_BY_PAYER',
          providerEnvironment: this.provider!.environment,
          reportedByUserId: actor.userId,
          isDemo: inv.isDemo,
        },
      });
      await audit(tx, { actor, action: 'payment.checkout-started', entityType: 'invoice', entityId: invoiceId, data: { reference, provider: this.provider!.name } });
      return a;
    });
    // The provider is called only after the transaction has committed (no locks held).
    try {
      const { checkoutUrl } = await this.provider.initialize({
        email: checkoutEmail(user),
        amountKobo: attempt.amountKobo,
        reference,
        callbackUrl: `${this.env.PUBLIC_BASE_URL}/payments/return?reference=${encodeURIComponent(reference)}`,
        metadata: { invoiceId, invoiceNumber: inv.number, attemptId: attempt.id },
      });
      await this.prisma.db.paymentAttempt.update({ where: { id: attempt.id }, data: { checkoutUrl } });
      return { paymentAttemptId: attempt.id, reference, checkoutUrl, provider: this.provider.name };
    } catch (error) {
      await this.prisma.db.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'PROVIDER_FAILED', providerStatus: 'Initialisation failed' } });
      throw error;
    }
  }

  /** Browser return from checkout: verify server-side; never trust the redirect's query string. */
  async verifyReturn(actor: Actor, reference: string) {
    if (!this.provider) throw new DomainError('INTEGRATION_NOT_CONFIGURED', 'Online payment is not configured');
    const attempt = await this.prisma.db.paymentAttempt.findUnique({ where: { providerReference: reference } });
    if (!attempt) throw new DomainError('NOT_FOUND', 'Payment not found');
    const inv = await this.load(attempt.invoiceId);
    await this.authority(actor, inv);
    const verification = await this.provider.verify(reference);
    const outcome = await applyVerifiedPayment(this.prisma.db, this.provider, verification, 'callback');
    return { outcome, invoice: await this.get(actor, inv.id) };
  }

  /** Signed webhook: verify the signature over the exact raw bytes, persist durably, acknowledge; process retryably. */
  async webhook(providerName: 'paystack' | 'simulated', rawBody: Buffer | undefined, signature: string | undefined): Promise<{ received: boolean }> {
    if (!this.provider || this.provider.name !== providerName) throw new DomainError('NOT_FOUND', 'Not found');
    if (!rawBody || !this.provider.verifySignature(rawBody, signature)) {
      this.logger.warn(`Rejected ${providerName} webhook with an invalid signature`);
      throw new DomainError('FORBIDDEN', 'Invalid signature');
    }
    const recorded = await recordWebhookEvent(this.prisma.db, providerName, rawBody, true, this.provider.environment);
    if (!recorded.duplicate) {
      await enqueueOutbox(this.prisma.db, { type: 'payment.webhook', aggregateType: 'webhook', aggregateId: recorded.id, payload: { eventId: recorded.id, provider: providerName }, dedupeKey: `webhook:${recorded.id}` });
      // Best-effort immediate processing; the outbox retries if this fails or the process stops.
      const provider = this.provider;
      setImmediate(() => {
        processWebhookEvent(this.prisma.db, provider, recorded.id).catch((e) => this.logger.warn(`Webhook processing deferred to worker: ${String(e)}`));
      });
    }
    return { received: true };
  }

  // ───────────── Local simulator (development only) ─────────────

  async simulatorInfo(actor: Actor, reference: string) {
    if (this.provider?.name !== 'simulated') throw new DomainError('NOT_FOUND', 'Not found');
    const attempt = await this.prisma.db.paymentAttempt.findUnique({ where: { providerReference: reference } });
    if (!attempt) throw new DomainError('NOT_FOUND', 'Payment not found');
    const inv = await this.load(attempt.invoiceId);
    await this.authority(actor, inv);
    return { simulation: true, label: 'SIMULATED PAYMENT — no money moves. Development only.', reference, amountKobo: kobo(attempt.amountKobo), invoiceNumber: inv.number, status: attempt.status };
  }

  /** Creates a signed simulator event and runs it through the same webhook path as Paystack. */
  async simulate(actor: Actor, reference: string, outcome: 'success' | 'failed' | 'abandoned') {
    if (this.provider?.name !== 'simulated') throw new DomainError('NOT_FOUND', 'Not found');
    const attempt = await this.prisma.db.paymentAttempt.findUnique({ where: { providerReference: reference } });
    if (!attempt) throw new DomainError('NOT_FOUND', 'Payment not found');
    const inv = await this.load(attempt.invoiceId);
    const auth = await this.authority(actor, inv);
    if (!auth.canPay) throw new DomainError('FORBIDDEN', 'Only the payer can complete this simulated checkout');
    const body = Buffer.from(
      JSON.stringify({
        event: outcome === 'success' ? 'charge.success' : 'charge.failed',
        data: { id: `sim_${randomBytes(6).toString('hex')}`, reference, status: outcome, amount: Number(attempt.amountKobo), currency: 'NGN', paid_at: outcome === 'success' ? new Date().toISOString() : null, domain: 'simulated' },
      }),
    );
    // Sign and verify exactly as a real webhook would be, then reconcile through the shared path.
    const signature = (this.provider as SimulatedProvider).sign(body);
    if (!this.provider.verifySignature(body, signature)) throw new Error('Simulator signature mismatch');
    const recorded = await recordWebhookEvent(this.prisma.db, 'simulated', body, true, 'simulated');
    await processWebhookEvent(this.prisma.db, this.provider, recorded.id);
    return { simulation: true, outcome, invoice: await this.get(actor, inv.id) };
  }

  // ───────────── Documents ─────────────

  async invoiceDocument(actor: Actor, invoiceId: string): Promise<{ filename: string; html: string }> {
    const d = await this.get(actor, invoiceId);
    const rows = d.lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="n">${l.quantityKg ? esc(formatKg(l.quantityKg)) : ''}</td><td class="n">${esc(formatNaira(l.amountKobo))}</td></tr>`).join('');
    const adj = d.adjustments.map((a) => `<tr><td>Adjustment: ${esc(a.reason)}</td><td></td><td class="n">${esc(formatNaira(a.amountKobo))}</td></tr>`).join('');
    const pays = d.payments
      .map((p) => `<tr><td>${esc(p.method.replace(/_/g, ' '))} ${esc(p.payerReference ?? p.providerReference ?? '')}</td><td>${esc(p.verificationLabel)}</td><td class="n">${esc(formatNaira(p.amountKobo))}</td></tr>`)
      .join('');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(d.number)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;color:#1a1a1a}h1{color:#143E31}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}.n{text-align:right}.muted{color:#555;font-size:13px}</style></head><body>
<h1>${esc(INVOICE_KIND_LABELS[d.kind])} ${esc(d.number)}</h1>
<p>Booking ${esc(d.bookingReference)} · Issued ${esc(d.issuedAt.slice(0, 10))} · Due ${esc(d.dueAt.slice(0, 10))}</p>
<p><strong>From (payee):</strong> ${esc(d.payee.name)}<br><strong>To (payer):</strong> ${esc(d.payer.name)}</p>
<table><thead><tr><th>Description</th><th class="n">Quantity</th><th class="n">Amount</th></tr></thead><tbody>${rows}${adj}
<tr><th>Total</th><th></th><th class="n">${esc(formatNaira(d.totalKobo))}</th></tr></tbody></table>
<h2>Payments</h2><table><tbody>${pays || '<tr><td>No payments recorded</td></tr>'}</tbody></table>
<p><strong>Confirmed paid:</strong> ${esc(formatNaira(d.confirmedPaidKobo))} · <strong>Outstanding:</strong> ${esc(formatNaira(d.outstandingKobo))}</p>
<p class="muted">Amounts in Nigerian naira. "Reported by payer" means the payer says they paid; only "Confirmed by recipient" or "Verified by payment provider" count as received. HarvestSlot does not hold or transfer produce or freight money.${d.isDemo ? ' DEMONSTRATION DATA — not a real invoice.' : ''}</p>
</body></html>`;
    return { filename: `${d.number}.html`, html };
  }

  async acknowledgementDocument(actor: Actor, paymentId: string): Promise<{ filename: string; html: string }> {
    const attempt = await this.prisma.db.paymentAttempt.findUnique({ where: { id: paymentId } });
    if (!attempt) throw new DomainError('NOT_FOUND', 'Payment not found');
    const d = await this.get(actor, attempt.invoiceId);
    const p = d.payments.find((x) => x.id === paymentId)!;
    if (!['CONFIRMED_BY_RECIPIENT', 'PROVIDER_SUCCESS'].includes(p.status)) throw new DomainError('INVALID_STATE_TRANSITION', 'An acknowledgement is available once the payment is confirmed');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Payment acknowledgement</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:24px auto}h1{color:#143E31}</style></head><body>
<h1>Payment acknowledgement</h1>
<p>${esc(d.payee.name)} acknowledges receiving <strong>${esc(formatNaira(p.amountKobo))}</strong> from ${esc(d.payer.name)} against invoice ${esc(d.number)} (booking ${esc(d.bookingReference)}).</p>
<p>Reference: ${esc(p.payerReference ?? p.providerReference ?? '—')}<br>Status: ${esc(p.verificationLabel)}${p.receipt ? `<br>Confirmed by ${esc(p.receipt.decidedBy)} on ${esc(p.receipt.createdAt.slice(0, 10))}` : ''}</p>
${d.isDemo ? '<p><strong>DEMONSTRATION DATA — not a real acknowledgement.</strong></p>' : ''}
</body></html>`;
    return { filename: `acknowledgement-${d.number}-${paymentId.slice(0, 8)}.html`, html };
  }

  openDispute(invoiceId: string) {
    return hasOpenDispute(this.prisma.db, invoiceId);
  }
}
