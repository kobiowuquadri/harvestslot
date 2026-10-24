import { expect, test } from '@playwright/test';
import { approve, lagosDate, makeProcessor, offerTerms, register, signedInPage, uid } from '../support/api';

/**
 * A cooperative representative acts for a member who has no account: first with data-entry
 * permission only (can prepare, cannot approve a sale), then with sale approval recorded.
 */
test('cooperative acting with and without approval authority', async ({ browser }) => {
  const processor = await makeProcessor();
  const coop = await register('COOPERATIVE', 'coop');
  await approve(coop.orgId!);
  const memberName = `Mama Iyabo ${uid()}`;
  await coop.api.post(`/cooperatives/${coop.orgId}/members`, {
    displayName: memberName,
    lga: 'Akinyele',
    preferredLanguage: 'yo',
    consent: { scopes: ['ASSIST_DATA_ENTRY'], witnessName: 'Baale of the village', contactConsent: false },
  });
  const members = await coop.api.get<Array<{ farmerProfileId: string; displayName: string }>>(`/cooperatives/${coop.orgId}/members`);
  const memberId = members.find((m) => m.displayName === memberName)!.farmerProfileId;

  const rep = await signedInPage(browser, coop.email);
  await rep.goto('/coop/members');
  const card = rep.locator('li', { hasText: memberName });
  await expect(card.getByText('May: Help with data entry')).toBeVisible();
  await card.getByRole('link', { name: 'Farm locations' }).click();
  await expect(rep.getByText(`Acting for ${memberName}`)).toBeVisible();
  await rep.getByRole('button', { name: 'Add location' }).click();
  const dialog = rep.getByRole('dialog');
  await dialog.getByLabel('Name for this farm').fill('Family plot');
  await dialog.getByLabel('Local government area').selectOption('Akinyele');
  await dialog.getByRole('button', { name: 'Add location' }).click();
  await expect(rep.getByText('Family plot')).toBeVisible();

  // The representative creates and publishes a request for the member (ASSIST_DATA_ENTRY).
  const loc = (await coop.api.get(`/farmers/${memberId}`)).locations[0];
  const harvest = await coop.api.post(`/farmers/${memberId}/harvests`, { farmLocationId: loc.id, estimatedQuantityKg: '1500', earliestHarvestDate: lagosDate(1), latestHarvestDate: lagosDate(6), transportPreference: 'PROCESSOR_PAYS', publish: true });
  expect(harvest.createdBy.viaCooperative).toBeTruthy();
  const offer = await processor.api.post('/offers', { harvestRequestId: harvest.id, ...offerTerms(processor.slot, '1500') });

  // Without APPROVE_SALE the representative can only prepare the acceptance.
  await rep.goto(`/offers/${offer.id}`);
  await expect(rep.getByText(`Acting for ${memberName}`)).toBeVisible();
  await expect(rep.getByRole('button', { name: 'Accept this offer' })).toHaveCount(0);
  await rep.getByRole('button', { name: 'Prepare acceptance' }).click();
  await expect(rep).toHaveURL(/\/bookings\//);
  await expect(rep.getByText('Prepared — waiting for the farmer to approve')).toBeVisible();
  await expect(rep.getByRole('button', { name: 'Approve this sale' })).toHaveCount(0);
  const bookingUrl = rep.url();
  // The API refuses approval without the scope, whatever the UI shows.
  const bookingId = bookingUrl.split('/').pop()!;
  const b = await coop.api.get(`/bookings/${bookingId}`);
  const refused = await coop.api.raw('POST', `/bookings/${bookingId}/approve`, { expectedVersion: b.version });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error.code).toBe('DELEGATION_SCOPE_MISSING');

  // The member agrees (witnessed) to let the cooperative approve sales; now approval is possible.
  await rep.goto('/coop/members');
  await rep.locator('li', { hasText: memberName }).getByRole('button', { name: 'Update consent' }).click();
  const consent = rep.getByRole('dialog');
  await consent.getByLabel('Approve sales').check();
  await consent.getByLabel('Witness name').fill('Baale of the village');
  await consent.getByRole('button', { name: 'Record consent' }).click();
  await expect(rep.locator('li', { hasText: memberName }).getByText(/Approve sales/)).toBeVisible();

  await rep.goto(bookingUrl);
  await rep.getByRole('button', { name: 'Approve this sale' }).click();
  await expect(rep.getByText('Sale approved').first()).toBeVisible();
  const after = await coop.api.get(`/bookings/${bookingId}`);
  expect(after.status).toBe('AWAITING_CONFIRMATIONS');
  // The audit trail records both the representative and the farmer they acted for.
  expect(after.current.confirmations.some((c: { party: string; actingForFarmer: boolean }) => c.party === 'FARMER' && c.actingForFarmer)).toBe(true);
});
