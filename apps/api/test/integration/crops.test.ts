import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, expectOk, makeFarmer, makeProcessor, makeUser, offerTerms, startApp, type TestApp } from '../support/harness.js';

let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t.close();
});

const day = 86_400_000;
const lagosDate = (offsetDays: number) => new Date(Date.now() + offsetDays * day + 3_600_000).toISOString().slice(0, 10);

describe('crops: a harvest is only matched, requested, offered and booked with buyers of the same crop', () => {
  it('keeps tomatoes and cassava apart from the harvest form to the booking and invoice', async () => {
    const farmer = await makeFarmer(t.db);
    const cassavaBuyer = await makeProcessor(t.db, { crop: 'CASSAVA' });
    const tomatoBuyer = await makeProcessor(t.db, { crop: 'TOMATO' });
    // Other test files leave many fixture buyers behind; a better price keeps these two near the top.
    await t.db.facility.updateMany({ where: { id: { in: [cassavaBuyer.facility.id, tomatoBuyer.facility.id] } }, data: { indicativePriceKoboPerKg: 60_000n } });

    const farmerClient = new Client(t.app);
    await farmerClient.login(farmer.user!.email!);
    const cassavaManager = new Client(t.app);
    await cassavaManager.login(cassavaBuyer.manager.email!);
    const tomatoManager = new Client(t.app);
    await tomatoManager.login(tomatoBuyer.manager.email!);

    // The farmer says what is for sale in the same form as where and when.
    const harvest = expectOk(
      await farmerClient.post(
        `/farmers/${farmer.profile.id}/harvests`,
        { crop: 'TOMATO', farmLocationId: farmer.location.id, estimatedQuantityKg: '900', earliestHarvestDate: lagosDate(1), latestHarvestDate: lagosDate(6), publish: true },
        { idem: true },
      ),
      201,
    );
    expect(harvest.crop).toBe('TOMATO');

    // Matching only suggests tomato buyers.
    const matches = expectOk(await farmerClient.get(`/harvests/${harvest.id}/matches`));
    const ids = matches.results.map((r: { facilityId: string }) => r.facilityId);
    expect(ids).toContain(tomatoBuyer.facility.id);
    expect(ids).not.toContain(cassavaBuyer.facility.id);
    const tomatoLines = await t.db.processingLine.findMany({ where: { crop: 'TOMATO' }, select: { facilityId: true } });
    expect(ids.every((id: string) => tomatoLines.some((l) => l.facilityId === id))).toBe(true);
    expect(matches.results[0].remainingSteps[1]).toContain('who brings the tomatoes');

    // A request cannot be sent to a buyer that does not buy tomatoes.
    const wrongRequest = await farmerClient.post(`/harvests/${harvest.id}/offer-requests`, { facilityId: cassavaBuyer.facility.id });
    expect(wrongRequest.body.error.code).toBe('VALIDATION_FAILED');
    expect(wrongRequest.body.error.message).toContain('does not buy tomatoes');
    expectOk(await farmerClient.post(`/harvests/${harvest.id}/offer-requests`, { facilityId: tomatoBuyer.facility.id }));

    // Only the tomato buyer sees the harvest in its requests, labelled with the crop.
    const tomatoInbox = expectOk(await tomatoManager.get(`/organisations/${tomatoBuyer.org.id}/inbox`));
    expect(tomatoInbox.find((i: { harvestRequestId: string }) => i.harvestRequestId === harvest.id)).toMatchObject({ crop: 'TOMATO', nextStep: 'Review harvest request' });
    const cassavaInbox = expectOk(await cassavaManager.get(`/organisations/${cassavaBuyer.org.id}/inbox`));
    expect(cassavaInbox.some((i: { harvestRequestId: string }) => i.harvestRequestId === harvest.id)).toBe(false);

    // A cassava buying slot cannot carry an offer for tomatoes.
    const wrongOffer = await cassavaManager.post('/offers', { harvestRequestId: harvest.id, ...offerTerms(cassavaBuyer.slot, '900', 45_000) }, { idem: true });
    expect(wrongOffer.body.error.code).toBe('VALIDATION_FAILED');
    expect(wrongOffer.body.error.details[0]).toMatchObject({ path: 'slotId', message: 'Choose a buying slot for tomatoes' });
    expect(expectOk(await cassavaManager.get(`/slots/${cassavaBuyer.slot.id}`)).usage.heldKg).toBe('0.000');

    // The tomato buyer's offer goes through; the booking and the invoice say "Tomatoes".
    const offer = expectOk(await tomatoManager.post('/offers', { harvestRequestId: harvest.id, ...offerTerms(tomatoBuyer.slot, '900', 45_000) }, { idem: true }), 201);
    expect(offer).toMatchObject({ crop: 'TOMATO', status: 'OPEN' });
    const accepted = expectOk(await farmerClient.post(`/offers/${offer.id}/accept`, { expectedVersionNo: 1 }, { idem: true }));
    expect(accepted.status).toBe('CONFIRMED');
    const booking = expectOk(await farmerClient.get(`/bookings/${accepted.bookingId}`));
    expect(booking.current.content.harvest.crop).toBe('TOMATO');
    const list = expectOk(await tomatoManager.get(`/bookings?view=processor&organisationId=${tomatoBuyer.org.id}`));
    expect((list.items ?? list).find((b: { id: string }) => b.id === accepted.bookingId)?.crop).toBe('TOMATO');
  });

  it('creates a separate intake line when a buyer starts buying a second crop, and checks line products', async () => {
    const buyer = await makeProcessor(t.db, { crop: 'CASSAVA' });
    const manager = new Client(t.app);
    await manager.login(buyer.manager.email!);

    const slot = expectOk(
      await manager.post(`/organisations/${buyer.org.id}/buying-slots`, { crop: 'TOMATO', facilityId: buyer.facility.id, fromDate: lagosDate(8), toDate: lagosDate(9), quantityKg: '1500' }, { idem: true }),
      201,
    );
    expect(slot).toMatchObject({ crop: 'TOMATO', lineName: 'Tomatoes intake' });
    const lines = await t.db.processingLine.findMany({ where: { facilityId: buyer.facility.id }, orderBy: { createdAt: 'asc' } });
    expect(lines.map((l) => l.crop)).toEqual(['CASSAVA', 'TOMATO']);

    // A cassava buying slot at the same place keeps using the cassava line.
    const cassavaSlot = expectOk(
      await manager.post(`/organisations/${buyer.org.id}/buying-slots`, { facilityId: buyer.facility.id, fromDate: lagosDate(8), toDate: lagosDate(9), quantityKg: '1500' }, { idem: true }),
      201,
    );
    expect(cassavaSlot).toMatchObject({ crop: 'CASSAVA', lineId: buyer.line.id });

    // A tomato line cannot be set up to make garri.
    const wrong = await manager.post(`/facilities/${buyer.facility.id}/lines`, { name: 'Odd line', crop: 'TOMATO', product: 'GARRI' });
    expect(wrong.body.error.code).toBe('VALIDATION_FAILED');
    expect(wrong.body.error.details[0].path).toBe('product');
  });

  it('administrators add crops without a release; farmers ask for missing crops and hear when buyers appear', async () => {
    const farmer = await makeFarmer(t.db);
    const farmerClient = new Client(t.app);
    await farmerClient.login(farmer.user!.email!);
    const adminUser = await makeUser(t.db, 'admin', { platformRole: 'ADMIN' });
    const admin = new Client(t.app);
    await admin.login(adminUser.email!);
    const suffix = Date.now().toString(36).toUpperCase();
    const label = `Okra ${suffix}`;

    // The launch crops are listed for everyone in the public config.
    const config = expectOk(await farmerClient.get('/config/public'));
    expect(config.crops.map((c: { code: string }) => c.code)).toEqual(expect.arrayContaining(['CASSAVA', 'TOMATO', 'PEPPER', 'PLANTAIN', 'OIL_PALM_FRUIT']));

    // A crop that is not listed cannot be sold yet; the farmer asks for it instead.
    const base = { farmLocationId: farmer.location.id, estimatedQuantityKg: '600', earliestHarvestDate: lagosDate(1), latestHarvestDate: lagosDate(8), publish: true };
    const code = `OKRA_${suffix}`;
    const unlisted = await farmerClient.post(`/farmers/${farmer.profile.id}/harvests`, { ...base, crop: code }, { idem: true });
    expect(unlisted.body.error).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(unlisted.body.error.details[0].path).toBe('crop');
    const asked = expectOk(await farmerClient.post('/crop-requests', { name: label, note: 'Every two weeks' }), 201);
    expect(asked).toMatchObject({ status: 'OPEN', nameKey: label.toLowerCase() });
    expect((await farmerClient.post('/crop-requests', { name: label })).body.error.code).toBe('DUPLICATE');
    expect((await farmerClient.post('/crop-requests', { name: 'Cassava' })).body.error.code).toBe('DUPLICATE');
    expect((await farmerClient.get('/admin/crop-requests')).status).toBe(404); // admin routes are hidden from everyone else
    const open = expectOk(await admin.get('/admin/crop-requests'));
    expect(open.some((r: { id: string }) => r.id === asked.id)).toBe(true);

    // The administrator adds it: available at once, and the farmer who asked is told.
    const crop = expectOk(await admin.post('/admin/crops', { label, noun: label.toLowerCase(), produce: 'fresh pods', why: 'Pods turn tough within two days of picking.', maxHoursHarvestToDelivery: 24, answersRequestIds: [asked.id] }), 201);
    expect(crop).toMatchObject({ code, active: true, maxHoursHarvestToDelivery: 24 });
    expect(await t.db.cropRequest.findUniqueOrThrow({ where: { id: asked.id } })).toMatchObject({ status: 'ADDED', resolvedCropCode: code });
    expect(await t.db.notification.count({ where: { userId: farmer.user!.id, type: 'crop.added' } })).toBe(1);
    expect(expectOk(await farmerClient.get('/config/public')).crops.some((c: { code: string }) => c.code === code)).toBe(true);

    // The farmer lists it. No buyer yet: the matches say so, and the harvest stays listed.
    const harvest = expectOk(await farmerClient.post(`/farmers/${farmer.profile.id}/harvests`, { ...base, crop: code }, { idem: true }), 201);
    const matches = expectOk(await farmerClient.get(`/harvests/${harvest.id}/matches`));
    expect(matches.results).toEqual([]);
    expect(matches.infeasible.reasons[0]).toBe(`No buyer has published open capacity for ${label.toLowerCase()} on upcoming dates.`);
    expect(matches.infeasible.suggestions[0].kind).toBe('WAIT');

    // A buyer opens a buying slot for it nearby: the waiting farmer is told once.
    const buyer = await makeProcessor(t.db);
    const manager = new Client(t.app);
    await manager.login(buyer.manager.email!);
    const slot = expectOk(await manager.post(`/organisations/${buyer.org.id}/buying-slots`, { crop: code, facilityId: buyer.facility.id, fromDate: lagosDate(2), toDate: lagosDate(4), quantityKg: '1000' }, { idem: true }), 201);
    expect(slot).toMatchObject({ crop: code, lineName: `${label} intake`, status: 'PUBLISHED' });
    const told = await t.db.notification.findMany({ where: { userId: farmer.user!.id, type: 'harvest.buyer-available' } });
    expect(told).toHaveLength(1);
    expect(told[0]!.title).toBe(`A buyer for your ${label.toLowerCase()} opened a buying slot`);
    expect(told[0]!.link).toBe(`/farmer/harvests/${harvest.id}`);
    const after = expectOk(await farmerClient.get(`/harvests/${harvest.id}/matches`));
    expect(after.results.map((r: { facilityId: string }) => r.facilityId)).toContain(buyer.facility.id);

    // Switched off: no new harvests or buying slots for it; existing ones carry on.
    expectOk(await admin.patch(`/admin/crops/${code}`, { active: false }));
    expect((await farmerClient.post(`/farmers/${farmer.profile.id}/harvests`, { ...base, crop: code }, { idem: true })).body.error.code).toBe('VALIDATION_FAILED');
    expect(expectOk(await farmerClient.get(`/harvests/${harvest.id}`)).crop).toBe(code);

    // Requests the administrator can't meet are dismissed with a reason the farmers see.
    const melon = expectOk(await farmerClient.post('/crop-requests', { name: `Watermelon ${suffix}` }), 201);
    expectOk(await admin.post('/admin/crop-requests/dismiss', { nameKey: melon.nameKey, reason: 'No buyer for watermelon in Oyo State yet.' }));
    expect(await t.db.notification.count({ where: { userId: farmer.user!.id, type: 'crop.request-dismissed' } })).toBe(1);
  });
});
