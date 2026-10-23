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
  quoteTerms,
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

describe('vehicles and drivers', () => {
  it('a vehicle cannot be double-booked by concurrent quote acceptances', async () => {
    const processor = await makeProcessor(t.db, { capacityKg: '8000' });
    const transporter = await makeTransporter(t.db);
    const a = await bookingFlow(t, 'AWAITING', { processor, transporter });
    const b = await bookingFlow(t, 'AWAITING', { processor, transporter });
    const vehicle = transporter.vehicles[0]!;
    const q1 = expectOk(await a.dispatcher.post(`/organisations/${transporter.org.id}/quotes`, quoteTerms(a.bookingId, vehicle.id, processor.slot), { idem: true }));
    const q2 = expectOk(await a.dispatcher.post(`/organisations/${transporter.org.id}/quotes`, quoteTerms(b.bookingId, vehicle.id, processor.slot), { idem: true }));
    const results = await Promise.all([
      a.manager.post(`/quotes/${q1.id}/accept`, { expectedVersion: q1.version }, { idem: true }),
      a.manager.post(`/quotes/${q2.id}/accept`, { expectedVersion: q2.version }, { idem: true }),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.find((r) => r.status !== 200)!.body.error.code).toBe('VEHICLE_CONFLICT');
    expect(await t.db.tripReservation.count({ where: { vehicleId: vehicle.id, status: { in: ['HELD', 'CONFIRMED'] } } })).toBe(1);
  });

  it('the database exclusion constraint rejects overlapping confirmed trips for a driver', async () => {
    const a = await bookingFlow(t, 'CONFIRMED');
    const trip = await t.db.tripReservation.findFirstOrThrow({ where: { bookingId: a.bookingId, status: 'CONFIRMED' } });
    const otherVehicle = await t.db.vehicle.create({ data: { organisationId: a.transporter.org.id, registrationPlate: `X${Date.now().toString().slice(-8)}`, type: 'LIGHT_TRUCK', capacityKg: '3000' } });
    const otherQuote = await t.db.transportQuote.create({
      data: {
        bookingId: a.bookingId,
        transporterOrgId: a.transporter.org.id,
        vehicleId: otherVehicle.id,
        pickupWindowStart: trip.startsAt,
        pickupWindowEnd: trip.endsAt,
        deliveryWindowStart: trip.startsAt,
        deliveryWindowEnd: trip.endsAt,
        priceKobo: 1n,
        freightPayer: 'PROCESSOR',
        cancellationTerms: 'n/a',
        validUntil: trip.endsAt,
        submittedByUserId: a.transporter.owner.id,
        status: 'DECLINED',
      },
    });
    await expect(
      t.db.tripReservation.create({
        data: {
          bookingId: a.bookingId,
          quoteId: otherQuote.id,
          transporterOrgId: a.transporter.org.id,
          vehicleId: otherVehicle.id,
          driverId: trip.driverId,
          startsAt: trip.startsAt,
          endsAt: trip.endsAt,
          bufferMinutes: 0,
          blockStartsAt: trip.startsAt,
          blockEndsAt: trip.endsAt,
          status: 'CONFIRMED',
        },
      }),
    ).rejects.toThrow();
  });
});

describe('holds, expiry and duplicate actions', () => {
  it('confirmation racing hold expiry produces exactly one valid outcome', async () => {
    for (let i = 0; i < 3; i++) {
      const f = await bookingFlow(t, 'QUOTE_ACCEPTED');
      const expiresAt = new Date(Date.now() + 150);
      await t.db.reservation.update({ where: { bookingId: f.bookingId }, data: { expiresAt } });
      await t.db.tripReservation.updateMany({ where: { bookingId: f.bookingId, status: 'HELD' }, data: { expiresAt: new Date(Date.now() + 3_600_000) } });
      await new Promise((r) => setTimeout(r, 120));
      const [confirm] = await Promise.all([
        f.dispatcher.post('/assignments/accept', { quoteId: f.quoteId, driverId: f.transporter.driver.id }, { idem: true }),
        (async () => {
          await new Promise((r) => setTimeout(r, 40));
          await sweepExpiredHolds(t.db, new Date(expiresAt.getTime() + 1));
        })(),
      ]);
      const b = await t.db.booking.findUniqueOrThrow({ where: { id: f.bookingId }, include: { reservation: true, harvestLot: true } });
      if (b.status === 'CONFIRMED') {
        expect(confirm.status).toBe(200);
        expect(b.reservation!.status).toBe('CONFIRMED');
        expect(b.harvestLot!.status).toBe('ALLOCATED');
      } else {
        expect(b.status).toBe('EXPIRED');
        expect(confirm.status).toBe(409);
        expect(b.reservation!.status).toBe('EXPIRED');
        expect(b.harvestLot!.status).toBe('RELEASED');
        expect(await t.db.tripReservation.count({ where: { bookingId: f.bookingId, status: { in: ['HELD', 'CONFIRMED'] } } })).toBe(0);
      }
    }
  });

  it('read and write paths honour expires_at even when the sweeper has not run', async () => {
    const f = await bookingFlow(t, 'QUOTE_ACCEPTED');
    await t.db.reservation.update({ where: { bookingId: f.bookingId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    // Capacity is already free for others even though the row still says HELD.
    const usage = await slotUsage(t.db, f.processor.slot.id, new Date());
    expect(usage.heldG).toBe(0n);
    const res = await f.dispatcher.post('/assignments/accept', { quoteId: f.quoteId, driverId: f.transporter.driver.id }, { idem: true });
    expect(res.status).toBe(409);
    // Reading the booking applies the expiry lazily, exactly once.
    const detail = expectOk(await f.farmerClient.get(`/bookings/${f.bookingId}`));
    expect(detail.status).toBe('EXPIRED');
    expect(await withTransaction(t.db, (tx) => expireBookingIfDue(tx, f.bookingId, new Date()))).toBe(false);
    expect(detail.readiness.ready).toBe(false);
  });

  it('duplicate cancellations release capacity and supply exactly once', async () => {
    const f = await bookingFlow(t, 'CONFIRMED');
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
    // Readiness lost immediately and the trip is freed.
    expect(b.lastReadiness).toBe(false);
    expect(await t.db.tripReservation.count({ where: { bookingId: f.bookingId, status: 'CONFIRMED' } })).toBe(0);
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

describe('amendments', () => {
  it('a change invalidates stale approvals; a rejected change leaves the previous state intact', async () => {
    const f = await bookingFlow(t, 'CONFIRMED');
    let detail = expectOk(await f.manager.get(`/bookings/${f.bookingId}`));
    expect(detail.readiness.ready).toBe(true);
    const v2 = detail.current;

    // Processor proposes a price change: the farmer must re-confirm; the transporter's terms are unchanged.
    detail = expectOk(await f.manager.post(`/bookings/${f.bookingId}/amendments`, { baseVersionNo: v2.versionNo, reason: 'Market price moved this week', priceKoboPerKg: 24_000 }, { idem: true }));
    expect(detail.pendingAmendment.pendingParties).toEqual(['FARMER']);
    expect(detail.readiness.ready).toBe(false);
    expect(detail.readiness.checks.find((c: { code: string }) => c.code === 'NO_BLOCKING_ISSUES').passed).toBe(false);
    const transporterConf = detail.pendingAmendment.terms.confirmations.find((c: { party: string }) => c.party === 'TRANSPORTER');
    expect(transporterConf.method).toBe('CARRIED_FORWARD');

    // Confirming with the old version's hash is refused.
    const stale = await f.farmerClient.post(`/bookings/${f.bookingId}/confirm`, { termsVersionId: detail.pendingAmendment.terms.id, contentHash: v2.contentHash }, { idem: true });
    expect(stale.body.error.code).toBe('TERMS_CHANGED');

    // Farmer rejects: version 2 remains current, readiness returns.
    detail = expectOk(
      await f.farmerClient.post(
        `/bookings/${f.bookingId}/amendments/decide`,
        { termsVersionId: detail.pendingAmendment.terms.id, contentHash: detail.pendingAmendment.terms.contentHash, decision: 'REJECT', reason: 'I prefer the agreed price' },
        { idem: true },
      ),
    );
    expect(detail.current.versionNo).toBe(v2.versionNo);
    expect(detail.current.content.priceKoboPerKg).toBe(25_000);
    expect(detail.pendingAmendment).toBeNull();
    expect(detail.readiness.ready).toBe(true);
    expect(detail.status).toBe('CONFIRMED');

    // A quantity increase needs everyone (transporter load changes) and capacity re-checks on acceptance.
    detail = expectOk(await f.manager.post(`/bookings/${f.bookingId}/amendments`, { baseVersionNo: v2.versionNo, reason: 'We can take a little more', quantityKg: '2100' }, { idem: true }));
    expect(detail.pendingAmendment.pendingParties.sort()).toEqual(['FARMER', 'TRANSPORTER']);
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
    expect(approved.status).toBe('AWAITING_CONFIRMATIONS');
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
