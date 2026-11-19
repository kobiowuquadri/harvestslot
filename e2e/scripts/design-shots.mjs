// Design review: full-page screenshots of key screens at desktop and phone widths on a running,
// seeded stack. Usage: node scripts/design-shots.mjs <out-dir>   (BASE_URL to override; SKIP_PUBLIC=1 for app screens only)
/* global document, window -- the settle() callback runs inside the page */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = process.argv[2] ?? '.';
const publicPages = process.env.SKIP_PUBLIC ? [] : ['/', '/how-it-works', '/roles', '/faq', '/login', '/register', '/credits'];
const appPages = { farmer: ['/app', '/farmer/harvests/new', '/bookings', '/farmer/harvests', '/invoices'], 'processor-manager': ['/app', '/processor/capacity', '/processor/inbox', '/bookings'], cooperative: ['/app'] };

// Scroll through the page so lazy-loaded images below the fold load before the full-page capture.
async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
}

const browser = await chromium.launch();
for (const [name, viewport, mobile] of [
  ['desktop', { width: 1440, height: 900 }, false],
  ['phone', { width: 390, height: 844 }, true],
]) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(180_000);
  for (const path of publicPages) {
    await page.goto(`${BASE}${path}`);
    await settle(page);
    await page.screenshot({ path: `${OUT}/${name}${path.replace(/\//g, '_') || '_home'}.png`, fullPage: true });
  }
  for (const [persona, paths] of Object.entries(appPages)) {
    const c = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, baseURL: BASE });
    await c.request.get('/api/v1/auth/csrf');
    const csrf = (await c.cookies()).find((k) => k.name === 'hs_csrf')?.value ?? '';
    await c.request.post('/api/v1/auth/demo-login', { data: { persona }, headers: { 'X-CSRF-Token': decodeURIComponent(csrf), Origin: BASE } });
    const p = await c.newPage();
    p.setDefaultNavigationTimeout(180_000);
    for (const path of paths) {
      await p.goto(path);
      await settle(p);
      await p.screenshot({ path: `${OUT}/${name}_${persona}${path.replace(/\//g, '_')}.png`, fullPage: true });
    }
    // The first booking for this persona, if any.
    const list = await (await c.request.get('/api/v1/bookings?view=farmer')).json().catch(() => null);
    if (persona === 'farmer' && list?.items?.[0]) {
      await p.goto(`/bookings/${list.items[0].id}`);
      await settle(p);
      await p.screenshot({ path: `${OUT}/${name}_farmer_booking.png`, fullPage: true });
    }
    await c.close();
  }
  await ctx.close();
}
await browser.close();
console.log('shots written to', OUT);
