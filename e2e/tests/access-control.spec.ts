import { expect, test } from '@playwright/test';
import { Api, confirmedBooking, makeFarmer, signedInPage } from '../support/api';

test.describe('unauthorised access', () => {
  test('signed-out visitors are sent to sign-in for app pages, and the API refuses them', async ({ page, request }) => {
    await page.goto('/bookings');
    await expect(page).toHaveURL(/\/login\?next=%2Fbookings/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    const r = await request.get('/api/v1/bookings');
    expect(r.status()).toBe(401);
  });

  test("another farmer's booking is not visible by direct URL or API", async ({ browser }) => {
    const f = await confirmedBooking();
    const stranger = await makeFarmer();
    const res = await stranger.api.raw('GET', `/bookings/${f.bookingId}`);
    expect(res.status()).toBe(404);
    // Writes are refused the same way — no hint that the booking exists.
    const cancel = await stranger.api.raw('POST', `/bookings/${f.bookingId}/cancel`, { expectedVersion: 1, reason: 'Trying to cancel' });
    expect(cancel.status()).toBe(404);

    const page = await signedInPage(browser, stranger.email);
    await page.goto(`/bookings/${f.bookingId}`);
    await expect(page.getByText('Not found').first()).toBeVisible();
  });

  test('a farmer cannot use admin pages or admin endpoints', async ({ browser }) => {
    const farmer = await makeFarmer();
    const page = await signedInPage(browser, farmer.email);
    await page.goto('/admin/users');
    await expect(page.getByText('Administrators only')).toBeVisible();
    const r = await farmer.api.raw('GET', '/admin/users');
    expect([403, 404]).toContain(r.status());
  });

  test('state-changing requests without the CSRF token are rejected', async () => {
    const farmer = await makeFarmer();
    const r = await farmer.api.ctx.post('/api/v1/auth/logout', { headers: { Origin: process.env.E2E_BASE_URL ?? 'http://localhost:3000' } });
    expect(r.status()).toBe(403);
    expect((await r.json()).error.code).toBe('CSRF_FAILED');
  });

  test('demo persona switching is refused for unknown personas', async () => {
    const api = await Api.create();
    const r = await api.raw('POST', '/auth/demo-login', { persona: 'superuser' });
    expect(r.status()).toBe(422);
    expect((await r.json()).error.code).toBe('VALIDATION_FAILED');
  });
});
