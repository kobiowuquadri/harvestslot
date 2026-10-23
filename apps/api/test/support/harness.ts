import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { hash } from '@node-rs/argon2';
import request from 'supertest';
import type { PrismaClient } from '@harvestslot/db';
import { createApp } from '../../src/bootstrap.js';
import { PrismaService } from '../../src/common/prisma.service.js';

export const PASSWORD = 'Correct-Horse-Battery-9';
let passwordHash: Promise<string> | null = null;
const pw = () => (passwordHash ??= hash(PASSWORD, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }));

export interface TestApp {
  app: NestExpressApplication;
  db: PrismaClient;
  close(): Promise<void>;
}

export async function startApp(): Promise<TestApp> {
  const app = await createApp({ logger: false });
  await app.init();
  const db = app.get(PrismaService).db;
  return { app, db, close: () => app.close() };
}

export interface Res<T = unknown> {
  status: number;
  body: T;
  headers: Record<string, string>;
}

/** Minimal browser-like client: keeps cookies, sends the CSRF header and (optionally) Idempotency-Key. */
export class Client {
  private cookies = new Map<string, string>();
  constructor(private readonly app: NestExpressApplication) {}

  private store(headers: Record<string, unknown>) {
    const set = headers['set-cookie'];
    const list = Array.isArray(set) ? set : set ? [String(set)] : [];
    for (const c of list) {
      const [pair] = c.split(';');
      const idx = pair!.indexOf('=');
      const name = pair!.slice(0, idx);
      const value = pair!.slice(idx + 1);
      if (!value || /expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  private cookieHeader() {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async get<T = any>(path: string): Promise<Res<T>> {
    const r = await request(this.app.getHttpServer()).get(`/api/v1${path}`).set('Cookie', this.cookieHeader());
    this.store(r.headers);
    return { status: r.status, body: r.body as T, headers: r.headers as Record<string, string> };
  }

  async send<T = any>(method: 'post' | 'patch' | 'put' | 'delete', path: string, body?: unknown, opts: { idem?: string | boolean; noCsrf?: boolean; origin?: string } = {}): Promise<Res<T>> {
    if (!this.cookies.has('hs_csrf')) await this.get('/auth/csrf');
    let req = request(this.app.getHttpServer())[method](`/api/v1${path}`).set('Cookie', this.cookieHeader()).set('Origin', opts.origin ?? 'http://localhost:3000');
    if (!opts.noCsrf) req = req.set('X-CSRF-Token', decodeURIComponent(this.cookies.get('hs_csrf') ?? ''));
    if (opts.idem) req = req.set('Idempotency-Key', typeof opts.idem === 'string' ? opts.idem : randomUUID());
    const r = await req.send(body as object);
    this.store(r.headers);
    return { status: r.status, body: r.body as T, headers: r.headers as Record<string, string> };
  }

  post<T = any>(path: string, body?: unknown, opts?: { idem?: string | boolean; noCsrf?: boolean; origin?: string }) {
    return this.send<T>('post', path, body ?? {}, opts);
  }
  patch<T = any>(path: string, body?: unknown) {
    return this.send<T>('patch', path, body ?? {});
  }
  put<T = any>(path: string, body?: unknown) {
    return this.send<T>('put', path, body ?? {});
  }

  async login(identifier: string, password = PASSWORD): Promise<Res> {
    const r = await this.post('/auth/login', { identifier, password });
    if (r.status !== 200) throw new Error(`login failed for ${identifier}: ${r.status} ${JSON.stringify(r.body)}`);
    return r;
  }
}

export function expectOk<T>(r: Res<T>, status?: number): T {
  const ok = status === undefined ? r.status >= 200 && r.status < 300 : r.status === status;
  if (!ok) throw new Error(`Expected ${status ?? '2xx'}, got ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body;
}

// ───────────── Fixtures (written directly to the database) ─────────────

const day = 86_400_000;
const lagosDate = (offsetDays: number) => new Date(Date.now() + offsetDays * day + 3_600_000).toISOString().slice(0, 10);

export async function makeUser(db: PrismaClient, label: string, extra: { platformRole?: 'ADMIN' | 'USER' } = {}) {
  const suffix = randomUUID().slice(0, 8);
  return db.user.create({
    data: {
      email: `${label}-${suffix}@test.example`,
      emailVerifiedAt: new Date(),
      passwordHash: await pw(),
      displayName: `${label} ${suffix}`,
      platformRole: extra.platformRole ?? 'USER',
    },
  });
}

export async function makeOrg(db: PrismaClient, type: 'PROCESSOR' | 'TRANSPORTER' | 'COOPERATIVE', ownerId: string, roles: string[] = ['OWNER'], status: 'APPROVED' | 'PENDING_REVIEW' = 'APPROVED') {
  const org = await db.organisation.create({ data: { type, name: `${type} ${randomUUID().slice(0, 6)}`, lga: 'Akinyele', status } });
  await db.membership.create({ data: { userId: ownerId, organisationId: org.id, roles: roles as never } });
  return org;
}

export async function addMember(db: PrismaClient, orgId: string, userId: string, roles: string[]) {
  return db.membership.create({ data: { userId, organisationId: orgId, roles: roles as never } });
}

export async function makeFarmer(db: PrismaClient, opts: { withAccount?: boolean } = {}) {
  const user = opts.withAccount === false ? null : await makeUser(db, 'farmer');
  const profile = await db.farmerProfile.create({
    data: { userId: user?.id ?? null, displayName: user?.displayName ?? `Represented ${randomUUID().slice(0, 6)}`, lga: 'Akinyele', phone: user ? null : `+23480${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, claimStatus: user ? 'SELF_REGISTERED' : 'REPRESENTED_UNCLAIMED' },
  });
  const location = await db.farmLocation.create({
    data: { farmerProfileId: profile.id, label: 'Main farm', lga: 'Akinyele', exactLat: 7.52, exactLng: 3.92, approxLat: 7.52, approxLng: 3.92, source: 'SELF_REPORTED_PIN' },
  });
  return { user, profile, location };
}

export async function makeProcessor(db: PrismaClient, opts: { capacityKg?: string; purchaseLimitKg?: string; slotDayOffset?: number } = {}) {
  const manager = await makeUser(db, 'manager');
  const org = await makeOrg(db, 'PROCESSOR', manager.id, ['OWNER', 'MANAGER']);
  const receiving = await makeUser(db, 'receiving');
  await addMember(db, org.id, receiving.id, ['RECEIVING_OFFICER']);
  const finance = await makeUser(db, 'finance');
  await addMember(db, org.id, finance.id, ['FINANCE_OFFICER']);
  const facility = await db.facility.create({
    data: {
      organisationId: org.id,
      name: `Facility ${randomUUID().slice(0, 6)}`,
      lga: 'Akinyele',
      lat: 7.45,
      lng: 3.9,
      qualityCriteria: { maxHoursHarvestToDelivery: 48, soilAndStemsRemoved: true, varietiesAccepted: [] },
      minOrderKg: '500',
      maxPickupDistanceKm: 100,
      indicativePriceKoboPerKg: 25_000n,
      cancellationTerms: 'Either party may cancel before harvest starts without penalty.',
    },
  });
  const line = await db.processingLine.create({ data: { facilityId: facility.id, name: `Line ${randomUUID().slice(0, 4)}`, product: 'GARRI' } });
  const offset = opts.slotDayOffset ?? 3;
  const startsAt = new Date(`${lagosDate(offset)}T07:00:00+01:00`);
  const slot = await db.processingSlot.create({
    data: {
      lineId: line.id,
      facilityId: facility.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 10 * 3_600_000),
      processingCapacityKg: opts.capacityKg ?? '5000',
      purchaseLimitKg: opts.purchaseLimitKg ?? opts.capacityKg ?? '5000',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      createdByUserId: manager.id,
    },
  });
  return { manager, receiving, finance, org, facility, line, slot };
}

export async function makeTransporter(db: PrismaClient, opts: { vehicles?: number; capacityKg?: string } = {}) {
  const owner = await makeUser(db, 'dispatcher');
  const org = await makeOrg(db, 'TRANSPORTER', owner.id, ['OWNER', 'DISPATCHER']);
  await db.transportServiceArea.create({ data: { organisationId: org.id, lga: 'Akinyele' } });
  const driverUser = await makeUser(db, 'driver');
  await addMember(db, org.id, driverUser.id, ['DRIVER']);
  const driver = await db.driver.create({ data: { organisationId: org.id, userId: driverUser.id, displayName: driverUser.displayName, phone: '+2348000000001' } });
  const vehicles = [];
  for (let i = 0; i < (opts.vehicles ?? 1); i++) {
    const v = await db.vehicle.create({
      data: { organisationId: org.id, registrationPlate: `T${randomUUID().slice(0, 6).toUpperCase()}`, type: 'MEDIUM_TRUCK', capacityKg: opts.capacityKg ?? '6000' },
    });
    await db.transportAvailability.create({ data: { organisationId: org.id, vehicleId: v.id, startsAt: new Date(Date.now() - day), endsAt: new Date(Date.now() + 30 * day), createdByUserId: owner.id } });
    vehicles.push(v);
  }
  return { owner, org, driverUser, driver, vehicles };
}

export async function makeHarvest(db: PrismaClient, farmer: Awaited<ReturnType<typeof makeFarmer>>, quantityKg = '2000') {
  return db.harvestRequest.create({
    data: {
      reference: `HR-T-${randomUUID().slice(0, 8)}`,
      farmerProfileId: farmer.profile.id,
      farmLocationId: farmer.location.id,
      createdByUserId: farmer.user?.id ?? farmer.profile.id,
      status: 'PUBLISHED',
      estimatedQuantityKg: quantityKg,
      eligibleQuantityKg: quantityKg,
      earliestHarvestDate: new Date(`${lagosDate(1)}T00:00:00Z`),
      latestHarvestDate: new Date(`${lagosDate(6)}T00:00:00Z`),
      publishedAt: new Date(),
    },
  });
}

/** Offer terms that fit a fixture slot (pickup the evening before, delivery inside the slot). */
export function offerTerms(slot: { id: string; startsAt: Date }, quantityKg = '2000', priceKoboPerKg = 25_000) {
  const s = slot.startsAt.getTime();
  return {
    slotId: slot.id,
    quantityKg,
    priceKoboPerKg,
    plannedHarvestDate: new Date(s - 20 * 3_600_000 + 3_600_000).toISOString().slice(0, 10),
    pickupWindowStart: new Date(s - 16 * 3_600_000).toISOString(),
    pickupWindowEnd: new Date(s - 12 * 3_600_000).toISOString(),
    deliveryWindowStart: new Date(s).toISOString(),
    deliveryWindowEnd: new Date(s + 4 * 3_600_000).toISOString(),
    qualityTerms: { maxHoursHarvestToDelivery: 48, soilAndStemsRemoved: true, varietiesAccepted: [] },
    toleranceBps: 500,
    paymentTermsDays: 7,
    freightPayer: 'PROCESSOR',
    rejectionHandling: 'RETURNED_AT_PROCESSOR_COST',
    cancellationTerms: 'Either party may cancel before harvest starts without penalty.',
  };
}

export function quoteTerms(bookingId: string, vehicleId: string, slot: { startsAt: Date }, priceKobo = 3_500_000, driverId?: string) {
  const s = slot.startsAt.getTime();
  return {
    bookingId,
    vehicleId,
    ...(driverId ? { driverId } : {}),
    pickupWindowStart: new Date(s - 15 * 3_600_000).toISOString(),
    pickupWindowEnd: new Date(s - 13 * 3_600_000).toISOString(),
    deliveryWindowStart: new Date(s).toISOString(),
    deliveryWindowEnd: new Date(s + 3 * 3_600_000).toISOString(),
    priceKobo,
    includedServices: ['LOADING', 'OFFLOADING'],
    cancellationTerms: 'Free cancellation up to 12 hours before pickup.',
    validForHours: 24,
  };
}

export interface Flow {
  farmer: Awaited<ReturnType<typeof makeFarmer>>;
  processor: Awaited<ReturnType<typeof makeProcessor>>;
  transporter: Awaited<ReturnType<typeof makeTransporter>>;
  harvestId: string;
  offerId: string;
  bookingId: string;
  quoteId?: string;
  farmerClient: Client;
  manager: Client;
  dispatcher: Client;
}

/** Drives a fresh booking through HTTP up to the requested stage. */
export async function bookingFlow(t: TestApp, stage: 'AWAITING' | 'QUOTE_ACCEPTED' | 'CONFIRMED', opts: { quantityKg?: string; capacityKg?: string; processor?: Flow['processor']; transporter?: Flow['transporter'] } = {}): Promise<Flow> {
  const farmer = await makeFarmer(t.db);
  const processor = opts.processor ?? (await makeProcessor(t.db, { capacityKg: opts.capacityKg ?? '5000' }));
  const transporter = opts.transporter ?? (await makeTransporter(t.db));
  const harvest = await makeHarvest(t.db, farmer, opts.quantityKg ?? '2000');
  const farmerClient = new Client(t.app);
  await farmerClient.login(farmer.user!.email!);
  const manager = new Client(t.app);
  await manager.login(processor.manager.email!);
  const dispatcher = new Client(t.app);
  await dispatcher.login(transporter.owner.email!);
  const offer = expectOk(await manager.post('/offers', { harvestRequestId: harvest.id, ...offerTerms(processor.slot, opts.quantityKg ?? '2000') }, { idem: true }));
  const accepted = expectOk(await farmerClient.post(`/offers/${offer.id}/accept`, { expectedVersionNo: 1 }, { idem: true }));
  const flow: Flow = { farmer, processor, transporter, harvestId: harvest.id, offerId: offer.id, bookingId: accepted.bookingId, farmerClient, manager, dispatcher };
  if (stage === 'AWAITING') return flow;
  const quote = expectOk(await dispatcher.post(`/organisations/${transporter.org.id}/quotes`, quoteTerms(accepted.bookingId, transporter.vehicles[0]!.id, processor.slot), { idem: true }));
  expectOk(await manager.post(`/quotes/${quote.id}/accept`, { expectedVersion: quote.version }, { idem: true }));
  flow.quoteId = quote.id;
  if (stage === 'QUOTE_ACCEPTED') return flow;
  expectOk(await dispatcher.post('/assignments/accept', { quoteId: quote.id, driverId: transporter.driver.id }, { idem: true }));
  return flow;
}
