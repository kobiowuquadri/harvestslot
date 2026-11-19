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

test('registration asks what you want to do first, then shows field errors instead of submitting', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByLabel(/Local government area/)).toHaveCount(0);
  await page.getByText('Buy cassava', { exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Create your buyer account' })).toBeVisible();
  await expect(page.getByLabel('Business name')).toBeVisible();
  // Changing your mind keeps what you typed.
  await page.getByLabel('Your name').fill('Bisi Buyer');
  await page.getByRole('button', { name: /change/ }).click();
  await page.getByText('Sell cassava', { exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Create your seller account' })).toBeVisible();
  await expect(page.getByLabel('Your name')).toHaveValue('Bisi Buyer');
  await expect(page.getByLabel('Business name')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('You must accept the terms to continue')).toBeVisible();
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Use at least 10 characters')).toBeVisible();
  await expect(page).toHaveURL(/\/register/);
});

test('harvest wizard checks each step before moving on and keeps answers', async ({ browser }) => {
  const farmer = await makeFarmer();
  const page = await signedInPage(browser, farmer.email, { mobile: true });
  await page.goto('/farmer/harvests/new');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Choose where the cassava is')).toBeVisible();
  await page.getByText('River farm', { exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('Kilograms (kg)', { exact: true }).click();
  await page.getByLabel('How many kilograms?').fill('abc');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Enter kilograms like 2000')).toBeVisible();
  await page.getByLabel('How many kilograms?').fill('2000');
  await expect(page.getByText('2,000 kg', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Ready from').fill('2020-01-01');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Choose today or a later date')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('How many kilograms?')).toHaveValue('2000');
});
