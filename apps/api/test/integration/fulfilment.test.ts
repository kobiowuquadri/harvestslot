import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { slotUsage } from '@harvestslot/core';
import { bookingFlow, Client, expectOk, makeFarmer, makeHarvest, makeProcessor, makeUser, offerTerms, startApp, type Flow, type TestApp } from '../support/harness.js';

let t: TestApp;
let png: Buffer;
beforeAll(async () => {
  t = await startApp();
  png = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 30, g: 110, b: 60 } } }).png().toBuffer();
});
afterAll(async () => {
  await t.close();
});

/** The buyer records the weight received and accepted, in one step from the booking. */
async function weigh(f: Flow, receivedKg: string, acceptedKg: string, extra: Record<string, unknown> = {}) {
  const receiving = new Client(t.app);
  await receiving.login(f.processor.receiving.email!);
  const b = expectOk(await receiving.get(`/bookings/${f.bookingId}`));
  expect(b.allowedActions).toContain('recordWeight');
  const rec = expectOk(await receiving.post(`/bookings/${f.bookingId}/receiving/accepted-weight`, { expectedVersion: b.version, receivedKg, acceptedKg, ...extra }, { idem: true }));
  return { receiving, rec };
}

describe('the simplified sale: offer → plan → accepted weight → payment (no driver, vehicle, freight quote or cooperative)', () => {
  it('2 tonnes at ₦100/kg collected from an Akinyele farm: ₦200,000 estimated, 1,900 kg accepted → ₦190,000 paid and confirmed', async () => {
    const farmer = await makeFarmer(t.db);
    const processor = await makeProcessor(t.db, { capacityKg: '5000' });
    const harvest = await makeHarvest(t.db, farmer, '2000');
    const location = await t.db.farmLocation.findUniqueOrThrow({ where: { id: harvest.farmLocationId } });
    expect(location.lga).toBe('Akinyele');
    const farmerClient = new Client(t.app);
    await farmerClient.login(farmer.user!.email!);
    const manager = new Client(t.app);
    await manager.login(processor.manager.email!);

    // The buyer offers ₦100/kg for the full 2,000 kg and will collect from the farm.
    const offer = expectOk(await manager.post('/offers', { harvestRequestId: harvest.id, ...offerTerms(processor.slot, '2000', 10_000, 'COLLECT_FROM_FARM') }, { idem: true }));
    // Before accepting, the farmer sees the estimated total, who brings the cassava and that it costs them nothing.
    const seen = expectOk(await farmerClient.get(`/offers/${offer.id}`));
    expect(seen.status).toBe('OPEN');
    expect(seen.current).toMatchObject({ quantityKg: '2000.000', priceKoboPerKg: 10_000, estimatedProduceAmountKobo: 20_000_000, handoverArrangement: 'COLLECT_FROM_FARM', farmerDeliveryCostKobo: null });
    expect(seen.current.handoverPlace).toContain('Akinyele');

    const accepted = expectOk(await farmerClient.post(`/offers/${offer.id}/accept`, { expectedVersionNo: 1 }, { idem: true }));
    expect(accepted.status).toBe('CONFIRMED');
    const f: Flow = { farmer, processor, harvestId: harvest.id, offerId: offer.id, bookingId: accepted.bookingId, farmerClient, manager };
    let plan = expectOk(await farmerClient.get(`/bookings/${f.bookingId}`));
    expect(plan.readiness.ready).toBe(true);
    expect(plan.plan.sentence).toMatch(/ will collect 2,000 kg at .*Akinyele.* for ₦100 per kg\.$/);
    expect(plan.plan.estimatedAmountKobo).toBe(20_000_000);
    expect(plan.nextStep.stage).toBe('Ready to harvest');
    expect(await t.db.transportQuote.count({ where: { bookingId: f.bookingId } })).toBe(0);
    expect(await t.db.tripReservation.count({ where: { bookingId: f.bookingId } })).toBe(0);

    // The buyer collects and records 1,900 kg received and accepted (within the 5% tolerance).
    const { rec } = await weigh(f, '1900', '1900');
    expect(rec.status).toBe('FINAL');
    plan = expectOk(await farmerClient.get(`/bookings/${f.bookingId}`));
    expect(plan.status).toBe('COMPLETED');
    expect(plan.plan.weighed).toMatchObject({ acceptedKg: '1900.000', shortfallKg: '100.000', finalAmountKobo: 19_000_000 });
    // The farmer can still report a problem with the weight.
    expect(plan.allowedActions).toContain('openDispute');
    const produce = await t.db.invoice.findUniqueOrThrow({ where: { bookingId_kind: { bookingId: f.bookingId, kind: 'PRODUCE' } } });
    expect(produce.totalKobo).toBe(19_000_000n);
    expect(await t.db.invoice.count({ where: { bookingId: f.bookingId, kind: 'FREIGHT' } })).toBe(0);

    // The buyer records the payment: it is only "reported" until the farmer confirms it.
    const buyerView = expectOk(await manager.get(`/bookings/${f.bookingId}`));
    expect(buyerView.allowedActions).toContain('recordPayment');
    expect(buyerView.nextStep.forViewer).toBe(`Record the payment of ₦190,000 to ${plan.current.content.farmer.displayName}`);
    let inv = expectOk(await manager.post(`/invoices/${produce.id}/payments`, { method: 'BANK_TRANSFER', amountKobo: 19_000_000, payerReference: 'TRF-190K', paidOn: new Date().toISOString().slice(0, 10) }, { idem: true }));
    expect(inv.confirmedPaidKobo).toBe(0);
    plan = expectOk(await farmerClient.get(`/bookings/${f.bookingId}`));
    expect(plan.nextStep).toMatchObject({ stage: 'Payment reported', forViewer: 'Confirm you received ₦190,000' });
    expect(plan.allowedActions).toContain('confirmPayment');
    expect(plan.plan.payment).toMatchObject({ reportedPendingKobo: 19_000_000, confirmedPaidKobo: 0 });

    inv = expectOk(await farmerClient.post(`/payments/${plan.plan.payment.pendingPaymentId}/receipt`, { decision: 'CONFIRMED' }, { idem: true }));
    expect(inv.status).toBe('PAID');
    plan = expectOk(await farmerClient.get(`/bookings/${f.bookingId}`));
    expect(plan.nextStep.stage).toBe('Paid — sale complete');
    expect(plan.plan.payment).toMatchObject({ confirmedPaidKobo: 19_000_000, outstandingKobo: 0 });
  });

  it('a material difference: the invoice for the accepted weight is issued at once and the farmer checks the weight', async () => {
    const f = await bookingFlow(t);
    // Accepting less than was received needs a reason.
    const version = (await t.db.booking.findUniqueOrThrow({ where: { id: f.bookingId } })).version;
    const missing = await f.manager.post(`/bookings/${f.bookingId}/receiving/accepted-weight`, { expectedVersion: version, receivedKg: '1900', acceptedKg: '1800' }, { idem: true });
    expect(missing.status).toBe(422);
    expect(missing.body.error.details[0].path).toBe('rejectionReasons');
    const { rec } = await weigh(f, '1900', '1800', { rejectionReasons: ['ROTTEN_OR_DAMAGED'], note: 'Soft rot in two bags' });
    expect(rec.status).toBe('AWAITING_FARMER_REVIEW');
    expect(rec.materialDiscrepancy).toBe(true);
    // Payment for the accepted weight is owed now; capacity used stays used.
    const produce = await t.db.invoice.findUniqueOrThrow({ where: { bookingId_kind: { bookingId: f.bookingId, kind: 'PRODUCE' } } });
    expect(produce.totalKobo).toBe(45_000_000n);
    expect((await slotUsage(t.db, f.processor.slot.id, new Date())).consumedG).toBe(2_000_000n);
    // A second recording is refused.
    const again = await f.manager.post(`/bookings/${f.bookingId}/receiving/accepted-weight`, { expectedVersion: (await t.db.booking.findUniqueOrThrow({ where: { id: f.bookingId } })).version, receivedKg: '1900', acceptedKg: '1900' }, { idem: true });
    expect(again.body.error.code).toBe('DUPLICATE');

    let plan = expectOk(await f.farmerClient.get(`/bookings/${f.bookingId}`));
    expect(plan.nextStep.stage).toBe('Weight recorded — farmer to check');
    expect(plan.nextStep.forViewer).toBe('Check the weight: 1,800 kg accepted (200 kg less than agreed). Agree, or report a problem.');
    expect(plan.allowedActions).toContain('reviewWeight');
    const review = expectOk(await f.farmerClient.get(`/bookings/${f.bookingId}/receiving`));
    expectOk(await f.farmerClient.post(`/bookings/${f.bookingId}/receiving/review`, { expectedVersion: review.version, decision: 'ACCEPTED', note: 'Fair' }, { idem: true }));
    plan = expectOk(await f.farmerClient.get(`/bookings/${f.bookingId}`));
    expect(plan.status).toBe('COMPLETED');
    expect(plan.plan.weighed.farmerDecision).toBe('AGREED');

    // The platform fee is separate and payable by the processor.
    const fee = await t.db.invoice.findUniqueOrThrow({ where: { bookingId_kind: { bookingId: f.bookingId, kind: 'PLATFORM_FEE' } } });
    expect(fee.totalKobo).toBe(675_000n);
    expect(fee.payerOrgId).toBe(f.processor.org.id);

    // Finance reports a partial payment with a screenshot: still only "reported"; the payer cannot confirm it.
    const finance = new Client(t.app);
    await finance.login(f.processor.finance.email!);
    const shot = expectOk(await finance.upload({ purpose: 'PAYMENT_EVIDENCE', bookingId: f.bookingId }, { buffer: png, filename: 'transfer.png' }));
    let inv = expectOk(await finance.post(`/invoices/${produce.id}/payments`, { method: 'BANK_TRANSFER', amountKobo: 30_000_000, payerReference: 'TRF-001', paidOn: new Date().toISOString().slice(0, 10), evidenceAttachmentIds: [shot.id] }, { idem: true }));
    expect(inv.payments[0].verificationLevel).toBe('REPORTED_BY_PAYER');
    expect(inv.confirmedPaidKobo).toBe(0);
    const over = await finance.post(`/invoices/${produce.id}/payments`, { method: 'BANK_TRANSFER', amountKobo: 20_000_000, payerReference: 'TRF-002', paidOn: new Date().toISOString().slice(0, 10) }, { idem: true });
    expect(over.body.error.code).toBe('OVERPAYMENT');
    expect((await finance.post(`/payments/${inv.payments[0].id}/receipt`, { decision: 'CONFIRMED' }, { idem: true })).status).toBe(403);
    inv = expectOk(await f.farmerClient.post(`/payments/${inv.payments[0].id}/receipt`, { decision: 'CONFIRMED' }, { idem: true }));
    expect(inv.status).toBe('PARTIALLY_PAID');
    expect(inv.outstandingKobo).toBe(15_000_000);
    expect(inv.payments[0].verificationLabel).toBe('Confirmed by recipient');
    const doc = await f.farmerClient.get(`/invoices/${produce.id}/document`);
    expect(doc.headers['content-disposition']).toMatch(/attachment/);
  });

  it('fee invoices reconcile through the simulator idempotently; duplicate and out-of-order events never double-credit', async () => {
    const f = await bookingFlow(t);
    const { rec } = await weigh(f, '2000', '2000');
    expect(rec.status).toBe('FINAL');
    const fee = await t.db.invoice.findUniqueOrThrow({ where: { bookingId_kind: { bookingId: f.bookingId, kind: 'PLATFORM_FEE' } } });
    const finance = new Client(t.app);
    await finance.login(f.processor.finance.email!);
    // Produce invoices cannot use online checkout (no custody of produce money).
    const produce = await t.db.invoice.findUniqueOrThrow({ where: { bookingId_kind: { bookingId: f.bookingId, kind: 'PRODUCE' } } });
    expect((await finance.post(`/invoices/${produce.id}/checkout`, {}, { idem: true })).body.error.code).toBe('BAD_REQUEST');

    const checkout = expectOk(await finance.post(`/invoices/${fee.id}/checkout`, {}, { idem: true }));
    expect(checkout.provider).toBe('simulated');
    expect(checkout.checkoutUrl).toContain('/dev/payment-simulator/');
    const info = expectOk(await finance.get(`/dev/payment-simulator/${checkout.reference}`));
    expect(info.label).toMatch(/SIMULATED/);
    const first = expectOk(await finance.post(`/dev/payment-simulator/${checkout.reference}`, { outcome: 'success' }));
    expect(first.invoice.status).toBe('PAID');
    expect(first.invoice.payments[0].verificationLevel).toBe('SIMULATED');
    // Replay success and an out-of-order failure for the same reference.
    await finance.post(`/dev/payment-simulator/${checkout.reference}`, { outcome: 'success' });
    await finance.post(`/dev/payment-simulator/${checkout.reference}`, { outcome: 'failed' });
    const after = await t.db.invoice.findUniqueOrThrow({ where: { id: fee.id }, include: { payments: true } });
    expect(after.confirmedPaidKobo).toBe(fee.totalKobo);
    expect(after.status).toBe('PAID');
    expect(after.payments).toHaveLength(1);
    expect(after.payments[0]!.status).toBe('PROVIDER_SUCCESS');

    // A forged webhook without a valid signature is refused.
    const res = await finance.post('/webhooks/paystack', { event: 'charge.success', data: { reference: checkout.reference } }, { noCsrf: true });
    expect([403, 404]).toContain(res.status);
  });

  it('partial acceptance can be disputed; the undisputed amount is invoiced and the admin resolution adds an audited adjustment', async () => {
    const f = await bookingFlow(t);
    let { rec } = await weigh(f, '1900', '1800', { rejectionReasons: ['UNDERSIZED'] });
    rec = expectOk(
      await f.farmerClient.post(
        `/bookings/${f.bookingId}/receiving/review`,
        { expectedVersion: rec.version, decision: 'DISPUTED', dispute: { category: 'QUALITY_REJECTION', quantityInQuestionKg: '100', description: 'These roots were within the agreed size; I have photos.' } },
        { idem: true },
      ),
    );
    expect(rec.status).toBe('DISPUTED');
    const produce = await t.db.invoice.findUniqueOrThrow({ where: { bookingId_kind: { bookingId: f.bookingId, kind: 'PRODUCE' } } });
    expect(produce.totalKobo).toBe(45_000_000n);
    const disputes = expectOk(await f.manager.get(`/disputes?bookingId=${f.bookingId}`));
    expect(disputes).toHaveLength(1);
    const dispute = disputes[0];
    expect(dispute.status).toBe('AWAITING_RESPONSE');
    expectOk(await f.manager.post(`/disputes/${dispute.id}/messages`, { body: 'We stand by the grading but will review the photos.' }));

    const adminUser = await makeUser(t.db, 'admin', { platformRole: 'ADMIN' });
    const admin = new Client(t.app);
    await admin.login(adminUser.email!);
    const resolved = expectOk(
      await admin.post(`/disputes/${dispute.id}/resolve`, { outcome: 'Half of the rejected roots accepted', rationale: 'Photos show about half of the rejected bags met the agreed size criteria.', revisedAcceptedKg: '1850' }, { idem: true }),
    );
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolution.adjustmentKobo).toBe(1_250_000);
    expect(resolved.resolution.note).toMatch(/no transfer or refund is implied/);
    const adjusted = await t.db.invoice.findUniqueOrThrow({ where: { id: produce.id } });
    expect(adjusted.totalKobo).toBe(46_250_000n);
    expect(adjusted.confirmedPaidKobo).toBe(0n);
    const booking = await t.db.booking.findUniqueOrThrow({ where: { id: f.bookingId } });
    expect(booking.status).toBe('COMPLETED');
    expect(await t.db.auditEvent.count({ where: { entityId: dispute.id, action: 'dispute.resolved' } })).toBe(1);
  });

  it('a sale cancelled before the handover frees capacity and supply, and nothing is invoiced', async () => {
    const f = await bookingFlow(t);
    const b = expectOk(await f.farmerClient.get(`/bookings/${f.bookingId}`));
    expect(b.allowedActions).toContain('cancel');
    const cancelled = expectOk(await f.manager.post(`/bookings/${f.bookingId}/cancel`, { expectedVersion: b.version, reason: 'Our grating line is down for repairs this week' }, { idem: true }));
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.nextStep.actor).toBe('NONE');
    expect((await slotUsage(t.db, f.processor.slot.id, new Date())).committedG).toBe(0n);
    expect(await t.db.invoice.count({ where: { bookingId: f.bookingId } })).toBe(0);
    const recorded = await f.manager.post(`/bookings/${f.bookingId}/receiving/accepted-weight`, { expectedVersion: cancelled.version, receivedKg: '2000', acceptedKg: '2000' }, { idem: true });
    expect(recorded.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('uploads are validated by content and protected by object-level authorisation', async () => {
    const f = await bookingFlow(t);
    const fake = await f.manager.upload({ purpose: 'WEIGHT_EVIDENCE', bookingId: f.bookingId }, { buffer: Buffer.from('<script>alert(1)</script>'), filename: 'ticket.jpg' });
    expect(fake.body.error.code).toBe('UPLOAD_REJECTED');
    const ok = expectOk(await f.manager.upload({ purpose: 'WEIGHT_EVIDENCE', bookingId: f.bookingId }, { buffer: png, filename: 'ok.png' }));
    const stranger = new Client(t.app);
    await stranger.login((await makeUser(t.db, 'stranger')).email!);
    expect((await stranger.get(`/attachments/${ok.id}`)).status).toBe(404);
    const link = expectOk(await f.farmerClient.get(`/attachments/${ok.id}/link`));
    const content = await f.farmerClient.get(link.url.replace('/api/v1', ''));
    expect(content.status).toBe(200);
    expect(content.headers['x-content-type-options']).toBe('nosniff');
    // A link is bound to the user it was issued to.
    expect((await stranger.get(link.url.replace('/api/v1', ''))).status).toBe(403);
  });
});
