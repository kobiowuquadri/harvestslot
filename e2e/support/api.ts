import { randomUUID } from 'node:crypto';
import { expect, request, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { BASE_URL } from './env.mjs';

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

export async function register(type: 'FARMER' | 'PROCESSOR' | 'TRANSPORTER' | 'COOPERATIVE' | 'STAFF', label: string) {
  const api = await Api.create();
  const email = `${label}-${uid()}@e2e.example`;
  await api.post('/auth/register', {
    accountType: type,
    displayName: `${label} ${uid()}`,
    email,
    password: PASSWORD,
    ...(type === 'STAFF' ? {} : { lga: 'Akinyele' }),
    ...(['PROCESSOR', 'TRANSPORTER', 'COOPERATIVE'].includes(type) ? { organisationName: `E2E ${label} ${uid()}` } : {}),
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

export async function makeProcessor(opts: { capacityKg?: string; slotDays?: number } = {}): Promise<Processor> {
  const p = await register('PROCESSOR', 'processor');
  await approve(p.orgId!);
  const facility = await p.api.post(`/organisations/${p.orgId}/facilities`, {
    name: `E2E Plant ${uid()}`,
    lga: 'Akinyele',
    point: { lat: 7.45, lng: 3.9 },
    qualityCriteria: { maxHoursHarvestToDelivery: 48, soilAndStemsRemoved: true, maxVisibleRotPercent: 5, varietiesAccepted: [] },
    minOrderKg: '500',
    maxPickupDistanceKm: 100,
    indicativePriceKoboPerKg: 25_000,
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

export interface Transporter {
  api: Api;
  email: string;
  orgId: string;
  vehicleId: string;
  vehiclePlate: string;
  driver: { id: string; email: string; name: string };
}

export async function makeTransporter(): Promise<Transporter> {
  const t = await register('TRANSPORTER', 'dispatcher');
  await approve(t.orgId!);
  const plate = `E2E-${uid().slice(0, 4).toUpperCase()}`;
  const vehicles = await t.api.post(`/organisations/${t.orgId}/vehicles`, { registrationPlate: plate, type: 'MEDIUM_TRUCK', capacityKg: '6000' });
  await t.api.put(`/organisations/${t.orgId}/service-areas`, { lgas: ['Akinyele'] });
  await t.api.post(`/organisations/${t.orgId}/availability`, { vehicleId: vehicles[0].id, startsAt: new Date(Date.now() - 24 * HOUR).toISOString(), endsAt: new Date(Date.now() + 30 * 24 * HOUR).toISOString() });
  const driverUser = await register('STAFF', 'driver');
  const name = `Driver ${uid()}`;
  const drivers = await t.api.post(`/organisations/${t.orgId}/drivers`, { emailOrPhone: driverUser.email, displayName: name });
  return { api: t.api, email: t.email, orgId: t.orgId!, vehicleId: vehicles[0].id, vehiclePlate: plate, driver: { id: drivers.find((d: { displayName: string }) => d.displayName === name).id, email: driverUser.email, name } };
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

/** Offer terms that fit a processor slot: pickup the evening before, delivery inside the slot. */
export function offerTerms(slot: { id: string; startsAt: string }, quantityKg = '2000', priceKoboPerKg = 25_000) {
  const s = new Date(slot.startsAt).getTime();
  return {
    slotId: slot.id,
    quantityKg,
    priceKoboPerKg,
    plannedHarvestDate: new Date(s - 20 * HOUR + HOUR).toISOString().slice(0, 10),
    pickupWindowStart: new Date(s - 16 * HOUR).toISOString(),
    pickupWindowEnd: new Date(s - 12 * HOUR).toISOString(),
    deliveryWindowStart: new Date(s).toISOString(),
    deliveryWindowEnd: new Date(s + 4 * HOUR).toISOString(),
    qualityTerms: { maxHoursHarvestToDelivery: 48, soilAndStemsRemoved: true, varietiesAccepted: [] },
    toleranceBps: 500,
    paymentTermsDays: 7,
    freightPayer: 'PROCESSOR',
    rejectionHandling: 'RETURNED_AT_PROCESSOR_COST',
    cancellationTerms: 'Either party may cancel before harvest starts without penalty.',
  };
}

export function quoteTerms(bookingId: string, vehicleId: string, slot: { startsAt: string }, priceKobo = 3_500_000, driverId?: string) {
  const s = new Date(slot.startsAt).getTime();
  return {
    bookingId,
    vehicleId,
    ...(driverId ? { driverId } : {}),
    pickupWindowStart: new Date(s - 15 * HOUR).toISOString(),
    pickupWindowEnd: new Date(s - 13 * HOUR).toISOString(),
    deliveryWindowStart: new Date(s).toISOString(),
    deliveryWindowEnd: new Date(s + 3 * HOUR).toISOString(),
    priceKobo,
    includedServices: ['LOADING', 'OFFLOADING'],
    cancellationTerms: 'Free cancellation up to 12 hours before pickup.',
    validForHours: 24,
  };
}

/** Drives a booking through the API to CONFIRMED (offer accepted, transport assigned). */
export async function confirmedBooking(opts: { processor?: Processor; transporter?: Transporter } = {}) {
  const processor = opts.processor ?? (await makeProcessor());
  const transporter = opts.transporter ?? (await makeTransporter());
  const farmer = await makeFarmer();
  const harvest = await makeHarvest(farmer);
  const offer = await processor.api.post('/offers', { harvestRequestId: harvest.id, ...offerTerms(processor.slot) });
  const accepted = await farmer.api.post(`/offers/${offer.id}/accept`, { expectedVersionNo: 1 });
  const quote = await transporter.api.post(`/organisations/${transporter.orgId}/quotes`, quoteTerms(accepted.bookingId, transporter.vehicleId, processor.slot));
  await processor.api.post(`/quotes/${quote.id}/accept`, { expectedVersion: quote.version });
  await transporter.api.post('/assignments/accept', { quoteId: quote.id, driverId: transporter.driver.id });
  const booking = await farmer.api.get(`/bookings/${accepted.bookingId}`);
  expect(booking.status).toBe('CONFIRMED');
  return { processor, transporter, farmer, harvestId: harvest.id as string, bookingId: accepted.bookingId as string, quoteId: quote.id as string };
}

/** Continues a confirmed booking through harvest, collection, handover and delivery (via the API). */
export async function deliveredBooking() {
  const f = await confirmedBooking();
  const b = await f.farmer.api.get(`/bookings/${f.bookingId}`);
  await f.farmer.api.post(`/bookings/${f.bookingId}/start-harvest`, { expectedVersion: b.version });
  await f.farmer.api.post(`/bookings/${f.bookingId}/ready-for-pickup`, { reportedHarvestedKg: '2000' });
  const driver = await Api.create();
  await driver.login(f.transporter.driver.email);
  const jobs = await f.transporter.api.get(`/organisations/${f.transporter.orgId}/jobs`);
  let job = jobs.find((j: { bookingId: string }) => j.bookingId === f.bookingId);
  job = await driver.post(`/shipments/${job.shipmentId}/depart`, { expectedVersion: job.version });
  job = await driver.post(`/shipments/${job.shipmentId}/arrive-pickup`, { expectedVersion: job.version });
  job = await driver.post(`/shipments/${job.shipmentId}/collection`, { expectedVersion: job.version, quantityKg: '1950' });
  await f.farmer.api.post(`/shipments/${job.shipmentId}/confirm-pickup`, { agree: true });
  job = await driver.get(`/shipments/${job.shipmentId}`);
  job = await driver.post(`/shipments/${job.shipmentId}/leave-pickup`, { expectedVersion: job.version });
  job = await driver.post(`/shipments/${job.shipmentId}/arrive-facility`, { expectedVersion: job.version });
  await f.processor.api.post(`/shipments/${job.shipmentId}/confirm-delivery`);
  return { ...f, driver, shipmentId: job.shipmentId as string };
}

/** Opens a page signed in as the given account (sign-in through the API, sharing the browser's cookies). */
export async function signedInPage(browser: Browser, identifier: string, opts: { mobile?: boolean; persona?: string; geo?: boolean } = {}): Promise<Page> {
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
