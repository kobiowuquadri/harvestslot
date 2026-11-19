import { expect, test } from '@playwright/test';
import { Api, PASSWORD, lagosDate, makeProcessor, signedInPage, uid } from '../support/api';

/**
 * The acceptance scenario, entirely in the browser: a farmer in Akinyele registers ("Sell cassava"),
 * adds 2 tonnes, finds a buyer and sends a request. The buyer offers ₦100/kg for the full quantity
 * and will collect from the farm. The farmer sees the ₦200,000 estimate before accepting. No driver,
 * vehicle, freight quote or cooperative is involved. The buyer records 1,900 kg accepted (final
 * ₦190,000) and the payment; the farmer confirms receipt.
 */
test('one complete sale: harvest → request → offer → plan → weight → payment received', async ({ browser }) => {
  // Other tests leave identical buyers in this database; a higher usual price ranks this one first.
  const processor = await makeProcessor({ indicativePriceKoboPerKg: 40_000 });
  const processorName = (await processor.api.get<{ name: string }>(`/organisations/${processor.orgId}`)).name;
  const farmerEmail = `farmer-ui-${uid()}@e2e.example`;
  const farmerName = `Ayo Farmer ${uid()}`;

  // ── 1. Two ways to start: "Sell cassava", then only account details ──
  const farmerCtx = await browser.newContext({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true });
  const farmer = await farmerCtx.newPage();
  await farmer.goto('/register');
  await expect(farmer.getByRole('heading', { level: 1, name: 'What would you like to do?' })).toBeVisible();
  await farmer.getByRole('button', { name: 'Continue' }).click();
  await expect(farmer.getByText('Choose selling or buying to continue')).toBeVisible();
  await farmer.getByText('Sell cassava', { exact: true }).click();
  await expect(farmer.getByRole('radio', { name: /Sell cassava/ })).toBeChecked();
  await farmer.getByRole('button', { name: 'Continue' }).click();
  await expect(farmer.getByRole('heading', { level: 1, name: 'Create your seller account' })).toBeVisible();
  await expect(farmer.getByLabel(/Local government area/)).toHaveCount(0);
  await farmer.getByLabel('Your name').fill(farmerName);
  await farmer.getByLabel('Email address').fill(farmerEmail);
  await farmer.getByRole('textbox', { name: 'Password', exact: true }).fill(PASSWORD);
  await farmer.getByLabel(/I accept the terms of use/).check();
  await farmer.getByLabel(/I have read the privacy notice/).check();
  await farmer.getByRole('button', { name: 'Create account' }).click();
  await expect(farmer.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), Ayo$/ })).toBeVisible();

  // ── 2. "Add my harvest": where, how much (tonnes shown as kg straight away), when, check ──
  await farmer.getByRole('link', { name: 'Add my harvest' }).first().click();
  await expect(farmer.getByRole('heading', { name: 'Where is the cassava?' })).toBeVisible();
  await farmer.getByRole('combobox', { name: /Local government area/ }).fill('Akiny');
  await farmer.getByRole('option', { name: 'Akinyele' }).click();
  await farmer.getByLabel('Town or village (optional)').fill('Ikereku');
  await farmer.getByRole('button', { name: 'Next' }).click();
  await farmer.getByText('Tonnes (t)', { exact: true }).click();
  await farmer.getByLabel('How many tonnes?').fill('2');
  await expect(farmer.getByText('2,000 kg', { exact: true })).toBeVisible();
  await farmer.getByRole('button', { name: 'Next' }).click();
  await farmer.getByLabel('Ready from').fill(lagosDate(2));
  await farmer.getByRole('button', { name: 'Next' }).click();
  await expect(farmer.getByRole('heading', { name: 'Check your harvest' })).toBeVisible();
  await expect(farmer.getByText('Ikereku, Akinyele')).toBeVisible();
  // Going back keeps what was entered.
  await farmer.getByRole('button', { name: 'Back' }).click();
  await farmer.getByRole('button', { name: 'Back' }).click();
  await expect(farmer.getByLabel('How many tonnes?')).toHaveValue('2');
  await farmer.getByRole('button', { name: 'Next' }).click();
  await farmer.getByRole('button', { name: 'Next' }).click();
  await farmer.getByRole('button', { name: 'Find buyers' }).click();
  await expect(farmer).toHaveURL(/\/farmer\/harvests\/[0-9a-f-]{36}/);
  const harvestId = farmer.url().match(/harvests\/([0-9a-f-]{36})/)![1]!;

  // ── 3. Buyers that fit, each explained in one sentence; send a request from the card ──
  await expect(farmer.getByRole('heading', { name: 'Buyers that fit' })).toBeVisible();
  const card = farmer.locator('li', { hasText: processorName });
  await expect(card.getByText(/^Can receive your full 2,000 kg (on|between) /)).toBeVisible();
  await card.getByRole('button', { name: 'Send request' }).click();
  await expect(card.getByText('Request sent — waiting for their offer')).toBeVisible();
  await expect(farmer.getByRole('heading', { level: 2, name: 'Waiting for the buyer’s offer' })).toBeVisible();

  // ── 4. The buyer reviews the request and sends an offer: ₦100/kg, full quantity, we collect ──
  const proc = await signedInPage(browser, processor.email);
  await proc.goto('/processor/inbox');
  const request = proc.locator('li', { hasText: farmerName });
  await expect(request.getByText('Review harvest request')).toBeVisible();
  await request.getByRole('button', { name: 'Review and send offer' }).click();
  const offerDialog = proc.getByRole('dialog');
  await expect(offerDialog.getByLabel('Quantity (kg)')).toHaveValue('2000');
  await offerDialog.getByLabel('Price (₦ per kg)').fill('100');
  await expect(offerDialog.getByText('₦200,000', { exact: false }).first()).toBeVisible();
  // Without deciding how the cassava gets there, it cannot be sent.
  await offerDialog.getByRole('button', { name: 'Send offer' }).click();
  await expect(offerDialog.getByText('Choose how the cassava will get there, or save the offer as a draft')).toBeVisible();
  await offerDialog.getByText('We’ll collect from the farm', { exact: true }).click();
  await offerDialog.getByRole('button', { name: 'Send offer' }).click();
  await expect(offerDialog).toBeHidden();
  // The request moves from "Needs your answer" to "Offers sent".
  await proc.getByRole('button', { name: /^Offers sent/ }).click();
  const sent = proc.locator('li', { hasText: farmerName });
  await expect(sent.getByText('Offer sent — waiting for the farmer')).toBeVisible();
  await sent.getByRole('link', { name: 'View your offer' }).click();
  await expect(proc.getByRole('heading', { name: 'Waiting for the farmer' })).toBeVisible();

  // ── 5. The farmer reviews the offer: estimate, who brings it, cost — then accepts ──
  await farmer.goto(`/farmer/harvests/${harvestId}`);
  await farmer.getByRole('link', { name: 'Review the offer' }).click();
  await expect(farmer.getByRole('heading', { name: new RegExp(`Offer from ${processorName}`) })).toBeVisible();
  await expect(farmer.getByText('₦200,000').first()).toBeVisible();
  await expect(farmer.getByText('They collect from the farm')).toBeVisible();
  await expect(farmer.getByText('None — the buyer collects')).toBeVisible();
  await farmer.getByRole('button', { name: 'Accept offer' }).click();
  await expect(farmer).toHaveURL(/\/bookings\/[0-9a-f-]{36}\?accepted=1$/);
  const bookingId = farmer.url().match(/bookings\/([0-9a-f-]{36})/)![1]!;
  const plan = farmer.getByRole('region', { name: 'The plan' });
  await expect(plan.getByText(new RegExp(`^${processorName} will collect 2,000 kg at .*Akinyele.* for ₦100 per kg\\.$`))).toBeVisible();
  await expect(farmer.getByRole('heading', { level: 2, name: 'Ready to harvest' })).toBeVisible();
  await expect(farmer.getByText(/^Have 2,000 kg ready at /)).toBeVisible();
  // The plan is easy to find on sign-in: "My plans" lists it.
  await farmer.goto('/bookings');
  await expect(farmer.locator(`a[href="/bookings/${bookingId}"]`).first()).toBeVisible();
  const farmerApi = Api.forContext(farmerCtx);
  const confirmed = await farmerApi.get(`/bookings/${bookingId}`);
  expect(confirmed.status).toBe('CONFIRMED');
  expect(confirmed.readiness.ready).toBe(true);
  expect(confirmed.readiness.checks.map((c: { code: string }) => c.code)).not.toContain('VEHICLE_DRIVER_CONFIRMED');

  // ── 6. The buyer collects and records 1,900 kg accepted ──
  await proc.goto(`/bookings/${bookingId}`);
  await expect(proc.getByText(/^Collect 2,000 kg at .+ then record the weight you accept$/)).toBeVisible();
  await proc.getByRole('button', { name: 'Record the weight' }).click();
  const weigh = proc.getByRole('dialog', { name: 'Record the weight' });
  await weigh.getByLabel('Weight received (kg)').fill('1900');
  await weigh.getByLabel('Weight you accept (kg)').fill('1900');
  await weigh.getByRole('button', { name: 'Save weight' }).click();
  await expect(weigh).toBeHidden();
  await expect(proc.getByText('₦190,000').first()).toBeVisible();

  // The farmer sees the final amount and the difference, and can report a problem.
  await farmer.goto(`/bookings/${bookingId}`);
  await expect(farmer.getByRole('region', { name: 'The plan' }).getByText('Final amount')).toBeVisible();
  await expect(farmer.getByText('₦190,000').first()).toBeVisible();
  await expect(farmer.getByText(/100 kg less than agreed/).first()).toBeVisible();

  // ── 7. The buyer records the payment: "Payment reported" until the farmer confirms ──
  await proc.reload();
  await proc.getByRole('button', { name: 'Record payment' }).click();
  const pay = proc.getByRole('dialog', { name: 'Record a payment' });
  await pay.getByLabel('Amount (₦)').fill('190000');
  await pay.getByLabel('Bank or receipt reference').fill(`TRF-${uid()}`);
  await pay.getByRole('button', { name: 'Record payment' }).click();
  await expect(pay).toBeHidden();
  await expect(proc.getByText(/Waiting for .+ to confirm receipt of ₦190,000/).first()).toBeVisible();

  await farmer.reload();
  await expect(farmer.getByRole('heading', { level: 2, name: 'Payment reported' })).toBeVisible();
  await farmer.getByRole('button', { name: 'Yes, I received ₦190,000' }).click();
  await expect(farmer.getByRole('heading', { level: 2, name: 'Paid — sale complete' })).toBeVisible();
  const done = await farmerApi.get(`/bookings/${bookingId}`);
  expect(done.status).toBe('COMPLETED');
  expect(done.plan.payment).toMatchObject({ confirmedPaidKobo: 19_000_000, outstandingKobo: 0 });
  expect(done.current.content.transport).toBeNull();
});
