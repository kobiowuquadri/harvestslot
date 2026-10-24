import { expect, test } from '@playwright/test';
import { Api, PASSWORD, lagosDate, makeProcessor, makeTransporter, signedInPage, uid } from '../support/api';

/**
 * Demo script steps 1–12 through the browser: a farmer registers, publishes a 2,000 kg request and
 * sees explained matches; the processor offers; the farmer accepts; transport is quoted, accepted and
 * assigned; readiness turns true; harvest, collection and delivery are recorded; 1,900 kg arrive,
 * 1,800 kg are accepted and 100 kg rejected; the farmer accepts; the produce invoice uses 1,800 kg;
 * the processor reports payment and the farmer confirms receipt.
 */
test('direct farmer happy path through payment receipt', async ({ browser }) => {
  const processor = await makeProcessor();
  const transporter = await makeTransporter();
  const farmerEmail = `farmer-ui-${uid()}@e2e.example`;
  const farmerName = `Ayo Farmer ${uid()}`;

  // ── 1. Registration and a 2,000 kg harvest request, entirely in the browser ──
  const farmerCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const farmer = await farmerCtx.newPage();
  await farmer.goto('/register');
  await farmer.getByLabel('Your name').fill(farmerName);
  await farmer.getByLabel('Email address').fill(farmerEmail);
  await farmer.getByRole('textbox', { name: 'Password', exact: true }).fill(PASSWORD);
  await farmer.getByLabel('Local government area').selectOption('Akinyele');
  await farmer.getByLabel(/I accept the terms of use/).check();
  await farmer.getByLabel(/I have read the privacy notice/).check();
  await farmer.getByRole('button', { name: 'Create account' }).click();
  await expect(farmer.getByRole('heading', { name: `Hello, ${farmerName}` })).toBeVisible();

  await farmer.getByRole('link', { name: 'New harvest request' }).click();
  await farmer.getByRole('button', { name: 'Add a farm location' }).click();
  const dialog = farmer.getByRole('dialog');
  await dialog.getByLabel('Name for this farm').fill('Farm by the stream');
  await dialog.getByLabel('Local government area').selectOption('Akinyele');
  await dialog.getByLabel('Directions').fill('Past the market, second left');
  await dialog.getByRole('button', { name: 'Add location' }).click();
  await expect(dialog).toBeHidden();
  await farmer.getByRole('button', { name: 'Next' }).click();
  await farmer.getByLabel(/How much cassava/).fill('2000');
  await farmer.getByRole('button', { name: 'Next' }).click();
  await farmer.getByLabel('Earliest harvest date').fill(lagosDate(1));
  await farmer.getByLabel('Latest harvest date').fill(lagosDate(6));
  await farmer.getByRole('button', { name: 'Next' }).click();
  await farmer.getByRole('button', { name: 'Next' }).click();
  await farmer.getByRole('button', { name: 'Publish to processors' }).click();
  await expect(farmer.getByText('Published', { exact: true }).first()).toBeVisible();
  const harvestId = farmer.url().match(/harvests\/([0-9a-f-]{36})/)![1]!;

  // ── 2. Matching explains the available processor ──
  await expect(farmer.getByText('These are recommendations, not offers').first()).toBeVisible();
  await farmer.getByText('Why this match is ranked here').first().click();
  await expect(farmer.getByRole('table', { name: 'Ranking factors' }).first()).toBeVisible();

  // ── 3. Processor makes an offer from the inbox ──
  const proc = await signedInPage(browser, processor.email);
  await proc.goto('/processor/inbox');
  const card = proc.locator('li', { hasText: farmerName });
  await card.getByRole('button', { name: 'Make an offer' }).click();
  const offerDialog = proc.getByRole('dialog');
  await offerDialog.getByLabel('Facility').selectOption({ index: 1 });
  await offerDialog.getByLabel('Processing slot').selectOption({ index: 1 });
  await offerDialog.getByLabel('Price (₦ per kg)').fill('250');
  await offerDialog.getByRole('button', { name: 'Send offer' }).click();
  await expect(proc).toHaveURL(/\/offers\//);

  // ── 4. Farmer accepts the exact terms ──
  await farmer.goto(`/farmer/harvests/${harvestId}`);
  await farmer.getByRole('tab', { name: /Offers/ }).click();
  await farmer.locator('a[href^="/offers/"]').filter({ visible: true }).first().click();
  await farmer.getByRole('button', { name: 'Accept this offer' }).click();
  await expect(farmer).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
  const bookingId = farmer.url().split('/').pop()!;
  await expect(farmer.getByText('Not ready', { exact: false }).first()).toBeVisible();

  // ── 5. Transport: quote → processor accepts → transporter confirms vehicle and driver ──
  const disp = await signedInPage(browser, transporter.email);
  await disp.goto('/transport/opportunities');
  const reference = (await Api.forContext(farmerCtx).get<{ reference: string }>(`/bookings/${bookingId}`)).reference;
  const opp = disp.locator('li', { hasText: reference });
  await opp.getByRole('button', { name: 'Send a quote' }).click();
  const quoteDialog = disp.getByRole('dialog');
  await quoteDialog.getByLabel('Vehicle').selectOption({ index: 1 });
  await quoteDialog.getByLabel('Price (₦, whole trip)').fill('35000');
  await quoteDialog.getByRole('button', { name: 'Send quote' }).click();
  await expect(quoteDialog).toBeHidden();

  await proc.goto(`/bookings/${bookingId}`);
  await proc.getByRole('button', { name: 'Accept quote' }).click();
  await expect(proc.getByText('Quote accepted').first()).toBeVisible();

  await disp.goto('/transport/quotes');
  await disp.getByLabel('Driver').first().selectOption({ label: transporter.driver.name });
  await disp.getByRole('button', { name: 'Confirm vehicle and driver' }).click();
  await expect(disp.getByText('Assignment confirmed').first()).toBeVisible();

  // ── 6. Readiness becomes true; the farmer harvests ──
  await farmer.reload();
  await expect(farmer.getByRole('heading', { name: 'You can harvest now' })).toBeVisible();
  await farmer.getByRole('button', { name: 'I have started harvesting' }).click();
  await farmer.getByRole('button', { name: 'Ready for pickup' }).click();
  await expect(farmer.getByText('Marked ready for pickup').first()).toBeVisible();

  // ── 8. Driver records collection; the farmer confirms the handover; delivery ──
  const driver = await signedInPage(browser, transporter.driver.email, { mobile: true, geo: true });
  await driver.goto('/transport/jobs');
  await driver.getByRole('link', { name: /Akinyele/ }).first().click();
  await driver.getByRole('button', { name: 'I am on my way' }).click();
  await expect(driver.getByText('I am on my way — recorded').first()).toBeVisible();
  await driver.getByRole('button', { name: 'I have arrived at the farm' }).click();
  await expect(driver.getByText('I have arrived at the farm — recorded').first()).toBeVisible();
  await driver.getByLabel('Quantity loaded (kg)').fill('1950');
  await driver.getByRole('button', { name: 'Save loading' }).click();
  await expect(driver.getByText('Handover', { exact: true }).first()).toBeVisible();

  await farmer.reload();
  await farmer.getByLabel('I handed over this cassava to the driver').check();
  await farmer.getByRole('button', { name: 'Confirm pickup' }).click();
  await expect(farmer.getByText('Pickup confirmed').first()).toBeVisible();

  await driver.reload();
  await driver.getByRole('button', { name: 'I have left the farm' }).click();
  await driver.getByRole('button', { name: 'I have arrived at the facility' }).click();
  await expect(driver.getByText('Arrived at facility').first()).toBeVisible();

  // ── 9. Receiving: 1,900 kg delivered, 1,800 accepted, 100 rejected with reasons ──
  await proc.goto(`/bookings/${bookingId}`);
  await proc.getByRole('button', { name: 'Confirm delivery received' }).click();
  await expect(proc.getByText('Delivery confirmed').first()).toBeVisible();
  await proc.goto(`/bookings/${bookingId}/receiving`);
  await proc.getByLabel('Gross weight (kg)').fill('1900');
  await proc.getByLabel('Tare (kg)').fill('0');
  await proc.getByRole('button', { name: 'Save weighing' }).click();
  await expect(proc.getByText('Weighing recorded').first()).toBeVisible();
  await proc.locator('input[type=file]').first().setInputFiles({ name: 'ticket.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64') });
  await expect(proc.getByText('Evidence attached').first()).toBeVisible();
  await proc.getByLabel('Accepted (kg)').fill('1800');
  await proc.getByLabel('Rejected (kg)').fill('100');
  await proc.getByLabel('Rotten or damaged roots').check();
  await proc.getByLabel('What happens to the rejected cassava?').selectOption('RETURNED_TO_FARMER');
  await proc.getByRole('button', { name: /Submit decision/ }).click();
  await expect(proc.getByText('Decision submitted').first()).toBeVisible();

  // ── 10. The farmer reviews and accepts ──
  await farmer.goto(`/bookings/${bookingId}/receiving`);
  await expect(farmer.getByText('Material difference flagged').or(farmer.getByText('Accepted')).first()).toBeVisible();
  await farmer.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(farmer.getByText(/invoice to you is being issued/).first()).toBeVisible();

  // ── 11. Produce invoice is for the accepted 1,800 kg × ₦250 = ₦450,000 ──
  const farmerApi = Api.forContext(farmerCtx);
  let produce: { id: string } | undefined;
  await expect
    .poll(async () => {
      const list = await farmerApi.get<Array<{ id: string; kind: string; bookingId: string; totalKobo: number }>>('/invoices?role=payee');
      const inv = list.find((i) => i.kind === 'PRODUCE' && i.bookingId === bookingId);
      produce = inv;
      return inv?.totalKobo;
    })
    .toBe(45_000_000);

  // ── 12. Payment reported by the processor, then confirmed by the farmer ──
  await proc.goto(`/invoices/${produce!.id}`);
  await expect(proc.getByText('₦450,000.00').first()).toBeVisible();
  await proc.getByRole('button', { name: 'I have paid this' }).click();
  const pay = proc.getByRole('dialog');
  await pay.getByLabel('Bank or receipt reference').fill(`TRF-${uid()}`);
  await pay.getByRole('button', { name: 'Report payment' }).click();
  await expect(proc.getByText('Reported by payer').first()).toBeVisible();

  await farmer.goto(`/invoices/${produce!.id}`);
  await farmer.getByRole('button', { name: 'Did you receive it?' }).click();
  await farmer.getByRole('dialog').getByRole('button', { name: 'Save answer' }).click();
  await expect(farmer.getByText('Confirmed by recipient').first()).toBeVisible();
  await expect(farmer.getByText('Paid', { exact: true }).first()).toBeVisible();
});
