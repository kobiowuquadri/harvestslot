// Page scan: signs in as each demo persona on a running stack and visits the main screens, reporting
// console errors and error alerts. Usage: node scripts/page-scan.mjs [screenshot-dir] (BASE_URL to override).
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = process.argv[2];
const plan = {
  farmer: ['/app', '/farmer/harvests', '/farmer/harvests/new', '/bookings', '/invoices', '/farmer/locations', '/farmer/permissions', '/notifications', '/settings', '/settings/security', '/settings/privacy', '/disputes'],
  'processor-manager': ['/app', '/processor/inbox', '/processor/offers', '/processor/capacity', '/processor/facilities', '/processor/intake', '/processor/receiving', '/bookings', '/invoices', '/reports', '/organisation'],
  transporter: ['/app', '/transport/opportunities', '/transport/quotes', '/transport/jobs', '/transport/fleet', '/invoices'],
  cooperative: ['/app', '/coop/members', '/coop/members/new', '/bookings', '/reports'],
  admin: ['/admin', '/admin/organisations', '/admin/users', '/admin/incidents', '/admin/disputes', '/admin/policies', '/admin/locations', '/admin/integrations', '/admin/outbox', '/admin/audit', '/admin/exports', '/admin/data-requests', '/admin/analytics', '/bookings', '/dev/mailbox'],
};
const browser = await chromium.launch();
let problems = 0;
for (const [persona, paths] of Object.entries(plan)) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/login`);
  await page.request.get(`${BASE}/api/v1/auth/csrf`);
  const csrf = (await ctx.cookies()).find((c) => c.name === 'hs_csrf')?.value;
  const r = await page.request.post(`${BASE}/api/v1/auth/demo-login`, { data: { persona }, headers: { 'X-CSRF-Token': csrf, Origin: BASE } });
  if (!r.ok()) throw new Error(`demo login ${persona}: ${r.status()} ${await r.text()}`);
  for (const p of paths) {
    errors.length = 0;
    await page.goto(`${BASE}${p}`);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(400);
    const alerts = (await page.locator('main [role=alert]').allInnerTexts()).filter((t) => t.trim());
    const h1 = await page.locator('h1').first().innerText().catch(() => '(no h1)');
    const bad = errors.filter((e) => !e.includes('favicon'));
    const flag = bad.length || alerts.length ? 'PROBLEM' : 'ok';
    if (flag !== 'ok') problems++;
    console.log(`${flag.padEnd(7)} ${persona.padEnd(18)} ${p.padEnd(28)} h1="${h1.slice(0, 40)}"${alerts.length ? ` alerts=${JSON.stringify(alerts).slice(0, 200)}` : ''}${bad.length ? ` errors=${JSON.stringify(bad).slice(0, 300)}` : ''}`);
    if (OUT) await page.screenshot({ path: `${OUT}/${persona}${p.replace(/\//g, '_')}.png`, fullPage: false });
  }
  await ctx.close();
}
await browser.close();
console.log(`problems: ${problems}`);
