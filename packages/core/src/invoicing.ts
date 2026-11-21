import {
  bpsOfKobo,
  formatKg,
  formatNaira,
  formatPricePerKg,
  produceAmountKobo,
  toGrams,
  type BookingTermsContent,
} from '@harvestslot/contracts';
import type { Db, Tx } from '@harvestslot/db';
import { audit } from './audit.js';
import { DomainError } from './errors.js';
import { bookingRecipients, notify, orgRecipients, farmerRecipients } from './notify.js';
import { nextReference } from './refs.js';
import { lockRow } from './tx.js';

const DAY = 86_400_000;
const PLATFORM_FEE_DUE_DAYS = 14;
const FREIGHT_DUE_DAYS = 7;

/** Payment statuses that count towards what the payee has actually received. */
export const COUNTED_PAYMENT_STATUSES = ['CONFIRMED_BY_RECIPIENT', 'PROVIDER_SUCCESS'] as const;
/** Reported but not yet confirmed/verified — counted against the overpayment guard, never as received. */
export const PENDING_PAYMENT_STATUSES = ['REPORTED', 'PROVIDER_PENDING'] as const;

async function currentTerms(db: Db, bookingId: string): Promise<{ id: string; content: BookingTermsContent }> {
  const booking = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { currentTermsVersionNo: true } });
  const terms = await db.bookingTermsVersion.findUniqueOrThrow({
    where: { bookingId_versionNo: { bookingId, versionNo: booking.currentTermsVersionNo } },
  });
  return { id: terms.id, content: terms.content as unknown as BookingTermsContent };
}

/**
 * Issues the produce invoice (processor → farmer) for the processor-accepted quantity, plus the
 * platform-fee invoice (processor → HarvestSlot) when a fee is part of the agreed terms. Idempotent:
 * an invoice of each kind is created at most once per booking (unique constraint).
 */
export async function issueReceivingInvoices(tx: Tx, bookingId: string, acceptedKg: string, now: Date): Promise<string[]> {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { id: true, reference: true, farmerProfileId: true, processorOrgId: true, isDemo: true, receivingRecord: { select: { id: true } } },
  });
  const terms = await currentTerms(tx, bookingId);
  const crop = await tx.crop.findUnique({ where: { code: terms.content.harvest.crop ?? 'CASSAVA' }, select: { label: true } });
  const price = BigInt(terms.content.priceKoboPerKg);
  const acceptedG = toGrams(acceptedKg);
  const produceKobo = produceAmountKobo(acceptedG, price);
  const created: string[] = [];

  const existing = await tx.invoice.findMany({ where: { bookingId }, select: { kind: true } });
  const has = (k: string) => existing.some((e) => e.kind === k);

  if (!has('PRODUCE')) {
    const inv = await tx.invoice.create({
      data: {
        number: await nextReference(tx, 'invoice'),
        kind: 'PRODUCE',
        bookingId,
        payerType: 'ORGANISATION',
        payerOrgId: booking.processorOrgId,
        payeeType: 'FARMER',
        payeeFarmerId: booking.farmerProfileId,
        subtotalKobo: produceKobo,
        totalKobo: produceKobo,
        dueAt: new Date(now.getTime() + terms.content.paymentTermsDays * DAY),
        termsVersionId: terms.id,
        receivingRecordId: booking.receivingRecord?.id ?? null,
        isDemo: booking.isDemo,
        lines: {
          create: [
            {
              description: `${crop?.label ?? 'Produce'} accepted for ${booking.reference}: ${formatKg(acceptedKg)} × ${formatPricePerKg(price)}`,
              quantityKg: acceptedKg,
              unitPriceKobo: price,
              amountKobo: produceKobo,
            },
          ],
        },
      },
    });
    created.push(inv.id);
    await audit(tx, { action: 'invoice.issued', entityType: 'invoice', entityId: inv.id, actorParty: 'SYSTEM', data: { kind: 'PRODUCE', totalKobo: produceKobo.toString() } });
    await notify(tx, {
      userIds: [
        ...(await farmerRecipients(tx, booking.farmerProfileId, 'VIEW_FINANCIALS', now)),
        ...(await orgRecipients(tx, booking.processorOrgId, ['OWNER', 'FINANCE_OFFICER'])),
      ],
      type: 'invoice.issued',
      category: 'payments',
      title: `Produce invoice ${inv.number}: ${formatNaira(produceKobo)}`,
      body: `For ${formatKg(acceptedKg)} accepted on ${booking.reference}. Due ${inv.dueAt.toISOString().slice(0, 10)}.`,
      link: `/invoices/${inv.id}`,
      bookingId,
      dedupeKey: `invoice-issued:${inv.id}`,
    });
  }

  const fee = terms.content.platformFee;
  if (fee.enabled && fee.bps > 0 && !has('PLATFORM_FEE')) {
    const feeKobo = bpsOfKobo(produceKobo, fee.bps);
    if (feeKobo > 0n) {
      const inv = await tx.invoice.create({
        data: {
          number: await nextReference(tx, 'invoice'),
          kind: 'PLATFORM_FEE',
          bookingId,
          payerType: 'ORGANISATION',
          payerOrgId: booking.processorOrgId,
          payeeType: 'PLATFORM',
          subtotalKobo: feeKobo,
          totalKobo: feeKobo,
          dueAt: new Date(now.getTime() + PLATFORM_FEE_DUE_DAYS * DAY),
          termsVersionId: terms.id,
          isDemo: booking.isDemo,
          lines: {
            create: [
              {
                description: `HarvestSlot service fee for ${booking.reference}: ${(fee.bps / 100).toFixed(2)}% of produce value ${formatNaira(produceKobo)}`,
                amountKobo: feeKobo,
              },
            ],
          },
        },
      });
      created.push(inv.id);
      await audit(tx, { action: 'invoice.issued', entityType: 'invoice', entityId: inv.id, actorParty: 'SYSTEM', data: { kind: 'PLATFORM_FEE', totalKobo: feeKobo.toString() } });
      await notify(tx, {
        userIds: await orgRecipients(tx, booking.processorOrgId, ['OWNER', 'FINANCE_OFFICER']),
        type: 'invoice.issued',
        category: 'payments',
        title: `HarvestSlot service fee ${inv.number}: ${formatNaira(feeKobo)}`,
        body: `Service fee for ${booking.reference}. This is separate from what you owe the farmer.`,
        link: `/invoices/${inv.id}`,
        bookingId,
        dedupeKey: `invoice-issued:${inv.id}`,
      });
    }
  }
  return created;
}

/** Freight invoice (freight payer → transporter), issued when delivery is confirmed. Idempotent. */
export async function issueFreightInvoice(tx: Tx, bookingId: string, now: Date): Promise<string | null> {
  const exists = await tx.invoice.findUnique({ where: { bookingId_kind: { bookingId, kind: 'FREIGHT' } }, select: { id: true } });
  if (exists) return null;
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { reference: true, farmerProfileId: true, processorOrgId: true, isDemo: true },
  });
  const terms = await currentTerms(tx, bookingId);
  const t = terms.content.transport;
  if (!t) return null;
  const amount = BigInt(t.priceKobo);
  if (amount <= 0n) return null;
  const inv = await tx.invoice.create({
    data: {
      number: await nextReference(tx, 'invoice'),
      kind: 'FREIGHT',
      bookingId,
      payerType: t.freightPayer === 'FARMER' ? 'FARMER' : 'ORGANISATION',
      payerOrgId: t.freightPayer === 'PROCESSOR' ? booking.processorOrgId : null,
      payerFarmerId: t.freightPayer === 'FARMER' ? booking.farmerProfileId : null,
      payeeType: 'ORGANISATION',
      payeeOrgId: t.transporterOrgId,
      subtotalKobo: amount,
      totalKobo: amount,
      dueAt: new Date(now.getTime() + FREIGHT_DUE_DAYS * DAY),
      termsVersionId: terms.id,
      isDemo: booking.isDemo,
      lines: {
        create: [
          {
            description: `Transport for ${booking.reference}: ${terms.content.harvest.pickupLocationLabel} → ${terms.content.facility.name} (${t.vehiclePlate})`,
            amountKobo: amount,
          },
        ],
      },
    },
  });
  await audit(tx, { action: 'invoice.issued', entityType: 'invoice', entityId: inv.id, actorParty: 'SYSTEM', data: { kind: 'FREIGHT', totalKobo: amount.toString() } });
  await notify(tx, {
    userIds: [
      ...(await orgRecipients(tx, t.transporterOrgId, ['OWNER'])),
      ...(t.freightPayer === 'PROCESSOR'
        ? await orgRecipients(tx, booking.processorOrgId, ['OWNER', 'FINANCE_OFFICER'])
        : await farmerRecipients(tx, booking.farmerProfileId, 'VIEW_FINANCIALS', now)),
    ],
    type: 'invoice.issued',
    category: 'payments',
    title: `Freight invoice ${inv.number}: ${formatNaira(amount)}`,
    body: `Transport for ${booking.reference}, payable by the ${t.freightPayer === 'FARMER' ? 'farmer' : 'processor'} to ${t.transporterName}.`,
    link: `/invoices/${inv.id}`,
    bookingId,
    dedupeKey: `invoice-issued:${inv.id}`,
  });
  return inv.id;
}

export interface InvoiceBalance {
  totalKobo: bigint;
  confirmedPaidKobo: bigint;
  pendingReportedKobo: bigint;
  outstandingKobo: bigint;
}

/** Recomputes cached totals and status from lines, adjustments, payments and refunds. Call after any change. */
export async function refreshInvoice(tx: Tx, invoiceId: string): Promise<InvoiceBalance> {
  const inv = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { lines: true, adjustments: true, payments: true, refunds: true },
  });
  const subtotal = inv.lines.reduce((s, l) => s + l.amountKobo, 0n);
  const adjustments = inv.adjustments.reduce((s, a) => s + a.amountKobo, 0n);
  const total = subtotal + adjustments;
  const paid = inv.payments
    .filter((p) => (COUNTED_PAYMENT_STATUSES as readonly string[]).includes(p.status))
    .reduce((s, p) => s + p.amountKobo, 0n);
  const refunded = inv.refunds
    .filter((r) => r.status === 'CONFIRMED_BY_RECIPIENT' || r.status === 'PROVIDER_PROCESSED')
    .reduce((s, r) => s + r.amountKobo, 0n);
  const confirmedPaid = paid - refunded;
  const pending = inv.payments
    .filter((p) => (PENDING_PAYMENT_STATUSES as readonly string[]).includes(p.status))
    .reduce((s, p) => s + p.amountKobo, 0n);
  if (total < 0n) throw new DomainError('INVALID_STATE_TRANSITION', 'Adjustments cannot make an invoice negative');
  if (confirmedPaid > total) {
    throw new DomainError('OVERPAYMENT', 'Confirmed payments would exceed the invoice total. Record a refund before reducing the total.');
  }
  const status = inv.status === 'VOID' ? 'VOID' : confirmedPaid >= total && total > 0n ? 'PAID' : confirmedPaid > 0n ? 'PARTIALLY_PAID' : total === 0n ? 'PAID' : 'ISSUED';
  await tx.invoice.update({
    where: { id: invoiceId },
    data: { subtotalKobo: subtotal, adjustmentsKobo: adjustments, totalKobo: total, confirmedPaidKobo: confirmedPaid, status, version: { increment: 1 } },
  });
  return { totalKobo: total, confirmedPaidKobo: confirmedPaid, pendingReportedKobo: pending, outstandingKobo: total - confirmedPaid };
}

export async function invoiceBalance(db: Db, invoiceId: string): Promise<InvoiceBalance> {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: { select: { status: true, amountKobo: true } } } });
  const pending = inv.payments
    .filter((p) => (PENDING_PAYMENT_STATUSES as readonly string[]).includes(p.status))
    .reduce((s, p) => s + p.amountKobo, 0n);
  return { totalKobo: inv.totalKobo, confirmedPaidKobo: inv.confirmedPaidKobo, pendingReportedKobo: pending, outstandingKobo: inv.totalKobo - inv.confirmedPaidKobo };
}

/**
 * Overpayment guard: confirmed + pending reports + new amount must not exceed the total.
 * This release has no overpayment workflow, so such a report is refused.
 */
export async function assertCanReportPayment(tx: Tx, invoiceId: string, amountKobo: bigint): Promise<void> {
  await lockRow(tx, 'invoices', invoiceId);
  const bal = await invoiceBalance(tx, invoiceId);
  if (bal.confirmedPaidKobo + bal.pendingReportedKobo + amountKobo > bal.totalKobo) {
    const room = bal.totalKobo - bal.confirmedPaidKobo - bal.pendingReportedKobo;
    throw new DomainError(
      'OVERPAYMENT',
      `This payment would exceed the invoice. At most ${formatNaira(room > 0n ? room : 0n)} can be reported while earlier reports await confirmation.`,
      { maxReportableKobo: Number(room > 0n ? room : 0n) },
    );
  }
}

export async function hasOpenDispute(db: Db, invoiceId: string): Promise<boolean> {
  return (await db.dispute.count({ where: { invoiceId, status: { notIn: ['RESOLVED', 'WITHDRAWN'] } } })) > 0;
}

export async function notifyPaymentEvent(
  tx: Tx,
  invoiceId: string,
  to: 'PAYER' | 'PAYEE',
  type: string,
  title: string,
  body: string,
  now: Date,
): Promise<void> {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const side = to === 'PAYER' ? { t: inv.payerType, org: inv.payerOrgId, farmer: inv.payerFarmerId } : { t: inv.payeeType, org: inv.payeeOrgId, farmer: inv.payeeFarmerId };
  let userIds: string[] = [];
  if (side.t === 'ORGANISATION' && side.org) userIds = await orgRecipients(tx, side.org, ['OWNER', 'FINANCE_OFFICER']);
  else if (side.t === 'FARMER' && side.farmer) userIds = await farmerRecipients(tx, side.farmer, 'VIEW_FINANCIALS', now);
  else if (side.t === 'PLATFORM') userIds = await bookingRecipients(tx, inv.bookingId, { admins: true });
  await notify(tx, { userIds, type, category: 'payments', title, body, link: `/invoices/${invoiceId}`, bookingId: inv.bookingId, dedupeKey: `${type}:${invoiceId}:${now.getTime()}` });
}
