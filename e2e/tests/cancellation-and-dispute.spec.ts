import { expect, test } from '@playwright/test';
import { confirmedBooking, signedInPage, weighedBooking } from '../support/api';

test('the buyer cancels before the handover: the farmer is told and the space is released', async ({ browser }) => {
  const f = await confirmedBooking();
  expect((await f.processor.api.get(`/slots/${f.processor.slot.id}`)).usage.committedKg).toBe('2000.000');

  const proc = await signedInPage(browser, f.processor.email);
  await proc.goto(`/bookings/${f.bookingId}`);
  await proc.getByRole('button', { name: 'Cancel', exact: true }).click();
  const dialog = proc.getByRole('dialog', { name: 'Cancel this plan?' });
  await dialog.getByLabel('Reason').fill('Our grating line is down for repairs this week');
  await dialog.getByRole('button', { name: 'Cancel the plan' }).click();
  await expect(dialog).toBeHidden();

  const farmer = await signedInPage(browser, f.farmer.email, { mobile: true });
  await farmer.goto(`/bookings/${f.bookingId}`);
  await expect(farmer.getByText(/^Cancelled by the processor/).first()).toBeVisible();
  await expect(farmer.getByText('Our grating line is down for repairs this week').first()).toBeVisible();
  await expect(farmer.getByRole('button', { name: 'Record the weight' })).toHaveCount(0);
  expect((await f.processor.api.get(`/slots/${f.processor.slot.id}`)).usage.committedKg).toBe('0.000');
});

test('partial acceptance: the farmer reports a problem and the accepted part is still invoiced', async ({ browser }) => {
  // 1,900 kg received; the buyer accepts 1,800 kg (100 kg rotten).
  const f = await weighedBooking('1900', '1800', ['ROTTEN_OR_DAMAGED']);
  expect(f.rec.status).toBe('AWAITING_FARMER_REVIEW');

  const farmer = await signedInPage(browser, f.farmer.email, { mobile: true });
  await farmer.goto(`/bookings/${f.bookingId}`);
  await expect(farmer.getByRole('heading', { level: 2, name: 'Weight recorded — farmer to check' })).toBeVisible();
  await expect(farmer.getByText('Check the weight: 1,800 kg accepted (200 kg less than agreed). Agree, or report a problem.')).toBeVisible();
  await farmer.getByRole('button', { name: 'Report a problem' }).click();
  const dialog = farmer.getByRole('dialog', { name: 'Report a problem with the weight' });
  await dialog.getByLabel('What is wrong?').selectOption('QUALITY_REJECTION');
  await dialog.getByLabel('Tell us what happened').fill('The roots were fresh when they were loaded; my photos show no rot.');
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog).toBeHidden();
  await expect(farmer.getByRole('heading', { level: 2, name: 'Problem reported' })).toBeVisible();

  const disputes = await f.farmer.api.get<Array<{ id: string; bookingId: string; category: string }>>('/disputes');
  const d = disputes.find((x) => x.bookingId === f.bookingId)!;
  expect(d.category).toBe('QUALITY_REJECTION');
  // The accepted 1,800 kg is invoiced at ₦250/kg while the problem is looked at.
  const invoices = await f.farmer.api.get<Array<{ kind: string; bookingId: string; totalKobo: number }>>('/invoices?role=payee');
  expect(invoices.find((i) => i.kind === 'PRODUCE' && i.bookingId === f.bookingId)!.totalKobo).toBe(45_000_000);

  // The buyer answers in the problem thread.
  const proc = await signedInPage(browser, f.processor.email);
  await proc.goto(`/disputes/${d.id}`);
  await expect(proc.getByText('The roots were fresh when they were loaded')).toBeVisible();
  await proc.getByLabel('Your message').fill('Photos of the refused roots are on the booking.');
  await proc.getByRole('button', { name: 'Send' }).click();
  await expect(proc.getByText('Photos of the refused roots').first()).toBeVisible();
});
