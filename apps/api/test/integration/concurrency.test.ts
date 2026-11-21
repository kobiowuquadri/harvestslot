import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expireBookingIfDue, slotUsage, sweepExpiredHolds, withTransaction } from '@harvestslot/core';
import {
  bookingFlow,
  Client,
  expectOk,
  makeFarmer,
  makeHarvest,
  makeProcessor,
  makeTransporter,
  offerTerms,
  preparedFlow,
  startApp,
  type TestApp,
} from '../support/harness.js';

let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t.close();
});

describe('capacity and supply under concurrency (real PostgreSQL row locks)', () => {
  it('two simultaneous offers competing for the last capacity cannot both succeed', async () => {
    const processor = await makeProcessor(t.db, { capacityKg: '2000' });
    const f1 = await makeFarmer(t.db);
    const f2 = await makeFarmer(t.db);
    const h1 = await makeHarvest(t.db, f1, '2000');
    const h2 = await makeHarvest(t.db, f2, '2000');
    const a = new Client(t.app);
    await a.login(processor.manager.email!);
    const results = await Promise.all([
      a.post('/offers', { harvestRequestId: h1.id, ...offerTerms(processor.slot, '2000') }, { idem: true }),
      a.post('/offers', { harvestRequestId: h2.id, ...offerTerms(processor.slot, '2000') }, { idem: true }),
    ]);
    const ok = results.filter((r) => r.status === 201);
    const conflict = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(1);
    expect(conflict).toHaveLength(1);
    expect(conflict[0]!.body.error.code).toBe('CAPACITY_EXCEEDED');
    const usage = await slotUsage(t.db, processor.slot.id, new Date());
    expect(usage.heldG).toBe(2_000_000n);
    expect(usage.usedG <= usage.limitG).toBe(true);
  });

  it('a competing request cannot overbook remaining capacity (many parallel offers)', async () => {
    const processor = await makeProcessor(t.db, { capacityKg: '3000' });
    const a = new Client(t.app);
    await a.login(processor.manager.email!);
    const farmers = await Promise.all(Array.from({ length: 6 }, () => makeFarmer(t.db)));
    const harvests = await Promise.all(farmers.map((f) => makeHarvest(t.db, f, '1000')));
    const results = await Promise.all(harvests.map((h) => a.post('/offers', { harvestRequestId: h.id, ...offerTerms(processor.slot, '1000') }, { idem: true })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'CAPACITY_EXCEEDED')).toBe(true);
    const usage = await slotUsage(t.db, processor.slot.id, new Date());
    expect(usage.heldG).toBe(3_000_000n);
  });

  it('concurrent acceptances cannot allocate more than the harvest request supply', async () => {
    const farmer = await makeFarmer(t.db);
    const harvest = await makeHarvest(t.db, farmer, '2000');
    const p1 = await makeProcessor(t.db);
    const p2 = await makeProcessor(t.db);
    const m1 = new Client(t.app);
    await m1.login(p1.manager.email!);
    const m2 = new Client(t.app);
    await m2.login(p2.manager.email!);
    const o1 = expectOk(await m1.post('/offers', { harvestRequestId: harvest.id, ...offerTerms(p1.slot, '1500') }, { idem: true }));
    const o2 = expectOk(await m2.post('/offers', { harvestRequestId: harvest.id, ...offerTerms(p2.slot, '1500') }, { idem: true }));
    const fc = new Client(t.app);
    await fc.login(farmer.user!.email!);
    const results = await Promise.all([
      fc.post(`/offers/${o1.id}/accept`, { expectedVersionNo: 1 }, { idem: true }),
      fc.post(`/offers/${o2.id}/accept`, { expectedVersionNo: 1 }, { idem: true }),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const failed = results.find((r) => r.status !== 200)!;
    expect(['SUPPLY_EXCEEDED', 'INVALID_STATE_TRANSITION']).toContain(failed.body.error.code);
    const lots = await t.db.harvestLot.findMany({ where: { harvestRequestId: harvest.id, status: { not: 'RELEASED' } } });
    expect(lots.reduce((s, l) => s + Number(l.quantityKg), 0)).toBe(1500);
    // The losing offer lapsed and its capacity hold was released.
    const loser = await t.db.offer.findFirstOrThrow({ where: { harvestRequestId: harvest.id, status: { not: 'ACCEPTED' } }, include: { reservation: true } });
    expect(loser.status).toBe('LAPSED');
    expect(loser.reservation?.status).toBe('RELEASED');
  });
});

describe('sending draft offers', () => {
  it('two drafts sent at once cannot both take the last capacity', async () => {
    const processor = await makeProcessor(t.db, { capacityKg: '2500' });
    const m = new Client(t.app);
    await m.login(processor.manager.email!);
    const drafts = [];
    for (let i = 0; i < 2; i++) {
      const farmer = await makeFarmer(t.db);
      const harvest = await makeHarvest(t.db, farmer, '2000');
      drafts.push(expectOk(await m.post('/offers', { harvestRequestId: harvest.id, ...offerTerms(processor.slot), send: false }, { idem: true })));
    }
    // Drafts reserve nothing.
    expect((await slotUsage(t.db, processor.slot.id, new Date())).heldG).toBe(0n);
    const results = await Promise.all(drafts.map((d) => m.post(`/offers/${d.id}/send`, { expectedVersionNo: 1 }, { idem: true })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.find((r) => r.status !== 200)!.body.error.code).toBe('CAPACITY_EXCEEDED');
    expect((await slotUsage(t.db, processor.slot.id, new Date())).heldG).toBe(2_000_000n);
  });
});

describe('historical transport records', () => {
  it('the database still refuses overlapping confirmed trips for a driver', async () => {
    const a = await bookingFlow(t);
    const transporter = await makeTransporter(t.db);
    const startsAt = new Date(a.processor.slot.startsAt.getTime() - 16 * 3_600_000);
    const endsAt = new Date(a.processor.slot.startsAt.getTime() + 4 * 3_600_000);
    const quote = (vehicleId: string) =>
      t.db.transportQuote.create({
        data: {
          bookingId: a.bookingId,
          transporterOrgId: transporter.org.id,
          vehicleId,
          pickupWindowStart: startsAt,
          pickupWindowEnd: endsAt,
          deliveryWindowStart: startsAt,
          deliveryWindowEnd: endsAt,
          priceKobo: 1n,
          freightPayer: 'PROCESSOR',
          cancellationTerms: 'n/a',
          validUntil: endsAt,
          submittedByUserId: transporter.owner.id,
          status: 'DECLINED',
        },
      });
    const trip = (quoteId: string, vehicleId: string) => ({
      bookingId: a.bookingId,
      quoteId,
      transporterOrgId: transporter.org.id,
      vehicleId,
      driverId: transporter.driver.id,
      startsAt,
      endsAt,
      bufferMinutes: 0,
      blockStartsAt: startsAt,
      blockEndsAt: endsAt,
      status: 'CONFIRMED' as const,
    });
    const v1 = transporter.vehicles[0]!;
    const v2 = await t.db.vehicle.create({ data: { organisationId: transporter.org.id, registrationPlate: `X${Date.now().toString().slice(-8)}`, type: 'LIGHT_TRUCK', capacityKg: '3000' } });
    await t.db.tripReservation.create({ data: trip((await quote(v1.id)).id, v1.id) });
    await expect(t.db.tripReservation.create({ data: trip((await quote(v2.id)).id, v2.id) })).rejects.toThrow();
  });
});

describe('holds, expiry and duplicate actions', () => {
  it('confirmation racing hold expiry produces exactly one valid outcome', async () => {
    for (let i = 0; i < 3; i++) {
      const f = await preparedFlow(t);
      const expiresAt = new Date(Date.now() + 150);
      await t.db.reservation.update({ where: { bookingId: f.bookingId }, data: { expiresAt } });
      const version = (await t.db.booking.findUniqueOrThrow({ where: { id: f.bookingId } })).version;
      await new Promise((r) => setTimeout(r, 120));
      const [approve] = await Promise.all([
        f.rep.post(`/bookings/${f.bookingId}/approve`, { expectedVersion: version }, { idem: true }),
        (async () => {
          await new Promise((r) => setTimeout(r, 40));
          await sweepExpiredHolds(t.db, new Date(expiresAt.getTime() + 1));
        })(),
      ]);
      const b = await t.db.booking.findUniqueOrThrow({ where: { id: f.bookingId }, include: { reservation: true, harvestLot: true } });
      if (b.status === 'CONFIRMED') {
        expect(approve.status).toBe(200);
        expect(b.reservation!.status).toBe('CONFIRMED');
        expect(b.harvestLot!.status).toBe('ALLOCATED');
      } else {
        expect(b.status).toBe('EXPIRED');
        expect(approve.status).toBeGreaterThanOrEqual(400);
        expect(b.reservation!.status).toBe('EXPIRED');
        expect(b.harvestLot!.status).toBe('RELEASED');
      }
    }
  });

  it('read and write paths honour expires_at even when the sweeper has not run', async () => {
    const f = await preparedFlow(t);
    await t.db.reservation.update({ where: { bookingId: f.bookingId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    // Capacity is already free for others even though the row still says HELD.
    const usage = await slotUsage(t.db, f.processor.slot.id, new Date());
    expect(usage.heldG).toBe(0n);
    const version = (await t.db.booking.findUniqueOrThrow({ where: { id: f.bookingId } })).version;
    const res = await f.rep.post(`/bookings/${f.bookingId}/approve`, { expectedVersion: version }, { idem: true });
    expect(res.status).toBeGreaterThanOrEqual(400);
    // Reading the booking applies the expiry lazily, exactly once.
    const detail = expectOk(await f.manager.get(`/bookings/${f.bookingId}`));
    expect(detail.status).toBe('EXPIRED');
    expect(detail.nextStep.stage).toBe('Expired — not confirmed in time');
    expect(await withTransaction(t.db, (tx) => expireBookingIfDue(tx, f.bookingId, new Date()))).toBe(false);
    expect(detail.readiness.ready).toBe(false);
  });

  it('duplicate cancellations release capacity and supply exactly once', async () => {
    const f = await bookingFlow(t);
    const before = await slotUsage(t.db, f.processor.slot.id, new Date());
    const version = (await t.db.booking.findUniqueOrThrow({ where: { id: f.bookingId } })).version;
    const results = await Promise.all([
      f.farmerClient.post(`/bookings/${f.bookingId}/cancel`, { expectedVersion: version, reason: 'Change of plans for this field' }, { idem: true }),
      f.farmerClient.post(`/bookings/${f.bookingId}/cancel`, { expectedVersion: version, reason: 'Change of plans for this field' }, { idem: true }),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const after = await slotUsage(t.db, f.processor.slot.id, new Date());
    expect(before.committedG - after.committedG).toBe(2_000_000n);
    const b = await t.db.booking.findUniqueOrThrow({ where: { id: f.bookingId }, include: { reservation: true, harvestLot: true } });
    expect(b.status).toBe('CANCELLED');
    expect(b.reservation!.status).toBe('RELEASED');
    expect(b.harvestLot!.status).toBe('RELEASED');
    expect(await t.db.auditEvent.count({ where: { entityId: f.bookingId, action: 'booking.cancelled' } })).toBe(1);
    // Readiness is lost immediately.
    expect(b.lastReadiness).toBe(false);
  });

  it('expired offers release their hold and cannot be accepted', async () => {
    const farmer = await makeFarmer(t.db);
    const processor = await makeProcessor(t.db);
    const harvest = await makeHarvest(t.db, farmer);
    const m = new Client(t.app);
    await m.login(processor.manager.email!);
    const offer = expectOk(await m.post('/offers', { harvestRequestId: harvest.id, ...offerTerms(processor.slot) }, { idem: true }));
    await t.db.offer.update({ where: { id: offer.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await t.db.reservation.update({ where: { offerId: offer.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const fc = new Client(t.app);
    await fc.login(farmer.user!.email!);
    const res = await fc.post(`/offers/${offer.id}/accept`, { expectedVersionNo: 1 }, { idem: true });
    expect(res.body.error.code).toBe('OFFER_EXPIRED');
    const after = await t.db.offer.findUniqueOrThrow({ where: { id: offer.id }, include: { reservation: true } });
    expect(after.status).toBe('EXPIRED');
    expect(after.reservation!.status).toBe('EXPIRED');
  });
});

describe('capacity taken before acceptance', () => {
  it('an offer whose hold lapsed cannot be accepted once the space has gone to someone else', async () => {
    const processor = await makeProcessor(t.db, { capacityKg: '2500' });
    const m = new Client(t.app);
    await m.login(processor.manager.email!);
    const a = await makeFarmer(t.db);
    const ha = await makeHarvest(t.db, a, '2000');
    const offerA = expectOk(await m.post('/offers', { harvestRequestId: ha.id, ...offerTerms(processor.slot) }, { idem: true }));
    // The hold lapses (the offer itself is still open) and the space is offered to another farmer.
    await t.db.reservation.update({ where: { offerId: offerA.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const b = await makeFarmer(t.db);
    const hb = await makeHarvest(t.db, b, '2000');
    expectOk(await m.post('/offers', { harvestRequestId: hb.id, ...offerTerms(processor.slot) }, { idem: true }));
    const fa = new Client(t.app);
    await fa.login(a.user!.email!);
    const res = await fa.post(`/offers/${offerA.id}/accept`, { expectedVersionNo: 1 }, { idem: true });
    expect(res.body.error.code).toBe('HOLD_EXPIRED');
    expect(await t.db.booking.count({ where: { harvestRequestId: ha.id } })).toBe(0);
    expect((await slotUsage(t.db, processor.slot.id, new Date())).heldG).toBe(2_000_000n);
  });
});

describe('amendments', () => {
  it('a change invalidates stale approvals; a rejected change leaves the previous state intact', async () => {
    const f = await bookingFlow(t);
    let detail = expectOk(await f.manager.get(`/bookings/${f.bookingId}`));
    expect(detail.readiness.ready).toBe(true);
    const v1 = detail.current;

    // Processor proposes a price change: the farmer must agree again.
    detail = expectOk(await f.manager.post(`/bookings/${f.bookingId}/amendments`, { baseVersionNo: v1.versionNo, reason: 'Market price moved this week', priceKoboPerKg: 24_000 }, { idem: true }));
    expect(detail.pendingAmendment.pendingParties).toEqual(['FARMER']);
    expect(detail.readiness.ready).toBe(false);
    expect(detail.readiness.checks.find((c: { code: string }) => c.code === 'NO_BLOCKING_ISSUES').passed).toBe(false);

    // Confirming with the old version's hash is refused.
    const stale = await f.farmerClient.post(`/bookings/${f.bookingId}/confirm`, { termsVersionId: detail.pendingAmendment.terms.id, contentHash: v1.contentHash }, { idem: true });
    expect(stale.body.error.code).toBe('TERMS_CHANGED');

    // Farmer rejects: version 1 remains current, readiness returns.
    detail = expectOk(
      await f.farmerClient.post(
        `/bookings/${f.bookingId}/amendments/decide`,
        { termsVersionId: detail.pendingAmendment.terms.id, contentHash: detail.pendingAmendment.terms.contentHash, decision: 'REJECT', reason: 'I prefer the agreed price' },
        { idem: true },
      ),
    );
    expect(detail.current.versionNo).toBe(v1.versionNo);
    expect(detail.current.content.priceKoboPerKg).toBe(25_000);
    expect(detail.pendingAmendment).toBeNull();
    expect(detail.readiness.ready).toBe(true);
    expect(detail.status).toBe('CONFIRMED');

    // Changing how the produce gets there is material: the farmer agrees again before it applies.
    const s = f.processor.slot.startsAt.getTime();
    detail = expectOk(
      await f.manager.post(
        `/bookings/${f.bookingId}/amendments`,
        { baseVersionNo: v1.versionNo, reason: 'Our truck is in the workshop; please deliver', handoverArrangement: 'FARMER_DELIVERS', handoverWindowStart: new Date(s + 3_600_000).toISOString(), handoverWindowEnd: new Date(s + 4 * 3_600_000).toISOString(), farmerDeliveryCostKobo: 1_500_000 },
        { idem: true },
      ),
    );
    expect(detail.pendingAmendment.pendingParties).toEqual(['FARMER']);
    expect(detail.pendingAmendment.terms.changedFields).toContain('How the produce gets there');
    expect(detail.readiness.ready).toBe(false);
    detail = expectOk(
      await f.farmerClient.post(`/bookings/${f.bookingId}/amendments/decide`, { termsVersionId: detail.pendingAmendment.terms.id, contentHash: detail.pendingAmendment.terms.contentHash, decision: 'ACCEPT' }, { idem: true }),
    );
    // Version 2 was the rejected price change; the agreed handover change becomes version 3.
    expect(detail.current.versionNo).toBe(3);
    expect(detail.current.content.handover).toMatchObject({ arrangement: 'FARMER_DELIVERS', farmerDeliveryCostKobo: 1_500_000 });
    expect(detail.current.content.freightPayer).toBe('FARMER');
    expect(detail.readiness.ready).toBe(true);
    expect(detail.plan.sentence).toContain(' will deliver 2,000 kg to ');

    // A quantity increase needs the farmer again, and capacity is re-checked on acceptance.
    detail = expectOk(await f.manager.post(`/bookings/${f.bookingId}/amendments`, { baseVersionNo: detail.current.versionNo, reason: 'We can take a little more', quantityKg: '2100' }, { idem: true }));
    expect(detail.pendingAmendment.pendingParties).toEqual(['FARMER']);
  });
});

describe('delegation authority', () => {
  it('assist-only representatives prepare; approvers accept; revocation stops future actions', async () => {
    const processor = await makeProcessor(t.db);
    const farmer = await makeFarmer(t.db, { withAccount: false });
    const repUser = await (await import('../support/harness.js')).makeUser(t.db, 'rep');
    const coop = await (await import('../support/harness.js')).makeOrg(t.db, 'COOPERATIVE', repUser.id, ['REPRESENTATIVE']);
    await t.db.cooperativeMembership.create({ data: { cooperativeId: coop.id, farmerProfileId: farmer.profile.id } });
    const assist = await t.db.delegationConsent.create({
      data: { cooperativeId: coop.id, farmerProfileId: farmer.profile.id, scopes: ['ASSIST_DATA_ENTRY'], method: 'RECORDED_BY_REPRESENTATIVE', recordedByUserId: repUser.id, witnessName: 'Witness One' },
    });
    const harvest = await makeHarvest(t.db, farmer);
    const m = new Client(t.app);
    await m.login(processor.manager.email!);
    const offer = expectOk(await m.post('/offers', { harvestRequestId: harvest.id, ...offerTerms(processor.slot) }, { idem: true }));
    const rep = new Client(t.app);
    await rep.login(repUser.email!);

    const denied = await rep.post(`/offers/${offer.id}/accept`, { expectedVersionNo: 1 }, { idem: true });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('DELEGATION_SCOPE_MISSING');
    const prepared = expectOk(await rep.post(`/offers/${offer.id}/prepare-acceptance`, { expectedVersionNo: 1 }, { idem: true }));
    expect(prepared.status).toBe('DRAFT');
    const draft = expectOk(await rep.get(`/bookings/${prepared.bookingId}`));
    expect(draft.viewerActingFor.cooperativeName).toBe(coop.name);
    expect(draft.allowedActions).not.toContain('approveDraft');

    // Farmer grants approval authority (recorded consent replaces the old one).
    await t.db.delegationConsent.update({ where: { id: assist.id }, data: { revokedAt: new Date(), revokedByUserId: repUser.id, revokeReason: 'Replaced' } });
    const approve = await t.db.delegationConsent.create({
      data: { cooperativeId: coop.id, farmerProfileId: farmer.profile.id, scopes: ['ASSIST_DATA_ENTRY', 'APPROVE_SALE'], method: 'RECORDED_BY_REPRESENTATIVE', recordedByUserId: repUser.id, witnessName: 'Witness Two' },
    });
    const approved = expectOk(await rep.post(`/bookings/${prepared.bookingId}/approve`, { expectedVersion: draft.version }, { idem: true }));
    // The terms are complete (the buyer collects), so approval confirms the plan at once.
    expect(approved.status).toBe('CONFIRMED');
    const farmerConfirmation = await t.db.confirmation.findFirstOrThrow({ where: { bookingId: prepared.bookingId, party: 'FARMER' } });
    expect(farmerConfirmation.actorUserId).toBe(repUser.id);
    expect(farmerConfirmation.delegationId).toBe(approve.id);
    expect(farmerConfirmation.actingForFarmerId).toBe(farmer.profile.id);

    // Revocation: the representative loses access; the historical confirmation remains valid.
    await t.db.delegationConsent.update({ where: { id: approve.id }, data: { revokedAt: new Date(), revokedByUserId: repUser.id, revokeReason: 'Farmer withdrew consent' } });
    expect((await rep.get(`/bookings/${prepared.bookingId}`)).status).toBe(404);
    expect(await t.db.confirmation.count({ where: { id: farmerConfirmation.id } })).toBe(1);
  });
});
