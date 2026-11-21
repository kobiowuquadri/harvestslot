import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, expectOk, makeFarmer, makeProcessor, offerTerms, startApp, type TestApp } from '../support/harness.js';

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
    expect(slot).toMatchObject({ crop: 'TOMATO', lineName: 'Tomato intake' });
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
});
