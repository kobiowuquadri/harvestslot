import { expect, test } from '@playwright/test';
import { approve, lagosDate, register, signedInPage } from '../support/api';

test('a buyer publishes a buying slot in plain words, cannot double-publish the same dates, and adjusts it with a reason', async ({ browser }) => {
  const p = await register('PROCESSOR', 'processor');
  await approve(p.orgId!);
  const page = await signedInPage(browser, p.email);

  // "Buying slots" is one of three main areas; the facility is asked for only when first needed.
  await page.goto('/app');
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const area of ['Buying slots', 'Requests', 'Bookings']) await expect(nav.getByRole('link', { name: area, exact: true })).toBeVisible();
  await nav.getByRole('link', { name: 'Buying slots' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Buying slots' })).toBeVisible();
  await page.getByRole('button', { name: 'Publish a buying slot' }).first().click();
  const d = page.getByRole('dialog', { name: 'Publish a buying slot' });
  await expect(d.getByText('Tell farmers how much cassava you can receive, where, and on which dates.')).toBeVisible();
  await d.getByLabel('Name farmers will see').fill('Akinyele Garri Works');
  await d.getByRole('combobox', { name: /Local government area/ }).fill('Akiny');
  await d.getByRole('option', { name: 'Akinyele' }).click();
  await d.getByLabel('First day').fill(lagosDate(2));
  await d.getByLabel('Last day').fill(lagosDate(4));
  await d.getByLabel('How much can you receive in total?').fill('10');
  await expect(d.getByText('That is 10,000 kg.')).toBeVisible();
  await d.getByLabel('Price you expect to pay (₦ per kg, optional)').fill('100');
  await d.getByRole('button', { name: 'Publish buying slot' }).click();
  await expect(d).toBeHidden();
  await expect(page.getByText('Akinyele Garri Works · Cassava intake').first()).toBeVisible();
  await expect(page.getByText('Published').first()).toBeVisible();
  await expect(page.getByText('of 10,000 kg').first()).toBeVisible();

  // The same dates again at the same place are refused with a plain explanation.
  await page.getByRole('button', { name: 'Publish a buying slot' }).first().click();
  await d.getByText('Akinyele Garri Works', { exact: true }).click();
  await d.getByLabel('First day').fill(lagosDate(3));
  await d.getByLabel('Last day').fill(lagosDate(3));
  await d.getByLabel('How much can you receive in total?').fill('2');
  await d.getByRole('button', { name: 'Publish buying slot' }).click();
  await expect(d.getByText(/You already have a buying slot here from .+ Change its quantity instead, or choose other dates\./)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(d).toBeHidden();

  await page.getByRole('button', { name: 'Adjust capacity' }).first().click();
  const a = page.getByRole('dialog');
  await a.getByLabel('Purchase limit (kg)').fill('8000');
  await a.getByLabel('Reason').fill('Generator maintenance on Thursday');
  await a.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Capacity updated').first()).toBeVisible();
  await expect(page.getByText('of 8,000 kg').first()).toBeVisible();
});
