import { expect, test } from '@playwright/test';
import { approve, lagosDate, register, signedInPage } from '../support/api';

test('processor sets up a facility, publishes a week of capacity and adjusts it with a reason', async ({ browser }) => {
  const p = await register('PROCESSOR', 'processor');
  await approve(p.orgId!);
  const page = await signedInPage(browser, p.email);

  await page.goto('/processor/facilities');
  await page.getByRole('button', { name: 'Add facility' }).click();
  const f = page.getByRole('dialog');
  await f.getByLabel('Facility name').fill('Akinyele Garri Works');
  await f.getByLabel('LGA').selectOption('Akinyele');
  await f.getByLabel('Latitude').fill('7.4500');
  await f.getByLabel('Longitude').fill('3.9000');
  await f.getByLabel('Indicative price (₦/kg, optional)').fill('245');
  await f.getByRole('button', { name: 'Add facility' }).click();
  await expect(page.getByRole('heading', { name: 'Akinyele Garri Works' })).toBeVisible();
  await page.getByLabel('New line name').fill('Garri line 1');
  await page.getByRole('button', { name: 'Add line' }).click();
  await expect(page.getByText('Garri line 1')).toBeVisible();

  await page.goto('/processor/capacity');
  await page.getByRole('button', { name: 'Add capacity' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('First day').fill(lagosDate(2));
  await d.getByLabel('Number of days').fill('5');
  await d.getByLabel('Processing capacity (kg)').fill('12000');
  await d.getByLabel('Purchase limit (kg)').fill('10000');
  await d.getByRole('button', { name: 'Create' }).click();
  await expect(d.getByText('5 slot(s) created')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Published').first()).toBeVisible();
  await expect(page.getByText('of 10,000 kg').first()).toBeVisible();

  // Overlapping slots on the same line are refused by the database constraint.
  await page.getByRole('button', { name: 'Add capacity' }).click();
  await d.getByLabel('First day').fill(lagosDate(2));
  await d.getByLabel('Number of days').fill('1');
  await d.getByRole('button', { name: 'Create' }).click();
  await expect(d.getByText('0 slot(s) created')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Adjust capacity' }).first().click();
  const a = page.getByRole('dialog');
  await a.getByLabel('Purchase limit (kg)').fill('8000');
  await a.getByLabel('Reason').fill('Generator maintenance on Thursday');
  await a.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Capacity updated').first()).toBeVisible();
  await expect(page.getByText('of 8,000 kg').first()).toBeVisible();
});
