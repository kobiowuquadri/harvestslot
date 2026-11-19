import { randomUUID } from 'node:crypto';
import { expect, request, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import { BASE_URL, e2eDatabaseUrl } from './env.mjs';

export const PASSWORD = 'E2e-Cassava-Route-2026';
const HOUR = 3_600_000;

/**
 * A browser-like API client for fixture setup: keeps its own cookies, sends the CSRF header and an
 * Idempotency-Key on every write — exactly what the web app does.
 */
export class Api {
  private constructor(readonly ctx: APIRequestContext) {}

  static async create(): Promise<Api> {
    const ctx = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { Origin: BASE_URL } });
    await ctx.get('/api/v1/auth/csrf');
    return new Api(ctx);
  }

  /** Wraps a page's context so API calls share the signed-in browser session. */
  static forContext(context: BrowserContext): Api {
    return new Api(context.request);
  }

  private async csrf(): Promise<string> {
    let token = (await this.ctx.storageState()).cookies.find((c) => c.name === 'hs_csrf')?.value;
    if (!token) {
      await this.ctx.get('/api/v1/auth/csrf');
      token = (await this.ctx.storageState()).cookies.find((c) => c.name === 'hs_csrf')?.value;
    }
    return decodeURIComponent(token ?? '');
  }

  async get<T = any>(path: string): Promise<T> {
    const r = await this.ctx.get(`/api/v1${path}`);
    if (!r.ok()) throw new Error(`GET ${path} → ${r.status()} ${await r.text()}`);
    return (await r.json()) as T;
  }

  async raw(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'GET', path: string, body?: unknown) {
    return this.ctx.fetch(`/api/v1${path}`, {
      method,
      data: body,
      headers: method === 'GET' ? {} : { 'X-CSRF-Token': await this.csrf(), 'Idempotency-Key': randomUUID(), Origin: BASE_URL },
    });
  }

  async send<T = any>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body: unknown = {}): Promise<T> {
    const r = await this.raw(method, path, body);
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${await r.text()}`);
    const text = await r.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  post<T = any>(path: string, body: unknown = {}) {
    return this.send<T>('POST', path, body);
  }
  patch<T = any>(path: string, body: unknown) {
    return this.send<T>('PATCH', path, body);
  }
  put<T = any>(path: string, body: unknown) {
    return this.send<T>('PUT', path, body);
  }

  async login(identifier: string, password = PASSWORD) {
    await this.post('/auth/login', { identifier, password });
  }

  async demo(persona: string) {
    await this.post('/auth/demo-login', { persona });
  }

  async upload(fields: Record<string, string>, file: { name: string; mimeType: string; buffer: Buffer }) {
    const r = await this.ctx.post('/api/v1/uploads', { multipart: { ...fields, file }, headers: { 'X-CSRF-Token': await this.csrf(), Origin: BASE_URL } });
    if (!r.ok()) throw new Error(`upload → ${r.status()} ${await r.text()}`);
    return (await r.json()) as { id: string };
  }
}

export const uid = () => randomUUID().slice(0, 8);

/** A tiny valid PNG for evidence uploads (the API re-encodes images). */
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC', 'base64');

/** YYYY-MM-DD in Lagos, `days` from now. */
export function lagosDate(days: number): string {
  return new Date(Date.now() + days * 24 * HOUR + HOUR).toISOString().slice(0, 10);
}

/** Public registration offers two ways to start (sell or buy); staff join through an invitation. */
export async function register(type: 'FARMER' | 'PROCESSOR' | 'STAFF', label: string) {
  const api = await Api.create();
  const email = `${label}-${uid()}@e2e.example`;
  await api.post('/auth/register', {
    accountType: type,
    displayName: `${label} ${uid()}`,
    email,
    password: PASSWORD,
    ...(type === 'PROCESSOR' ? { organisationName: `E2E ${label} ${uid()}` } : {}),
    acceptTerms: true,
    acceptPrivacy: true,
    contactConsentEmail: false,
    contactConsentSms: false,
  });
  const me = await api.get('/auth/me');
  return { api, email, me, orgId: me.memberships[0]?.organisationId as string | undefined, farmerProfileId: me.farmerProfile?.id as string | undefined };
}

/** Approves an organisation through the real admin endpoint, as the seeded demo administrator. */
export async function approve(orgId: string) {
  const admin = await Api.create();
  await admin.demo('admin');
  const orgs = await admin.get<Array<{ id: string; version: number }>>('/admin/organisations?status=PENDING_REVIEW');
  const org = orgs.find((o) => o.id === orgId);
  if (!org) throw new Error(`organisation ${orgId} not pending`);
  await admin.post(`/admin/organisations/${orgId}/review`, { expectedVersion: org.version, decision: 'APPROVE', reason: 'E2E fixture: documents checked' });
}

export interface Processor {
  api: Api;
  email: string;
  orgId: string;
  facilityId: string;
  lineId: string;
  slot: { id: string; startsAt: string };
}

export async function makeProcessor(opts: { capacityKg?: string; slotDays?: number; indicativePriceKoboPerKg?: number } = {}): Promise<Processor> {
  const p = await register('PROCESSOR', 'processor');
  await approve(p.orgId!);
  const facility = await p.api.post(`/organisations/${p.orgId}/facilities`, {
    name: `E2E Plant ${uid()}`,
    lga: 'Akinyele',
    point: { lat: 7.45, lng: 3.9 },
    qualityCriteria: { maxHoursHarvestToDelivery: 48, soilAndStemsRemoved: true, maxVisibleRotPercent: 5, varietiesAccepted: [] },
    minOrderKg: '500',
    maxPickupDistanceKm: 100,
    indicativePriceKoboPerKg: opts.indicativePriceKoboPerKg ?? 25_000,
    defaultToleranceBps: 500,
    defaultPaymentTermsDays: 7,
    rejectionHandling: 'RETURNED_AT_PROCESSOR_COST',
    cancellationTerms: 'Either party may cancel before harvest starts without penalty.',
  });
  const withLine = await p.api.post(`/facilities/${facility.id}/lines`, { name: 'Garri line', product: 'GARRI' });
  const lineId = withLine.lines[0].id as string;
  const day = lagosDate(opts.slotDays ?? 3);
  const startsAt = new Date(`${day}T07:00:00+01:00`).toISOString();
  const slot = await p.api.post('/slots', { lineId, startsAt, endsAt: new Date(new Date(startsAt).getTime() + 10 * HOUR).toISOString(), processingCapacityKg: opts.capacityKg ?? '5000', purchaseLimitKg: opts.capacityKg ?? '5000', publish: true });
  return { api: p.api, email: p.email, orgId: p.orgId!, facilityId: facility.id, lineId, slot: { id: slot.id, startsAt: slot.startsAt } };
}

export interface Farmer {
  api: Api;
  email: string;
  farmerProfileId: string;
  locationId: string;
}

export async function makeFarmer(): Promise<Farmer> {
  const f = await register('FARMER', 'farmer');
  const loc = await f.api.post(`/farmers/${f.farmerProfileId}/locations`, { label: 'River farm', lga: 'Akinyele', point: { lat: 7.52, lng: 3.92 }, accuracyM: 15, source: 'DEVICE_GPS', directions: 'Second left after the market' });
  return { api: f.api, email: f.email, farmerProfileId: f.farmerProfileId!, locationId: loc.id };
}

export async function makeHarvest(farmer: Farmer, quantityKg = '2000') {
  return farmer.api.post(`/farmers/${farmer.farmerProfileId}/harvests`, {
    farmLocationId: farmer.locationId,
    estimatedQuantityKg: quantityKg,
    earliestHarvestDate: lagosDate(1),
    latestHarvestDate: lagosDate(6),
    transportPreference: 'PROCESSOR_PAYS',
    publish: true,
  });
}

/**
 * Offer terms that fit a processor slot: the buyer collects from the farm (or the farmer delivers)
 * on the slot day, 09:00–13:00 Lagos time.
 */
export function offerTerms(slot: { id: string; startsAt: string }, quantityKg = '2000', priceKoboPerKg = 25_000, handoverArrangement: 'COLLECT_FROM_FARM' | 'FARMER_DELIVERS' = 'COLLECT_FROM_FARM') {
  const s = new Date(slot.startsAt).getTime();
  return {
    slotId: slot.id,
    quantityKg,
    priceKoboPerKg,
    handoverArrangement,
    plannedHarvestDate: new Date(s + HOUR).toISOString().slice(0, 10),
    handoverWindowStart: new Date(s + 2 * HOUR).toISOString(),
    handoverWindowEnd: new Date(s + 6 * HOUR).toISOString(),
  };
}

/** Drives a sale through the API to CONFIRMED: offer (the buyer collects) → the farmer accepts. */
export async function confirmedBooking(opts: { processor?: Processor; priceKoboPerKg?: number } = {}) {
  const processor = opts.processor ?? (await makeProcessor());
  const farmer = await makeFarmer();
  const harvest = await makeHarvest(farmer);
  const offer = await processor.api.post('/offers', { harvestRequestId: harvest.id, ...offerTerms(processor.slot, '2000', opts.priceKoboPerKg) });
  const accepted = await farmer.api.post(`/offers/${offer.id}/accept`, { expectedVersionNo: 1 });
  const booking = await farmer.api.get(`/bookings/${accepted.bookingId}`);
  expect(booking.status).toBe('CONFIRMED');
  return { processor, farmer, harvestId: harvest.id as string, offerId: offer.id as string, bookingId: accepted.bookingId as string };
}

/** Continues a confirmed sale: the buyer records the weight received and accepted. */
export async function weighedBooking(receivedKg: string, acceptedKg: string, rejectionReasons: string[] = []) {
  const f = await confirmedBooking();
  const b = await f.processor.api.get(`/bookings/${f.bookingId}`);
  const rec = await f.processor.api.post(`/bookings/${f.bookingId}/receiving/accepted-weight`, { expectedVersion: b.version, receivedKg, acceptedKg, rejectionReasons });
  return { ...f, rec };
}

/** Test-only: moves an offer's (or just its hold's) expiry into the past in the E2E database. */
export async function backdateOffer(offerId: string, which: 'offer-and-hold' | 'hold-only' = 'offer-and-hold') {
  const client = new pg.Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    const past = new Date(Date.now() - 60_000);
    if (which === 'offer-and-hold') await client.query('UPDATE offers SET "expiresAt" = $1 WHERE id = $2', [past, offerId]);
    await client.query('UPDATE reservations SET "expiresAt" = $1 WHERE "offerId" = $2', [past, offerId]);
  } finally {
    await client.end();
  }
}

/** Opens a page signed in as the given account (sign-in through the API, sharing the browser's cookies). */export async function signedInPage(browser: Browser, identifier: string, opts: { mobile?: boolean; persona?: string; geo?: boolean } = {}): Promise<Page> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    ...(opts.mobile ? { viewport: { width: 375, height: 780 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } }),
    ...(opts.geo ? { geolocation: { latitude: 7.5201, longitude: 3.9199, accuracy: 12 }, permissions: ['geolocation'] } : {}),
  });
  const api = Api.forContext(context);
  await context.request.get(`${BASE_URL}/api/v1/auth/csrf`);
  if (opts.persona) await api.demo(opts.persona);
  else await api.login(identifier);
  return context.newPage();
}
