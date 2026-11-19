import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { confirmedBooking, signedInPage } from '../support/api';

/** WCAG 2.1 A/AA rules from axe-core; the report lists any violation with its target elements. */
async function audit(page: Page, label: string) {
  await page.waitForLoadState('networkidle');
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
  expect(summary, `${label}: ${summary.join('\n')}`).toEqual([]);
}

test('public pages and sign-in meet WCAG 2.1 AA automated checks', async ({ page }) => {
  for (const path of ['/', '/how-it-works', '/login', '/register', '/privacy']) {
    await page.goto(path);
    await audit(page, path);
  }
});

test('farmer and buyer working screens meet WCAG 2.1 AA automated checks', async ({ browser }) => {
  const f = await confirmedBooking();
  const farmer = await signedInPage(browser, f.farmer.email, { mobile: true });
  for (const path of ['/app', '/farmer/harvests/new', `/farmer/harvests/${f.harvestId}`, `/offers/${f.offerId}`, `/bookings/${f.bookingId}`, '/bookings', '/invoices']) {
    await farmer.goto(path);
    await audit(farmer, `farmer ${path}`);
  }
  const proc = await signedInPage(browser, f.processor.email);
  for (const path of ['/app', '/processor/capacity', '/processor/inbox', `/offers/${f.offerId}`, `/bookings/${f.bookingId}`]) {
    await proc.goto(path);
    await audit(proc, `processor ${path}`);
  }
  // Dialogs on the short sale journey.
  await proc.goto(`/bookings/${f.bookingId}`);
  await proc.getByRole('button', { name: 'Record the weight' }).click();
  await expect(proc.getByRole('dialog', { name: 'Record the weight' })).toBeVisible();
  await audit(proc, 'record-the-weight dialog');
  await proc.keyboard.press('Escape');
  await proc.goto('/processor/capacity');
  await proc.getByRole('button', { name: 'Publish a buying slot' }).first().click();
  await expect(proc.getByRole('dialog', { name: 'Publish a buying slot' })).toBeVisible();
  await audit(proc, 'publish-a-buying-slot dialog');
});

test('dialogs trap focus, have names, and keyboard focus is visible', async ({ browser }) => {
  const f = await confirmedBooking();
  const page = await signedInPage(browser, f.processor.email);
  await page.goto(`/bookings/${f.bookingId}`);
  await page.getByRole('button', { name: 'Propose a change' }).click();
  const dialog = page.getByRole('dialog', { name: 'Propose a change to the terms' });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role=dialog]')))).toBe(true);
  }
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
  expect(outline).not.toBe('none');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Propose a change' })).toBeFocused();
});
