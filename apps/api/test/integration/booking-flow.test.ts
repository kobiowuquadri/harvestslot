import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, expectOk, makeFarmer, makeHarvest, makeProcessor, makeTransporter, offerTerms, quoteTerms, startApp, type TestApp } from '../support/harness.js';

let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t.close();
});

describe('core booking slice: request → offer → acceptance → transport → readiness', () => {
  it('reaches READY TO HARVEST only after every party confirms the complete plan', async () => {
    const farmer = await makeFarmer(t.db);
    const processor = await makeProcessor(t.db, { capacityKg: '5000' });
    const transporter = await makeTransporter(t.db);
    const harvest = await makeHarvest(t.db, farmer, '2000');

    const farmerClient = new Client(t.app);
    await farmerClient.login(farmer.user!.email!);
    const manager = new Client(t.app);
    await manager.login(processor.manager.email!);
    const dispatcher = new Client(t.app);
    await dispatcher.login(transporter.owner.email!);

    // Matching explains processors without reserving anything.
    const matches = expectOk(await farmerClient.get(`/harvests/${harvest.id}/matches`));
    expect(matches.results.some((r: { facilityId: string }) => r.facilityId === processor.facility.id)).toBe(true);
    expect(matches.disclaimer).toMatch(/reserved/);
    const slotBefore = expectOk(await manager.get(`/slots/${processor.slot.id}`));
    expect(slotBefore.usage.heldKg).toBe('0.000');

    // Processor inbox lists the request; the offer holds capacity.
    const inbox = expectOk(await manager.get(`/organisations/${processor.org.id}/inbox`));
    expect(inbox.some((i: { harvestRequestId: string }) => i.harvestRequestId === harvest.id)).toBe(true);
    const offer = expectOk(await manager.post('/offers', { harvestRequestId: harvest.id, ...offerTerms(processor.slot) }, { idem: true }));
    expect(offer.status).toBe('OPEN');
    expect(offer.hold.status).toBe('HELD');
    expect(expectOk(await manager.get(`/slots/${processor.slot.id}`)).usage.heldKg).toBe('2000.000');

    // Farmer accepts the exact version they reviewed.
    const accepted = expectOk(await farmerClient.post(`/offers/${offer.id}/accept`, { expectedVersionNo: 1 }, { idem: true }));
    expect(accepted.status).toBe('AWAITING_CONFIRMATIONS');
    let booking = expectOk(await farmerClient.get(`/bookings/${accepted.bookingId}`));
    expect(booking.readiness.ready).toBe(false);
    expect(booking.readiness.checks.find((c: { code: string }) => c.code === 'TRANSPORT_ACCEPTED').passed).toBe(false);
    expect(booking.current.content.platformFee.bps).toBe(150);

    // Transporter sees the opportunity and quotes; processor (freight payer) accepts.
    const opps = expectOk(await dispatcher.get(`/organisations/${transporter.org.id}/opportunities`));
    expect(opps.some((o: { bookingId: string }) => o.bookingId === accepted.bookingId)).toBe(true);
    const quote = expectOk(await dispatcher.post(`/organisations/${transporter.org.id}/quotes`, quoteTerms(accepted.bookingId, transporter.vehicles[0]!.id, processor.slot), { idem: true }));
    expect(quote.changesAgreedWindows).toBe(false);
    expectOk(await manager.post(`/quotes/${quote.id}/accept`, { expectedVersion: quote.version }, { idem: true }));

    booking = expectOk(await farmerClient.get(`/bookings/${accepted.bookingId}`));
    expect(booking.pendingAmendment.pendingParties).toEqual(['TRANSPORTER']);
    // Farmer's confirmation carried forward: processor-paid transport inside the agreed window changes nothing for them.
    const farmerConf = booking.pendingAmendment.terms.confirmations.find((c: { party: string }) => c.party === 'FARMER');
    expect(farmerConf.method).toBe('CARRIED_FORWARD');
    expect(booking.status).toBe('AWAITING_CONFIRMATIONS');

    // Transporter confirms with a driver → amendment accepted, hold promoted, booking confirmed, ready.
    expectOk(await dispatcher.post('/assignments/accept', { quoteId: quote.id, driverId: transporter.driver.id }, { idem: true }));
    booking = expectOk(await farmerClient.get(`/bookings/${accepted.bookingId}`));
    expect(booking.status).toBe('CONFIRMED');
    expect(booking.reservation.status).toBe('CONFIRMED');
    expect(booking.readiness.ready).toBe(true);
    expect(booking.current.versionNo).toBe(2);
    expect(booking.allowedActions).toContain('startHarvest');
    const slotAfter = expectOk(await manager.get(`/slots/${processor.slot.id}`));
    expect(slotAfter.usage.committedKg).toBe('2000.000');
    expect(slotAfter.usage.heldKg).toBe('0.000');

    const events = await t.db.readinessEvent.findMany({ where: { bookingId: accepted.bookingId }, orderBy: { createdAt: 'asc' } });
    expect(events.at(-1)?.ready).toBe(true);
    const notifications = await t.db.notification.count({ where: { userId: farmer.user!.id, type: 'readiness.gained' } });
    expect(notifications).toBe(1);
  });

  it('enforces tenant boundaries and server-side authority', async () => {
    const farmer = await makeFarmer(t.db);
    const other = await makeFarmer(t.db);
    const processor = await makeProcessor(t.db);
    const rival = await makeProcessor(t.db);
    const harvest = await makeHarvest(t.db, farmer);
    const manager = new Client(t.app);
    await manager.login(processor.manager.email!);
    const offer = expectOk(await manager.post('/offers', { harvestRequestId: harvest.id, ...offerTerms(processor.slot) }, { idem: true }));

    const otherFarmer = new Client(t.app);
    await otherFarmer.login(other.user!.email!);
    // Another farmer cannot see or accept this offer or the request.
    expect((await otherFarmer.get(`/offers/${offer.id}`)).status).toBe(404);
    expect((await otherFarmer.post(`/offers/${offer.id}/accept`, { expectedVersionNo: 1 }, { idem: true })).status).toBe(404);
    expect((await otherFarmer.get(`/farmers/${farmer.profile.id}`)).status).toBe(404);

    // A rival processor cannot read this processor's slots or offers.
    const rivalClient = new Client(t.app);
    await rivalClient.login(rival.manager.email!);
    expect((await rivalClient.get(`/slots/${processor.slot.id}`)).status).toBe(404);
    expect((await rivalClient.post(`/offers/${offer.id}/withdraw`, { expectedVersionNo: 1 })).status).toBe(404);

    // Receiving officers cannot make commercial offers.
    const receiving = new Client(t.app);
    await receiving.login(processor.receiving.email!);
    const denied = await receiving.post('/offers', { harvestRequestId: harvest.id, ...offerTerms(processor.slot, '500') }, { idem: true });
    expect(denied.status).toBe(403);

    // Unauthenticated and CSRF-less requests are refused.
    const anon = new Client(t.app);
    expect((await anon.get(`/bookings`)).status).toBe(401);
    const farmerClient = new Client(t.app);
    await farmerClient.login(farmer.user!.email!);
    const noCsrf = await farmerClient.post(`/offers/${offer.id}/decline`, { expectedVersionNo: 1 }, { noCsrf: true });
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe('CSRF_FAILED');
    const badOrigin = await farmerClient.post(`/offers/${offer.id}/decline`, { expectedVersionNo: 1 }, { origin: 'https://evil.example' });
    expect(badOrigin.body.error.code).toBe('CSRF_FAILED');
  });

  it('requires idempotency keys and replays duplicates without double allocation', async () => {
    const farmer = await makeFarmer(t.db);
    const processor = await makeProcessor(t.db);
    const harvest = await makeHarvest(t.db, farmer);
    const manager = new Client(t.app);
    await manager.login(processor.manager.email!);
    const offer = expectOk(await manager.post('/offers', { harvestRequestId: harvest.id, ...offerTerms(processor.slot) }, { idem: true }));
    const farmerClient = new Client(t.app);
    await farmerClient.login(farmer.user!.email!);

    const missing = await farmerClient.post(`/offers/${offer.id}/accept`, { expectedVersionNo: 1 });
    expect(missing.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const key = 'accept-key-0001';
    const first = expectOk(await farmerClient.post(`/offers/${offer.id}/accept`, { expectedVersionNo: 1 }, { idem: key }));
    const replay = await farmerClient.post(`/offers/${offer.id}/accept`, { expectedVersionNo: 1 }, { idem: key });
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.bookingId).toBe(first.bookingId);
    const reused = await farmerClient.post(`/offers/${offer.id}/accept`, { expectedVersionNo: 2 }, { idem: key });
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    // A new key re-attempting the same acceptance fails on state, not by creating a second booking.
    const again = await farmerClient.post(`/offers/${offer.id}/accept`, { expectedVersionNo: 1 }, { idem: true });
    expect(again.body.error.code).toBe('INVALID_STATE_TRANSITION');
    expect(await t.db.booking.count({ where: { offerId: offer.id } })).toBe(1);
    expect(await t.db.harvestLot.count({ where: { harvestRequestId: harvest.id } })).toBe(1);
  });
});
