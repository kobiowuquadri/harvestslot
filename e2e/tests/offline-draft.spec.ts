import { expect, test } from '@playwright/test';
import { lagosDate, makeFarmer, makeHarvest, signedInPage } from '../support/api';

test('offline draft is kept on the phone, then sent once on reconnection', async ({ browser }) => {
  const farmer = await makeFarmer();
  const page = await signedInPage(browser, farmer.email, { mobile: true });
  await page.goto('/farmer/harvests/new');
  await expect(page.getByRole('radio', { name: /River farm/ })).toBeChecked({ checked: false });
  await page.getByRole('radio', { name: /River farm/ }).check();

  // Lose the connection mid-form.
  await page.context().setOffline(true);
  await expect(page.getByText('You are offline').first()).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel(/How much cassava/).fill('1500');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Earliest harvest date').fill(lagosDate(2));
  await page.getByLabel('Latest harvest date').fill(lagosDate(8));
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('button', { name: 'Publish to processors' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Keep on this phone' }).click();
  await expect(page.getByText('Saved on this phone', { exact: true })).toBeVisible();

  // Nothing reached the server while offline.
  expect(await farmer.api.get(`/harvests?farmerProfileId=${farmer.farmerProfileId}`)).toHaveLength(0);

  // Back online: the draft is listed and sent once.
  await page.context().setOffline(false);
  await page.goto('/farmer/harvests');
  await expect(page.getByText('Saved on this phone only')).toBeVisible();
  await expect(page.getByText('1500 kg')).toBeVisible();
  await page.getByRole('button', { name: 'Send now' }).click();
  await expect(page.getByText(/Sent as draft HR-/).first()).toBeVisible();
  await expect(page.getByText('Saved on this phone only')).toHaveCount(0);
  const list = await farmer.api.get<Array<{ status: string; estimatedQuantityKg: string }>>(`/harvests?farmerProfileId=${farmer.farmerProfileId}`);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ status: 'DRAFT', estimatedQuantityKg: '1500.000' });
});

test('editing a request that changed elsewhere shows a conflict instead of overwriting', async ({ browser }) => {
  const farmer = await makeFarmer();
  const harvest = await makeHarvest(farmer, '3000');
  const page = await signedInPage(browser, farmer.email);
  await page.goto(`/farmer/harvests/${harvest.id}/edit`);
  await expect(page.getByRole('heading', { name: 'Edit harvest request' })).toBeVisible();

  // Meanwhile the same request is updated from another device.
  await farmer.api.patch(`/harvests/${harvest.id}`, { expectedVersion: harvest.version, notes: 'Updated on another phone' });

  await page.getByRole('button', { name: '2. Quantity' }).click();
  await page.getByLabel(/How much cassava/).fill('2800');
  await page.getByRole('button', { name: '5. Review' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('This request was changed by someone else')).toBeVisible();
  const current = await farmer.api.get(`/harvests/${harvest.id}`);
  expect(current.estimatedQuantityKg).toBe('3000.000');
  expect(current.notes).toBe('Updated on another phone');
});
