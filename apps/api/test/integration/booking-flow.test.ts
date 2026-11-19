import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, expectOk, makeFarmer, makeHarvest, makeProcessor, makeTransporter, offerTerms, quoteTerms, startApp, type TestApp } from '../support/harness.js';

let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t.close();
});

describe('core booking slice: request → offer → acceptance → readiness (no transporter needed)', () => {
  it('reaches READY TO HARVEST as soon as both sides agree complete terms — no driver, vehicle or freight quote', async () => {
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

    // Other test files leave many identical fixture processors in this database; a better price
    // makes this one rank among the top results that matching returns.
    await t.db.facility.update({ where: { id: processor.facility.id }, data: { indicativePriceKoboPerKg: 40_000n } });
    // Matching explains each buyer in one sentence and reserves nothing.
    const matches = expectOk(await farmerClient.get(`/harvests/${harvest.id}/matches`));
    const match = matches.results.find((r: { facilityId: string }) => r.facilityId === processor.facility.id);
    expect(match.headline).toMatch(/^Can receive your full 2,000 kg (on|between) /);
    expect(matches.disclaimer).toMatch(/reserved/);
    // The farmer sends a request; the buyer's inbox shows it first with "Review harvest request".
    expectOk(await farmerClient.post(`/harvests/${harvest.id}/offer-requests`, { facilityId: processor.facility.id }));
    expect((await farmerClient.post(`/harvests/${harvest.id}/offer-requests`, { facilityId: processor.facility.id })).body.error.code).toBe('DUPLICATE');
    let h = expectOk(await farmerClient.get(`/harvests/${harvest.id}`));
    expect(h.requests[0]).toMatchObject({ facilityId: processor.facility.id, status: 'WAITING_FOR_OFFER' });
    expect(h.nextStep.stage).toBe('Waiting for the buyer’s offer');
    let inbox = expectOk(await manager.get(`/organisations/${processor.org.id}/inbox`));
    expect(inbox[0]).toMatchObject({ harvestRequestId: harvest.id, nextStep: 'Review harvest request', offer: null });
    expect(inbox[0].request.sentAt).toBeTruthy();

    // Without a handover decision the offer can only be a draft: private, nothing reserved.
    const { handoverArrangement: _omit, ...undecided } = offerTerms(processor.slot);
    expect((await manager.post('/offers', { harvestRequestId: harvest.id, ...undecided }, { idem: true })).body.error.details[0].path).toBe('handoverArrangement');
    const draft = expectOk(await manager.post('/offers', { harvestRequestId: harvest.id, ...undecided, send: false }, { idem: true }));
    expect(draft.status).toBe('DRAFT');
    expect(draft.hold).toBeNull();
    expect((await farmerClient.get(`/offers/${draft.id}`)).status).toBe(404);
    expect(expectOk(await manager.get(`/slots/${processor.slot.id}`)).usage.heldKg).toBe('0.000');
    expect((await manager.post(`/offers/${draft.id}/send`, { expectedVersionNo: 1 }, { idem: true })).body.error.code).toBe('VALIDATION_FAILED');

    // Deciding "we collect from the farm" and sending holds the capacity and tells the farmer.
    const offer = expectOk(await manager.post(`/offers/${draft.id}/revise`, { ...offerTerms(processor.slot), expectedVersionNo: 1, send: true }, { idem: true }));
    expect(offer.status).toBe('OPEN');
    expect(offer.hold.status).toBe('HELD');
    expect(offer.current.handoverArrangement).toBe('COLLECT_FROM_FARM');
    expect(offer.current.handoverPlace).toContain(h.farmLocation.label);
    expect(expectOk(await manager.get(`/slots/${processor.slot.id}`)).usage.heldKg).toBe('2000.000');
    h = expectOk(await farmerClient.get(`/harvests/${harvest.id}`));
    expect(h.requests[0].status).toBe('OFFER_RECEIVED');
    expect(h.nextStep.stage).toBe('Offer received');

    // The farmer accepts the exact version reviewed: the plan is confirmed and ready at once.
    const accepted = expectOk(await farmerClient.post(`/offers/${offer.id}/accept`, { expectedVersionNo: 2 }, { idem: true }));
    expect(accepted.status).toBe('CONFIRMED');
    const booking = expectOk(await farmerClient.get(`/bookings/${accepted.bookingId}`));
    expect(booking.readiness.ready).toBe(true);
    const codes = booking.readiness.checks.map((c: { code: string }) => c.code);
    expect(codes).toContain('HANDOVER_AGREED');
    expect(codes).not.toContain('TRANSPORT_ACCEPTED');
    expect(codes).not.toContain('VEHICLE_DRIVER_CONFIRMED');
    expect(booking.reservation.status).toBe('CONFIRMED');
    expect(booking.current.versionNo).toBe(1);
    expect(booking.current.content.handover.arrangement).toBe('COLLECT_FROM_FARM');
    expect(booking.plan.sentence.startsWith(`${processor.org.name} will collect 2,000 kg at `)).toBe(true);
    expect(booking.plan.sentence.endsWith(' for ₦250 per kg.')).toBe(true);
    expect(booking.nextStep).toMatchObject({ stage: 'Ready to harvest', actor: 'FARMER' });
    expect(booking.nextStep.forViewer).toMatch(/^Have 2,000 kg ready at /);
    const slotAfter = expectOk(await manager.get(`/slots/${processor.slot.id}`));
    expect(slotAfter.usage.committedKg).toBe('2000.000');
    expect(slotAfter.usage.heldKg).toBe('0.000');
    const buyerView = expectOk(await manager.get(`/bookings/${accepted.bookingId}`));
    expect(buyerView.nextStep.forViewer).toMatch(/^Collect 2,000 kg at .+ then record the weight you accept$/);
    expect(buyerView.allowedActions).toContain('recordWeight');

    // Transporters are not involved: no opportunity, and a quote is refused.
    const opps = expectOk(await dispatcher.get(`/organisations/${transporter.org.id}/opportunities`));
    expect(opps.some((o: { bookingId: string }) => o.bookingId === accepted.bookingId)).toBe(false);
    const quote = await dispatcher.post(`/organisations/${transporter.org.id}/quotes`, quoteTerms(accepted.bookingId, transporter.vehicles[0]!.id, processor.slot), { idem: true });
    expect(quote.body.error.code).toBe('INVALID_STATE_TRANSITION');
    expect(await t.db.tripReservation.count({ where: { bookingId: accepted.bookingId } })).toBe(0);

    const events = await t.db.readinessEvent.findMany({ where: { bookingId: accepted.bookingId }, orderBy: { createdAt: 'asc' } });
    expect(events.at(-1)?.ready).toBe(true);
    expect(await t.db.notification.count({ where: { userId: farmer.user!.id, type: 'readiness.gained' } })).toBe(1);
    inbox = expectOk(await manager.get(`/organisations/${processor.org.id}/inbox`));
    expect(inbox.some((i: { harvestRequestId: string }) => i.harvestRequestId === harvest.id)).toBe(false);
  });

  it('a buyer who cannot buy answers the request, and the farmer is not left waiting', async () => {
    const farmer = await makeFarmer(t.db);
    const processor = await makeProcessor(t.db);
    const harvest = await makeHarvest(t.db, farmer);
    const farmerClient = new Client(t.app);
    await farmerClient.login(farmer.user!.email!);
    const manager = new Client(t.app);
    await manager.login(processor.manager.email!);
    expectOk(await farmerClient.post(`/harvests/${harvest.id}/offer-requests`, { facilityId: processor.facility.id }));
    expectOk(await manager.post(`/organisations/${processor.org.id}/requests/${harvest.id}/decline`, { reason: 'Our line is full this week.' }));
    const h = expectOk(await farmerClient.get(`/harvests/${harvest.id}`));
    expect(h.requests[0]).toMatchObject({ status: 'DECLINED', declineReason: 'Our line is full this week.' });
    expect(h.nextStep.stage).toBe('Looking for a buyer');
    expect(await t.db.notification.count({ where: { userId: farmer.user!.id, type: 'offer.request-declined' } })).toBe(1);
    // Declined requests leave the buyer's queue; the farmer may ask again later.
    const inbox = expectOk(await manager.get(`/organisations/${processor.org.id}/inbox`));
    expect(inbox.some((i: { harvestRequestId: string }) => i.harvestRequestId === harvest.id)).toBe(false);
    expectOk(await farmerClient.post(`/harvests/${harvest.id}/offer-requests`, { facilityId: processor.facility.id }));
    expect(expectOk(await farmerClient.get(`/harvests/${harvest.id}`)).requests[0].status).toBe('WAITING_FOR_OFFER');
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

describe('time storage', () => {
  it('instants written by the app agree with the database clock whatever the server time zone', async () => {
    const farmer = await makeFarmer(t.db);
    const written = new Date();
    const harvest = await makeHarvest(t.db, farmer);
    const [row] = await t.db.$queryRaw<Array<{ skew: number; zone: string }>>`
      SELECT abs(extract(epoch FROM (now() - "publishedAt")))::float8 AS skew, current_setting('TimeZone') AS zone
        FROM harvest_requests WHERE id = ${harvest.id}::uuid`;
    expect(row!.zone).toBe('UTC');
    expect(row!.skew).toBeLessThan(60);
    // Read back through the app, the instant is unchanged.
    const back = await t.db.harvestRequest.findUniqueOrThrow({ where: { id: harvest.id } });
    expect(Math.abs(back.publishedAt!.getTime() - written.getTime())).toBeLessThan(60_000);
  });
});
