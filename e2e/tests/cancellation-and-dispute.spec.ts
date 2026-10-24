import { expect, test } from '@playwright/test';
import { confirmedBooking, deliveredBooking, makeTransporter, quoteTerms, signedInPage } from '../support/api';

test('transport cancellation and replacement: the farmer only re-confirms if their pickup changes', async ({ browser }) => {
  const f = await confirmedBooking();
  // The transporter's dispatcher cancels the job (the truck broke down).
  const jobs = await f.transporter.api.get<Array<{ shipmentId: string; bookingId: string }>>(`/organisations/${f.transporter.orgId}/jobs`);
  const job = jobs.find((j) => j.bookingId === f.bookingId)!;
  const disp = await signedInPage(browser, f.transporter.email);
  await disp.goto(`/transport/jobs/${job.shipmentId}`);
  await disp.getByRole('button', { name: 'Cancel this job' }).click();
  const dlg = disp.getByRole('dialog');
  await dlg.getByLabel('Reason').fill('Truck broke down on the Oyo road');
  await dlg.getByRole('button', { name: 'Cancel job' }).click();
  await expect(disp.getByText('Job cancelled').first()).toBeVisible();

  const proc = await signedInPage(browser, f.processor.email);
  await proc.goto(`/bookings/${f.bookingId}`);
  await expect(proc.getByText('Not ready — do not harvest yet')).toBeVisible();

  // A second transporter sees the replacement opportunity and quotes within the agreed windows.
  const replacement = await makeTransporter();
  const opportunities = await replacement.api.get<Array<{ bookingId: string; reason: string }>>(`/organisations/${replacement.orgId}/opportunities`);
  expect(opportunities.find((o) => o.bookingId === f.bookingId)?.reason).toBe('REPLACEMENT');
  const quote = await replacement.api.post(`/organisations/${replacement.orgId}/quotes`, quoteTerms(f.bookingId, replacement.vehicleId, f.processor.slot, 3_800_000));

  await proc.reload();
  await proc.getByRole('button', { name: 'Accept quote' }).click();
  await expect(proc.getByText('Quote accepted').first()).toBeVisible();
  await replacement.api.post('/assignments/accept', { quoteId: quote.id, driverId: replacement.driver.id });

  const b = await f.farmer.api.get(`/bookings/${f.bookingId}`);
  expect(b.status).toBe('CONFIRMED');
  expect(b.readiness.ready).toBe(true);
  expect(b.current.content.transport.transporterName).not.toBe((await f.transporter.api.get(`/organisations/${f.transporter.orgId}`)).name);
  const farmerConfirmation = b.current.confirmations.find((c: { party: string }) => c.party === 'FARMER');
  expect(farmerConfirmation.method).toBe('CARRIED_FORWARD');
});

test('partial acceptance: the farmer disputes the rejected quantity and the undisputed part is still invoiced', async ({ browser }) => {
  const f = await deliveredBooking();
  // Facility records 1,900 kg: 1,800 accepted, 100 rejected.
  let r = await f.processor.api.post(`/bookings/${f.bookingId}/receiving/weighing`, { grossKg: '1900', tareKg: '0', weighingMethod: 'WEIGHBRIDGE', scaleReference: 'WB-77' });
  r = await f.processor.api.post(`/bookings/${f.bookingId}/receiving/decision`, { expectedVersion: r.version, acceptedKg: '1800', rejectedKg: '100', rejectionReasons: ['ROTTEN_OR_DAMAGED'], rejectedDisposition: 'RETURNED_TO_FARMER' });
  expect(r.status).toBe('AWAITING_FARMER_REVIEW');

  const farmer = await signedInPage(browser, f.farmer.email, { mobile: true });
  await farmer.goto(`/bookings/${f.bookingId}/receiving`);
  await farmer.getByLabel(/I disagree/).check();
  await farmer.getByLabel('What do you disagree with?').selectOption('QUALITY_REJECTION');
  await farmer.getByLabel(/Quantity in question/).fill('100');
  await farmer.getByLabel(/Explain what you believe happened/).fill('The roots were fresh at pickup; the driver photo shows no rot.');
  await farmer.getByRole('button', { name: 'Open dispute' }).click();
  await expect(farmer.getByText(/Dispute opened/).first()).toBeVisible();

  const disputes = await f.farmer.api.get<Array<{ id: string; bookingId: string; status: string; category: string }>>('/disputes');
  const d = disputes.find((x) => x.bookingId === f.bookingId)!;
  expect(d.category).toBe('QUALITY_REJECTION');
  // The undisputed 1,800 kg is invoiced at ₦250/kg while the dispute is open.
  const invoices = await f.farmer.api.get<Array<{ kind: string; bookingId: string; totalKobo: number; disputed: boolean }>>('/invoices?role=payee');
  const produce = invoices.find((i) => i.kind === 'PRODUCE' && i.bookingId === f.bookingId)!;
  expect(produce.totalKobo).toBe(45_000_000);

  // The processor answers in the dispute thread.
  const proc = await signedInPage(browser, f.processor.email);
  await proc.goto(`/disputes/${d.id}`);
  await expect(proc.getByText('The roots were fresh at pickup')).toBeVisible();
  await proc.getByLabel('Your message').fill('Photos of the rejected roots are attached to the receiving record.');
  await proc.getByRole('button', { name: 'Send' }).click();
  await expect(proc.getByText('Photos of the rejected roots').first()).toBeVisible();
});
