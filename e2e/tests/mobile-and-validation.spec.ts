import { expect, test } from '@playwright/test';
import { makeFarmer, signedInPage } from '../support/api';

for (const viewport of [
  { name: 'phone', width: 360, height: 740 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1366, height: 900 },
]) {
  test(`farmer screens fit a ${viewport.name} without horizontal scrolling`, async ({ browser }) => {
    const farmer = await makeFarmer();
    const page = await signedInPage(browser, farmer.email, { mobile: viewport.name === 'phone' });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const path of ['/app', '/farmer/harvests/new', '/farmer/locations', '/bookings', '/invoices', '/settings']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
    }
  });
}

test('phone navigation: bottom bar, menu dialog with focus handling, and Escape to close', async ({ browser }) => {
  const farmer = await makeFarmer();
  const page = await signedInPage(browser, farmer.email, { mobile: true });
  await page.goto('/app');
  const quick = page.getByRole('navigation', { name: 'Quick' });
  await expect(quick.getByRole('link', { name: 'Harvests' })).toBeVisible();
  await quick.getByRole('link', { name: 'Harvests' }).click();
  await expect(page).toHaveURL(/\/farmer\/harvests$/);
  await expect(quick.getByRole('link', { name: 'Harvests' })).toHaveAttribute('aria-current', 'page');
  await quick.getByRole('button', { name: 'More' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Farm locations' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('registration shows field errors instead of submitting an invalid form', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('You must accept the terms to continue')).toBeVisible();
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Use at least 10 characters')).toBeVisible();
  await expect(page).toHaveURL(/\/register/);
});

test('harvest wizard validates each step before moving on', async ({ browser }) => {
  const farmer = await makeFarmer();
  const page = await signedInPage(browser, farmer.email, { mobile: true });
  await page.goto('/farmer/harvests/new');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Choose a farm location')).toBeVisible();
  await page.getByRole('radio', { name: /River farm/ }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel(/How much cassava/).fill('abc');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Enter kilograms as a number with at most 3 decimal places')).toBeVisible();
  await page.getByLabel(/How much cassava/).fill('2000');
  await page.getByLabel(/How much of it is for sale/).fill('2500');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Quantity for sale cannot exceed the estimated harvest')).toBeVisible();
  await page.getByLabel(/How much of it is for sale/).fill('1500');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Earliest harvest date').fill('2026-12-10');
  await page.getByLabel('Latest harvest date').fill('2026-12-01');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Latest date must be on or after the earliest date')).toBeVisible();
});
