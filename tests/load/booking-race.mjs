// Booking race and API smoke load test.
//
//   node tests/load/booking-race.mjs                 (against http://localhost:3000)
//   BASE_URL=https://staging.example node tests/load/booking-race.mjs --farmers 40 --slot-kg 10000
//
// Offers hold slot capacity when issued; supply is allocated when the farmer accepts (DECISIONS #10).
// Workload:
//   A. Capacity race: one processor issues N 1,000 kg offers (one per farmer request) to a single
//      slot at the same instant. Exactly floor(slot / 1,000) may succeed; the rest must be refused
//      with CAPACITY_EXCEEDED, and the slot must never be oversold.
//   B. Supply race: P processors each hold a 1,000 kg offer on one farmer's 2,000 kg request; the
//      farmer accepts all P at the same instant. Exactly 2 may succeed; allocation never exceeds 2,000 kg.
//   C. Read load: R rounds of GET /bookings and GET /harvests by every farmer concurrently.
// Requirements: a stack with DEMO_MODE (the seeded demo administrator approves organisations) and
// APP_ENV=test (higher per-IP limits). `node e2e/stack.mjs` starts an isolated one.
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    farmers: { type: 'string', default: '20' },
    'slot-kg': { type: 'string', default: '5000' },
    processors: { type: 'string', default: '5' },
    rounds: { type: 'string', default: '5' },
  },
});
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const N = Number(values.farmers);
const SLOT_KG = Number(values['slot-kg']);
const P = Number(values.processors);
const ROUNDS = Number(values.rounds);
const PASSWORD = 'Load-Test-Cassava-2026';
const HOUR = 3_600_000;

class Client {
  cookies = new Map();
  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  async req(method, path, body) {
    if (method !== 'GET' && !this.cookies.has('hs_csrf')) await this.req('GET', '/auth/csrf');
    const headers = { Accept: 'application/json', Origin: BASE, Cookie: this.cookieHeader() };
    if (method !== 'GET') {
      headers['X-CSRF-Token'] = decodeURIComponent(this.cookies.get('hs_csrf'));
      headers['Idempotency-Key'] = randomUUID();
      headers['Content-Type'] = 'application/json';
    }
    const started = performance.now();
    const res = await fetch(`${BASE}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const ms = performance.now() - started;
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined, ms };
  }
  async ok(method, path, body) {
    const r = await this.req(method, path, body);
    if (r.status >= 300) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  }
}

const id = () => randomUUID().slice(0, 8);
const lagosDate = (days) => new Date(Date.now() + days * 24 * HOUR + HOUR).toISOString().slice(0, 10);
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)].toFixed(0) : '-';
};
const latency = (rs) => `p50 ${pct(rs.map((r) => r.ms), 50)} ms, p95 ${pct(rs.map((r) => r.ms), 95)} ms, max ${pct(rs.map((r) => r.ms), 100)} ms`;
function tally(results) {
  const codes = {};
  for (const r of results) {
    const key = r.status < 300 ? `${r.status} OK` : `${r.status} ${r.body?.error?.code}`;
    codes[key] = (codes[key] ?? 0) + 1;
  }
  return codes;
}

async function register(type, label) {
  const c = new Client();
  const email = `${label}-${id()}@load.example`;
  await c.ok('POST', '/auth/register', {
    accountType: type,
    displayName: `${label} ${id()}`,
    email,
    password: PASSWORD,
    lga: 'Akinyele',
    ...(type === 'FARMER' ? {} : { organisationName: `Load ${label} ${id()}` }),
    acceptTerms: true,
    acceptPrivacy: true,
    contactConsentEmail: false,
    contactConsentSms: false,
  });
  return { c, me: await c.ok('GET', '/auth/me') };
}

const admin = new Client();
await admin.ok('POST', '/auth/demo-login', { persona: 'admin' });

async function approvedProcessor(slotKg) {
  const p = await register('PROCESSOR', 'processor');
  const orgId = p.me.memberships[0].organisationId;
  const pending = await admin.ok('GET', '/admin/organisations?status=PENDING_REVIEW');
  await admin.ok('POST', `/admin/organisations/${orgId}/review`, { expectedVersion: pending.find((o) => o.id === orgId).version, decision: 'APPROVE', reason: 'Load test fixture' });
  const facility = await p.c.ok('POST', `/organisations/${orgId}/facilities`, {
    name: `Load plant ${id()}`,
    lga: 'Akinyele',
    point: { lat: 7.45, lng: 3.9 },
    qualityCriteria: { maxHoursHarvestToDelivery: 48, soilAndStemsRemoved: true, varietiesAccepted: [] },
    minOrderKg: '500',
    maxPickupDistanceKm: 100,
    cancellationTerms: 'Either party may cancel before harvest starts.',
  });
  const line = (await p.c.ok('POST', `/facilities/${facility.id}/lines`, { name: 'Line 1', product: 'GARRI' })).lines[0];
  const startsAt = new Date(`${lagosDate(3)}T07:00:00+01:00`).getTime();
  const slot = await p.c.ok('POST', '/slots', { lineId: line.id, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(startsAt + 10 * HOUR).toISOString(), processingCapacityKg: String(slotKg), purchaseLimitKg: String(slotKg), publish: true });
  return { c: p.c, slot, startsAt };
}

async function farmerWithHarvest(kg) {
  const f = await register('FARMER', 'farmer');
  const fid = f.me.farmerProfile.id;
  const loc = await f.c.ok('POST', `/farmers/${fid}/locations`, { label: 'Farm', lga: 'Akinyele', point: { lat: 7.52, lng: 3.92 }, accuracyM: 20, source: 'DEVICE_GPS' });
  const h = await f.c.ok('POST', `/farmers/${fid}/harvests`, { farmLocationId: loc.id, estimatedQuantityKg: String(kg), earliestHarvestDate: lagosDate(1), latestHarvestDate: lagosDate(6), transportPreference: 'PROCESSOR_PAYS', publish: true });
  return { c: f.c, harvestId: h.id };
}

function offerBody(harvestId, slotId, startsAt) {
  return {
    harvestRequestId: harvestId,
    slotId,
    quantityKg: '1000',
    priceKoboPerKg: 25_000,
    plannedHarvestDate: new Date(startsAt - 19 * HOUR).toISOString().slice(0, 10),
    pickupWindowStart: new Date(startsAt - 16 * HOUR).toISOString(),
    pickupWindowEnd: new Date(startsAt - 12 * HOUR).toISOString(),
    deliveryWindowStart: new Date(startsAt).toISOString(),
    deliveryWindowEnd: new Date(startsAt + 4 * HOUR).toISOString(),
    qualityTerms: { maxHoursHarvestToDelivery: 48, soilAndStemsRemoved: true, varietiesAccepted: [] },
    toleranceBps: 500,
    paymentTermsDays: 7,
    freightPayer: 'PROCESSOR',
    rejectionHandling: 'RETURNED_AT_PROCESSOR_COST',
    cancellationTerms: 'Either party may cancel before harvest starts.',
  };
}

const failures = [];
const t0 = performance.now();
console.log(`HarvestSlot load test at ${BASE}`);

// ── A. Capacity race ──
const proc = await approvedProcessor(SLOT_KG);
const farmers = [];
for (let i = 0; i < N; i++) farmers.push(await farmerWithHarvest(1000));
console.log(`setup A: 1 processor and ${N} farmers with 1,000 kg requests (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
let start = performance.now();
const offers = await Promise.all(farmers.map((f) => proc.c.req('POST', '/offers', offerBody(f.harvestId, proc.slot.id, proc.startsAt))));
const raceA = performance.now() - start;
const usageA = (await proc.c.ok('GET', `/slots/${proc.slot.id}`)).usage;
const expectA = Math.min(N, Math.floor(SLOT_KG / 1000));
const wonA = offers.filter((r) => r.status < 300).length;
const reservedA = Number(usageA.heldKg) + Number(usageA.committedKg) + Number(usageA.consumedKg);
console.log(`race A: ${N} simultaneous 1,000 kg offers on a ${SLOT_KG.toLocaleString()} kg slot in ${raceA.toFixed(0)} ms → ${JSON.stringify(tally(offers))}; ${latency(offers)}`);
console.log(`        slot after race: held ${usageA.heldKg} kg, committed ${usageA.committedKg} kg, available ${usageA.availableKg} kg`);
if (wonA !== expectA) failures.push(`race A: expected exactly ${expectA} offers to succeed, got ${wonA}`);
if (reservedA > SLOT_KG) failures.push(`race A: slot oversold (${reservedA} kg > ${SLOT_KG} kg)`);
if (offers.some((r) => r.status >= 300 && r.body?.error?.code !== 'CAPACITY_EXCEEDED')) failures.push('race A: a losing offer failed with something other than CAPACITY_EXCEEDED');

// ── B. Supply race ──
const target = await farmerWithHarvest(2000);
const bOffers = [];
for (let i = 0; i < P; i++) {
  const pr = await approvedProcessor(5000);
  bOffers.push(await pr.c.ok('POST', '/offers', offerBody(target.harvestId, pr.slot.id, pr.startsAt)));
}
start = performance.now();
const accepts = await Promise.all(bOffers.map((o) => target.c.req('POST', `/offers/${o.id}/accept`, { expectedVersionNo: 1 })));
const raceB = performance.now() - start;
const allocation = (await target.c.ok('GET', `/harvests/${target.harvestId}`)).allocation;
const wonB = accepts.filter((r) => r.status < 300).length;
console.log(`race B: ${P} simultaneous acceptances of 1,000 kg offers on a 2,000 kg request in ${raceB.toFixed(0)} ms → ${JSON.stringify(tally(accepts))}; ${latency(accepts)}`);
console.log(`        request after race: allocated ${allocation.allocatedKg} kg of ${allocation.eligibleKg} kg`);
if (wonB !== Math.min(P, 2)) failures.push(`race B: expected exactly ${Math.min(P, 2)} acceptances to succeed, got ${wonB}`);
if (Number(allocation.allocatedKg) > 2000) failures.push(`race B: supply over-allocated (${allocation.allocatedKg} kg)`);

// ── C. Read load ──
const reads = [];
start = performance.now();
for (let r = 0; r < ROUNDS; r++) {
  reads.push(...(await Promise.all(farmers.flatMap((f) => [f.c.req('GET', '/bookings?view=farmer'), f.c.req('GET', '/harvests')]))));
}
const readSec = (performance.now() - start) / 1000;
const readErrors = reads.filter((r) => r.status !== 200).length;
console.log(`reads: ${reads.length} requests in ${readSec.toFixed(1)}s (${(reads.length / readSec).toFixed(0)}/s with ${farmers.length * 2} in flight), errors ${readErrors}; ${latency(reads)}`);
if (readErrors) failures.push(`${readErrors} read errors`);

if (failures.length) {
  console.error(`FAILED:\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log('PASSED: no capacity or supply was oversold; every losing request was refused cleanly.');
