import { expect, test } from '@playwright/test';
import { backdateOffer, lagosDate, makeFarmer, makeHarvest, makeProcessor, offerTerms, signedInPage } from '../support/api';

/** What each person sees when the simple sale does not go to plan. */

test('no buyer fits: the harvest stays saved, the farmer is told what to change, buyers see nothing', async ({ browser }) => {
  const processor = await makeProcessor();
  const farmer = await makeFarmer();
  // Ready long after any published buying slot.
  const harvest = await farmer.api.post(`/farmers/${farmer.farmerProfileId}/harvests`, { farmLocationId: farmer.locationId, estimatedQuantityKg: '2000', earliestHarvestDate: lagosDate(120), latestHarvestDate: lagosDate(127), publish: true });

  const page = await signedInPage(browser, farmer.email, { mobile: true });
  await page.goto(`/farmer/harvests/${harvest.id}`);
  await expect(page.getByText('No buyer fits right now — your harvest is still saved')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Change the dates' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Looking for a buyer' })).toBeVisible();

  const inbox = await processor.api.get<Array<{ harvestRequestId: string }>>(`/organisations/${processor.orgId}/inbox`);
  expect(inbox.some((i) => i.harvestRequestId === harvest.id)).toBe(false);
});

test('an offer expires: the farmer is pointed to other buyers, the buyer may send a new one, the space is released', async ({ browser }) => {
  const processor = await makeProcessor();
  const farmer = await makeFarmer();
  const harvest = await makeHarvest(farmer);
  const offer = await processor.api.post('/offers', { harvestRequestId: harvest.id, ...offerTerms(processor.slot, '2000', 10_000) });
  expect((await processor.api.get(`/slots/${processor.slot.id}`)).usage.heldKg).toBe('2000.000');
  await backdateOffer(offer.id);

  const page = await signedInPage(browser, farmer.email, { mobile: true });
  await page.goto(`/offers/${offer.id}`);
  await expect(page.getByRole('heading', { level: 2, name: 'This offer expired' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept offer' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Find other buyers' }).click();
  await expect(page).toHaveURL(new RegExp(`/farmer/harvests/${harvest.id}`));
  await expect(page.getByRole('heading', { name: 'Buyers that fit' })).toBeVisible();

  const proc = await signedInPage(browser, processor.email);
  await proc.goto('/processor/inbox');
  const card = proc.locator('li', { hasText: harvest.reference });
  await expect(card.getByText('Your offer expired — send a new one')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Review and send offer' })).toBeVisible();
  expect((await processor.api.get(`/slots/${processor.slot.id}`)).usage.heldKg).toBe('0.000');
});

test('capacity taken before acceptance: the farmer is told the buyer has no room; the buyer cannot over-offer', async ({ browser }) => {
  const processor = await makeProcessor({ capacityKg: '2500' });
  const a = await makeFarmer();
  const harvestA = await makeHarvest(a);
  const offerA = await processor.api.post('/offers', { harvestRequestId: harvestA.id, ...offerTerms(processor.slot) });
  // The hold on farmer A's offer lapses and the space goes to farmer B.
  await backdateOffer(offerA.id, 'hold-only');
  const b = await makeFarmer();
  const harvestB = await makeHarvest(b);
  await processor.api.post('/offers', { harvestRequestId: harvestB.id, ...offerTerms(processor.slot) });

  const page = await signedInPage(browser, a.email, { mobile: true });
  await page.goto(`/offers/${offerA.id}`);
  await page.getByRole('button', { name: 'Accept offer' }).click();
  await expect(page.getByText('The buyer no longer has room for this')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to your harvest' })).toBeVisible();
  expect((await a.api.get(`/offers/${offerA.id}`)).bookingId).toBeNull();

  // Farmer C asks this buyer directly; the buyer tries to offer 2,000 kg with only 500 kg left.
  const c = await makeFarmer();
  const harvestC = await makeHarvest(c);
  const facilities = await processor.api.get<Array<{ id: string }>>(`/organisations/${processor.orgId}/facilities`);
  await c.api.post(`/harvests/${harvestC.id}/offer-requests`, { facilityId: facilities[0]!.id });
  const proc = await signedInPage(browser, processor.email);
  await proc.goto('/processor/inbox');
  const card = proc.locator('li', { hasText: harvestC.reference });
  await card.getByRole('button', { name: 'Review and send offer' }).click();
  const dialog = proc.getByRole('dialog');
  await dialog.getByLabel('Buying slot').selectOption(processor.slot.id);
  await dialog.getByLabel('Price (₦ per kg)').fill('100');
  await dialog.getByText('We’ll collect from the farm', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Send offer' }).click();
  await expect(dialog.getByText('Only 500 kg of capacity is left in this buying slot')).toBeVisible();
  // Nothing was sent to farmer C.
  expect(await c.api.get(`/harvests/${harvestC.id}/offers`)).toHaveLength(0);
});
