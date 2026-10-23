import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { slotUsage } from '@harvestslot/core';
import { bookingFlow, Client, expectOk, makeUser, startApp, type Flow, type TestApp } from '../support/harness.js';

let t: TestApp;
let png: Buffer;
beforeAll(async () => {
  t = await startApp();
  png = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 30, g: 110, b: 60 } } }).png().toBuffer();
});
afterAll(async () => {
  await t.close();
});

/** Harvest → collection → handover → delivery, through the real endpoints. */
async function deliver(f: Flow, reportedKg = '1950') {
  let b = expectOk(await f.farmerClient.get(`/bookings/${f.bookingId}`));
  b = expectOk(await f.farmerClient.post(`/bookings/${f.bookingId}/start-harvest`, { expectedVersion: b.version }, { idem: true }));
  expect(b.status).toBe('ACTIVE');
  expectOk(await f.farmerClient.post(`/bookings/${f.bookingId}/ready-for-pickup`, { reportedHarvestedKg: '2000' }));

  const driver = new Client(t.app);
  await driver.login(f.transporter.driverUser.email!);
  const jobs = expectOk(await f.dispatcher.get(`/organisations/${f.transporter.org.id}/jobs`));
  let job = jobs.find((j: { bookingId: string }) => j.bookingId === f.bookingId);
  expect(job.pickup.exact).not.toBeNull();
  job = expectOk(await driver.post(`/shipments/${job.shipmentId}/depart`, { expectedVersion: job.version }));
  job = expectOk(await driver.post(`/shipments/${job.shipmentId}/arrive-pickup`, { expectedVersion: job.version, gps: { point: { lat: 7.5201, lng: 3.9199 }, accuracyM: 12, source: 'DEVICE_GPS' } }));

  // Driver uploads loading evidence (re-encoded, metadata stripped) and records the collection.
  const evidence = expectOk(await driver.upload({ purpose: 'PICKUP_EVIDENCE', bookingId: f.bookingId }, { buffer: png, filename: 'loading.png' }));
  expect(evidence.contentType).toBe('image/jpeg');
  expect(evidence.scanStatus).toBe('NOT_SCANNED');
  job = expectOk(await driver.post(`/shipments/${job.shipmentId}/collection`, { expectedVersion: job.version, quantityKg: reportedKg, evidenceAttachmentIds: [evidence.id] }, { idem: true }));
  expect(job.status).toBe('COLLECTED');

  // The driver cannot self-confirm the farmer's handover: a wrong code is refused.
  const wrong = await driver.post(`/shipments/${job.shipmentId}/pickup-code`, { code: '000000' });
  expect(wrong.status).toBe(422);
  const code = expectOk(await f.farmerClient.post(`/shipments/${job.shipmentId}/handover-code`, { purpose: 'PICKUP' }));
  job = expectOk(await driver.post(`/shipments/${job.shipmentId}/pickup-code`, { code: code.code }));
  expect(job.status).toBe('PICKUP_CONFIRMED');
  expect(job.pickupRecord.confirmationMethod).toBe('HANDOVER_CODE');
  job = expectOk(await driver.post(`/shipments/${job.shipmentId}/leave-pickup`, { expectedVersion: job.version }));
  job = expectOk(await driver.post(`/shipments/${job.shipmentId}/arrive-facility`, { expectedVersion: job.version }));

  // Receiving staff confirm receipt in their own account.
  const receiving = new Client(t.app);
  await receiving.login(f.processor.receiving.email!);
  expectOk(await receiving.post(`/shipments/${job.shipmentId}/confirm-delivery`, {}, { idem: true }));
  return { driver, receiving, shipmentId: job.shipmentId as string };
}

describe('fulfilment, receiving, invoices and payments (demo script steps 8–12)', () => {
  it('1,900 kg delivered → 1,800 accepted / 100 rejected → farmer accepts → invoices on 1,800 kg → payment confirmed by payee', async () => {
    const f = await bookingFlow(t, 'CONFIRMED');
    const { receiving } = await deliver(f);

    const freight = await t.db.invoice.findUniqueOrThrow({ where: { bookingId_kind: { bookingId: f.bookingId, kind: 'FREIGHT' } } });
    expect(freight.totalKobo).toBe(3_500_000n);
    expect(freight.payerOrgId).toBe(f.processor.org.id);

    let rec = expectOk(await receiving.post(`/bookings/${f.bookingId}/receiving/weighing`, { grossKg: '2400', tareKg: '500', weighingMethod: 'WEIGHBRIDGE', scaleReference: 'WB-1182' }));
    expect(rec.netKg).toBe('1900.000');
    const ticket = expectOk(await receiving.upload({ purpose: 'WEIGHT_EVIDENCE', bookingId: f.bookingId }, { buffer: png, filename: 'ticket.png' }));
    rec = expectOk(await receiving.post(`/bookings/${f.bookingId}/receiving/evidence`, { kind: 'WEIGHBRIDGE_TICKET', attachmentId: ticket.id, reference: 'WB-1182' }));
    // An uploaded ticket is a document, not independent verification.
    expect(rec.weightVerification).toBe('DOCUMENT_UPLOADED');

    const mismatch = await receiving.post(`/bookings/${f.bookingId}/receiving/decision`, { expectedVersion: rec.version, acceptedKg: '1800', rejectedKg: '50', rejectionReasons: ['ROTTEN_OR_DAMAGED'], rejectedDisposition: 'RETURNED_TO_FARMER' }, { idem: true });
    expect(mismatch.body.error.code).toBe('QUANTITY_MISMATCH');
    rec = expectOk(
      await receiving.post(
        `/bookings/${f.bookingId}/receiving/decision`,
        { expectedVersion: rec.version, acceptedKg: '1800', rejectedKg: '100', rejectionReasons: ['ROTTEN_OR_DAMAGED'], rejectionNote: 'Soft rot in two bags', rejectedDisposition: 'RETURNED_TO_FARMER', hoursSinceHarvest: 20 },
        { idem: true },
      ),
    );
    expect(rec.status).toBe('AWAITING_FARMER_REVIEW');
    expect(rec.materialDiscrepancy).toBe(true);
    expect(rec.estimatedProduceAmountKobo).toBe(45_000_000);
    // Nothing is invoiced until the farmer reviews; capacity used stays used.
    expect(await t.db.invoice.count({ where: { bookingId: f.bookingId, kind: 'PRODUCE' } })).toBe(0);
    const usage = await slotUsage(t.db, f.processor.slot.id, new Date());
    expect(usage.consumedG).toBe(2_000_000n);

    const review = expectOk(await f.farmerClient.get(`/bookings/${f.bookingId}/receiving`));
    expect(review.allowedActions).toEqual(expect.arrayContaining(['farmerAccept', 'farmerDispute']));
    expectOk(await f.farmerClient.post(`/bookings/${f.bookingId}/receiving/review`, { expectedVersion: review.version, decision: 'ACCEPTED', note: 'Fair' }, { idem: true }));
    const booking = expectOk(await f.farmerClient.get(`/bookings/${f.bookingId}`));
    expect(booking.status).toBe('COMPLETED');

    // Produce invoice uses the accepted 1,800 kg; the platform fee is separate and payable by the processor.
    const invoices = expectOk(await f.farmerClient.get(`/invoices?role=payee`));
    const produce = invoices.find((i: { bookingId: string; kind: string }) => i.bookingId === f.bookingId && i.kind === 'PRODUCE');
    expect(produce.totalKobo).toBe(45_000_000);
    expect(produce.lines[0].quantityKg).toBe('1800.000');
    const fee = await t.db.invoice.findUniqueOrThrow({ where: { bookingId_kind: { bookingId: f.bookingId, kind: 'PLATFORM_FEE' } } });
    expect(fee.totalKobo).toBe(675_000n);
    expect(fee.payerOrgId).toBe(f.processor.org.id);
    expect(fee.payeeType).toBe('PLATFORM');

    // Finance officer reports a partial payment with a screenshot: still only "reported".
    const finance = new Client(t.app);
    await finance.login(f.processor.finance.email!);
    const shot = expectOk(await finance.upload({ purpose: 'PAYMENT_EVIDENCE', bookingId: f.bookingId }, { buffer: png, filename: 'transfer.png' }));
    let inv = expectOk(await finance.post(`/invoices/${produce.id}/payments`, { method: 'BANK_TRANSFER', amountKobo: 30_000_000, payerReference: 'TRF-001', paidOn: new Date().toISOString().slice(0, 10), evidenceAttachmentIds: [shot.id] }, { idem: true }));
    expect(inv.payments[0].verificationLevel).toBe('REPORTED_BY_PAYER');
    expect(inv.confirmedPaidKobo).toBe(0);
    expect(inv.status).toBe('ISSUED');
    // The overpayment guard counts unconfirmed reports.
    const over = await finance.post(`/invoices/${produce.id}/payments`, { method: 'BANK_TRANSFER', amountKobo: 20_000_000, payerReference: 'TRF-002', paidOn: new Date().toISOString().slice(0, 10) }, { idem: true });
    expect(over.body.error.code).toBe('OVERPAYMENT');
    // The payer cannot confirm their own payment.
    expect((await finance.post(`/payments/${inv.payments[0].id}/receipt`, { decision: 'CONFIRMED' }, { idem: true })).status).toBe(403);

    // The farmer confirms receipt → partially paid with an exact balance.
    inv = expectOk(await f.farmerClient.post(`/payments/${inv.payments[0].id}/receipt`, { decision: 'CONFIRMED' }, { idem: true }));
    expect(inv.status).toBe('PARTIALLY_PAID');
    expect(inv.confirmedPaidKobo).toBe(30_000_000);
    expect(inv.outstandingKobo).toBe(15_000_000);
    expect(inv.payments[0].verificationLabel).toBe('Confirmed by recipient');
    inv = expectOk(await finance.post(`/invoices/${produce.id}/payments`, { method: 'BANK_TRANSFER', amountKobo: 15_000_000, payerReference: 'TRF-003', paidOn: new Date().toISOString().slice(0, 10) }, { idem: true }));
    inv = expectOk(await f.farmerClient.post(`/payments/${inv.payments[1].id}/receipt`, { decision: 'CONFIRMED' }, { idem: true }));
    expect(inv.status).toBe('PAID');
    expect(inv.outstandingKobo).toBe(0);
    const doc = await f.farmerClient.get(`/invoices/${produce.id}/document`);
    expect(doc.headers['content-disposition']).toMatch(/attachment/);
    const ack = await f.farmerClient.get(`/payments/${inv.payments[1].id}/acknowledgement`);
    expect(ack.status).toBe(200);
  });

  it('fee invoices reconcile through the simulator idempotently; duplicate and out-of-order events never double-credit', async () => {
    const f = await bookingFlow(t, 'CONFIRMED');
    const { receiving } = await deliver(f);
    let rec = expectOk(await receiving.post(`/bookings/${f.bookingId}/receiving/weighing`, { grossKg: '2000', tareKg: '0', weighingMethod: 'PLATFORM_SCALE' }));
    rec = expectOk(await receiving.post(`/bookings/${f.bookingId}/receiving/decision`, { expectedVersion: rec.version, acceptedKg: '2000', rejectedKg: '0' }, { idem: true }));
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
    const f = await bookingFlow(t, 'CONFIRMED');
    const { receiving } = await deliver(f);
    let rec = expectOk(await receiving.post(`/bookings/${f.bookingId}/receiving/weighing`, { grossKg: '1900', tareKg: '0', weighingMethod: 'PLATFORM_SCALE' }));
    rec = expectOk(await receiving.post(`/bookings/${f.bookingId}/receiving/decision`, { expectedVersion: rec.version, acceptedKg: '1800', rejectedKg: '100', rejectionReasons: ['UNDERSIZED'], rejectedDisposition: 'FARMER_COLLECTS' }, { idem: true }));
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

  it('transporter cancellation removes readiness and a replacement transport restores it', async () => {
    const f = await bookingFlow(t, 'CONFIRMED');
    const trip = await t.db.tripReservation.findFirstOrThrow({ where: { bookingId: f.bookingId, status: 'CONFIRMED' } });
    expectOk(await f.dispatcher.post(`/trips/${trip.id}/cancel`, { reason: 'Truck broke down on the way back from Iseyin' }, { idem: true }));
    let b = expectOk(await f.farmerClient.get(`/bookings/${f.bookingId}`));
    expect(b.status).toBe('CONFIRMED');
    expect(b.readiness.ready).toBe(false);
    expect(b.readiness.checks.find((c: { code: string }) => c.code === 'VEHICLE_DRIVER_CONFIRMED').passed).toBe(false);

    const opps = expectOk(await f.dispatcher.get(`/organisations/${f.transporter.org.id}/opportunities`));
    const opp = opps.find((o: { bookingId: string }) => o.bookingId === f.bookingId);
    expect(opp.reason).toBe('REPLACEMENT');
    const second = await t.db.vehicle.create({ data: { organisationId: f.transporter.org.id, registrationPlate: `R${Date.now().toString().slice(-7)}`, type: 'MEDIUM_TRUCK', capacityKg: '6000' } });
    await t.db.transportAvailability.create({ data: { organisationId: f.transporter.org.id, vehicleId: second.id, startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 20 * 86_400_000), createdByUserId: f.transporter.owner.id } });
    const { quoteTerms } = await import('../support/harness.js');
    const q = expectOk(await f.dispatcher.post(`/organisations/${f.transporter.org.id}/quotes`, quoteTerms(f.bookingId, second.id, f.processor.slot, 4_000_000), { idem: true }));
    expectOk(await f.manager.post(`/quotes/${q.id}/accept`, { expectedVersion: q.version }, { idem: true }));
    b = expectOk(await f.farmerClient.get(`/bookings/${f.bookingId}`));
    // Higher freight is the processor's obligation: farmer's confirmation carries forward.
    expect(b.pendingAmendment.pendingParties).toEqual(['TRANSPORTER']);
    expectOk(await f.dispatcher.post('/assignments/accept', { quoteId: q.id, driverId: f.transporter.driver.id }, { idem: true }));
    b = expectOk(await f.farmerClient.get(`/bookings/${f.bookingId}`));
    expect(b.readiness.ready).toBe(true);
    expect(b.current.content.transport.priceKobo).toBe(4_000_000);
    expect(b.current.reason).toBe('TRANSPORT_REPLACED');
  });

  it('uploads are validated by content and protected by object-level authorisation', async () => {
    const f = await bookingFlow(t, 'CONFIRMED');
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
