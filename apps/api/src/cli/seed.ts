/**
 * Deterministic demonstration dataset.
 *
 *   pnpm db:seed           (refuses outside APP_ENV=local|demo|test, refuses if demo data exists)
 *
 * Every organisation, farmer and farm pin is fictional and flagged isDemo. Demo accounts use
 * reserved example.* email domains and never receive external messages. Bookings are produced by
 * the real services under a seed-only clock, so terms versions, confirmations, invoices,
 * notifications and audit events are all consistent.
 */
import { installSeedClock, realNow, resetClock, setClock } from './clock.js';
installSeedClock();

import { hash } from '@node-rs/argon2';
import { loadConfig } from '@harvestslot/config';
import { lagosDateString, lagosDateTime, addDays, qualityTermsSchema, type QualityTerms } from '@harvestslot/contracts';
import { recheckReadiness, sweepExpiredHolds, type Actor } from '@harvestslot/core';
import type { PrismaClient } from '@harvestslot/db';
import { DEMO_PERSONAS } from '../modules/auth/auth.service.js';
import { PrismaService } from '../common/prisma.service.js';
import { FacilitiesService } from '../modules/facilities/facilities.service.js';
import { HarvestsService } from '../modules/harvests/harvests.service.js';
import { OffersService } from '../modules/offers/offers.service.js';
import { BookingsService } from '../modules/bookings/bookings.service.js';
import { QuotesService } from '../modules/transport/quotes.service.js';
import { ShipmentsService } from '../modules/transport/shipments.service.js';
import { ReceivingService } from '../modules/receiving/receiving.service.js';
import { FinanceService } from '../modules/finance/finance.service.js';
import { DisputesService } from '../modules/disputes/disputes.service.js';
import { createCliContext } from './context.js';

export const DEMO_PASSWORD = 'HarvestSlot-Demo-2026';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Approximate LGA headquarters coordinates (for list views and LGA-centre distances; approximate). */
const LGAS: Array<[string, number, number]> = [
  ['Afijio', 7.73, 3.92], ['Akinyele', 7.53, 3.92], ['Atiba', 7.85, 3.93], ['Egbeda', 7.38, 3.98],
  ['Ibadan North', 7.4, 3.91], ['Ibadan North-East', 7.39, 3.93], ['Ibadan North-West', 7.39, 3.88],
  ['Ibadan South-East', 7.36, 3.91], ['Ibadan South-West', 7.36, 3.87], ['Ibarapa Central', 7.43, 3.29],
  ['Ido', 7.5, 3.73], ['Iseyin', 7.97, 3.6], ['Itesiwaju', 8.15, 3.55], ['Kajola', 8.03, 3.35],
  ['Lagelu', 7.45, 4.02], ['Ogbomosho North', 8.13, 4.24], ['Ogbomosho South', 8.11, 4.25],
  ['Oluyole', 7.24, 3.84], ['Ona Ara', 7.32, 4.05], ['Oyo East', 7.85, 3.95], ['Oyo West', 7.84, 3.92],
  ['Saki East', 8.6, 3.68], ['Saki West', 8.67, 3.39], ['Surulere', 8.08, 4.4],
];

const today = lagosDateString(new Date());
/** 08:00 Lagos on (today + n days) — the start of that day's processing slot. */
const slotStart = (n: number) => lagosDateTime(addDays(today, n), 8);
const at = (d: Date) => setClock(d);
const ago = (h: number) => new Date(realNow().getTime() - h * HOUR);

function guard() {
  const env = loadConfig();
  if (env.NODE_ENV === 'production' || !['local', 'demo', 'test'].includes(env.APP_ENV)) {
    console.error(`Refusing to seed demo data with NODE_ENV=${env.NODE_ENV} APP_ENV=${env.APP_ENV}. Demo data is for local/demo environments only.`);
    process.exit(1);
  }
}

interface People {
  [key: string]: { id: string; actor: Actor; email: string };
}

async function main() {
  guard();
  const app = await createCliContext();
  const prisma = app.get(PrismaService).db;
  if (await prisma.user.findFirst({ where: { isDemo: true } })) {
    console.error('Demo data is already present. Run `pnpm db:reset` (local only) to start from a clean database, then seed again.');
    await app.close();
    process.exit(1);
  }
  const facilities = app.get(FacilitiesService);
  const harvests = app.get(HarvestsService);
  const offers = app.get(OffersService);
  const bookings = app.get(BookingsService);
  const quotes = app.get(QuotesService);
  const shipments = app.get(ShipmentsService);
  const receiving = app.get(ReceivingService);
  const finance = app.get(FinanceService);
  const disputes = app.get(DisputesService);

  const passwordHash = await hash(DEMO_PASSWORD, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const setupTime = new Date(slotStart(-12).getTime() - 2 * DAY);
  at(setupTime);

  // ── Supported locations ─────────────────────────────────────────────
  for (const [lga, lat, lng] of LGAS) {
    await prisma.supportedLocation.upsert({ where: { state_lga: { state: 'Oyo', lga } }, create: { state: 'Oyo', lga, centerLat: lat, centerLng: lng }, update: {} });
  }

  // ── People ─────────────────────────────────────────────────────────
  const people: People = {};
  const person = async (key: string, email: string, displayName: string, opts: { phone?: string; admin?: boolean } = {}) => {
    const u = await prisma.user.create({
      data: {
        email,
        emailVerifiedAt: new Date(),
        phone: opts.phone ?? null,
        phoneVerifiedAt: opts.phone ? new Date() : null,
        passwordHash,
        displayName,
        platformRole: opts.admin ? 'ADMIN' : 'USER',
        isDemo: true,
        notificationPrefs: { email: true, sms: false, mutedCategories: [] },
      },
    });
    await prisma.consentRecord.createMany({
      data: (['TERMS', 'PRIVACY', 'CONTACT_EMAIL'] as const).map((type) => ({ userId: u.id, type, documentVersion: '2026-10-draft', granted: true, method: 'FARMER_IN_APP' as const })),
    });
    people[key] = { id: u.id, email, actor: { userId: u.id, displayName, platformRole: opts.admin ? 'ADMIN' : 'USER', isDemo: true } };
    return people[key]!;
  };
  // Fictional +234 numbers in the 0700-000-xxxx style are not assigned to real subscribers' demo use;
  // demo SMS is suppressed regardless.
  const fakePhone = (n: number) => `+2347000000${String(n).padStart(3, '0')}`;

  await person('admin', DEMO_PERSONAS.admin, 'Funmi Demo-Admin', { admin: true });

  const org = async (type: 'PROCESSOR' | 'TRANSPORTER' | 'COOPERATIVE', name: string, lga: string, status: 'APPROVED' | 'PENDING_REVIEW' = 'APPROVED') => {
    const o = await prisma.organisation.create({
      data: { type, name, lga, status, isDemo: true, registrationNumber: `DEMO-${Math.floor(100000 + Math.random() * 899999)}`, description: 'Fictional organisation for demonstration only.', reviewedAt: status === 'APPROVED' ? new Date() : null, reviewedByUserId: status === 'APPROVED' ? people.admin!.id : null },
    });
    if (status === 'APPROVED') {
      await prisma.auditEvent.create({ data: { actorUserId: people.admin!.id, actorParty: 'ADMIN', organisationId: o.id, action: 'admin.organisation-approve', entityType: 'organisation', entityId: o.id, reason: 'Demo organisation approved during seeding' } });
    }
    return o;
  };
  const member = (userKey: string, orgId: string, roles: string[]) => prisma.membership.create({ data: { userId: people[userKey]!.id, organisationId: orgId, roles: roles as never } });

  // Processors
  const p1 = await org('PROCESSOR', 'Oluyole Cassava Processing Ltd (Demo)', 'Oluyole');
  await person('manager', DEMO_PERSONAS['processor-manager'], 'Bola Demo-Manager');
  await person('receiving', DEMO_PERSONAS['receiving-officer'], 'Yemi Demo-Receiving');
  await person('finance', DEMO_PERSONAS['finance-officer'], 'Kemi Demo-Finance');
  await member('manager', p1.id, ['OWNER', 'MANAGER']);
  await member('receiving', p1.id, ['RECEIVING_OFFICER']);
  await member('finance', p1.id, ['FINANCE_OFFICER']);
  const p2 = await org('PROCESSOR', 'Akinyele Fresh Flour Mill (Demo)', 'Akinyele');
  await person('p2owner', 'owner@akinyele-flour.demo.harvestslot.example', 'Segun Demo-Miller');
  await member('p2owner', p2.id, ['OWNER', 'MANAGER', 'RECEIVING_OFFICER', 'FINANCE_OFFICER']);
  const p3 = await org('PROCESSOR', 'Iseyin Cassava Hub (Demo)', 'Iseyin');
  await person('p3owner', 'owner@iseyin-hub.demo.harvestslot.example', 'Ronke Demo-Hub');
  await member('p3owner', p3.id, ['OWNER', 'MANAGER', 'RECEIVING_OFFICER', 'FINANCE_OFFICER']);
  const p4 = await org('PROCESSOR', 'Ogbomoso Agro-Processing (Demo)', 'Ogbomosho North', 'PENDING_REVIEW');
  await person('p4owner', 'owner@ogbomoso-agro.demo.harvestslot.example', 'Tayo Demo-Agro');
  await member('p4owner', p4.id, ['OWNER']);

  // Transporters
  const t1 = await org('TRANSPORTER', 'Oke-Ogun Haulage (Demo)', 'Iseyin');
  await person('dispatcher', DEMO_PERSONAS.transporter, 'Musa Demo-Dispatch');
  await member('dispatcher', t1.id, ['OWNER', 'DISPATCHER']);
  const t2 = await org('TRANSPORTER', 'Lagelu Logistics (Demo)', 'Lagelu');
  await person('t2owner', 'owner@lagelu-logistics.demo.harvestslot.example', 'Chidi Demo-Haulier', { phone: fakePhone(21) });
  await member('t2owner', t2.id, ['OWNER', 'DISPATCHER', 'DRIVER']);
  const driverDefs: Array<[string, string, string, string, number]> = [
    ['tunde', DEMO_PERSONAS.driver, 'Tunde Demo-Driver', t1.id, 11],
    ['kunle', 'driver.kunle@demo.harvestslot.example', 'Kunle Demo-Driver', t1.id, 12],
    ['sade', 'driver.sade@demo.harvestslot.example', 'Sade Demo-Driver', t1.id, 13],
  ];
  const drivers: Record<string, string> = {};
  for (const [key, email, name, orgId, n] of driverDefs) {
    await person(key, email, name, { phone: fakePhone(n) });
    await member(key, orgId, ['DRIVER']);
    drivers[key] = (await prisma.driver.create({ data: { organisationId: orgId, userId: people[key]!.id, displayName: name, phone: fakePhone(n), licenceNumber: `DEMO-LIC-${n}` } })).id;
  }
  drivers.chidi = (await prisma.driver.create({ data: { organisationId: t2.id, userId: people.t2owner!.id, displayName: 'Chidi Demo-Haulier', phone: fakePhone(21) } })).id;
  const vehicles: Record<string, string> = {};
  const vdefs: Array<[string, string, string, string, string]> = [
    ['v1', t1.id, 'OYO-101-DM', 'MEDIUM_TRUCK', '5000'],
    ['v2', t1.id, 'OYO-102-DM', 'MEDIUM_TRUCK', '5000'],
    ['v3', t1.id, 'OYO-103-DM', 'LIGHT_TRUCK', '3000'],
    ['v4', t1.id, 'OYO-104-DM', 'HEAVY_TRUCK', '10000'],
    ['v5', t2.id, 'OYO-201-DM', 'LIGHT_TRUCK', '3500'],
    ['v6', t2.id, 'OYO-202-DM', 'MEDIUM_TRUCK', '6000'],
  ];
  for (const [key, orgId, plate, type, cap] of vdefs) {
    const v = await prisma.vehicle.create({ data: { organisationId: orgId, registrationPlate: plate, type: type as never, capacityKg: cap, description: 'Demo vehicle', isDemo: true } });
    vehicles[key] = v.id;
    await prisma.transportAvailability.create({ data: { organisationId: orgId, vehicleId: v.id, startsAt: new Date(setupTime.getTime() - DAY), endsAt: new Date(realNow().getTime() + 30 * DAY), note: 'Available for demo jobs', createdByUserId: orgId === t1.id ? people.dispatcher!.id : people.t2owner!.id } });
  }
  for (const lga of ['Akinyele', 'Iseyin', 'Oluyole', 'Ido', 'Lagelu', 'Afijio', 'Saki West', 'Ogbomosho North', 'Oyo West']) {
    await prisma.transportServiceArea.create({ data: { organisationId: t1.id, lga } });
  }
  for (const lga of ['Akinyele', 'Lagelu', 'Egbeda', 'Ona Ara', 'Ibadan North', 'Oluyole', 'Ido']) {
    await prisma.transportServiceArea.create({ data: { organisationId: t2.id, lga } });
  }

  // Cooperatives
  const c1 = await org('COOPERATIVE', 'Akinyele Cassava Growers Cooperative (Demo)', 'Akinyele');
  await person('rep', DEMO_PERSONAS.cooperative, 'Ade Demo-Representative');
  await person('c1owner', 'chair@akinyele-coop.demo.harvestslot.example', 'Mama Demo-Chair');
  await member('rep', c1.id, ['REPRESENTATIVE']);
  await member('c1owner', c1.id, ['OWNER']);
  const c2 = await org('COOPERATIVE', 'Saki West Farmers Union (Demo)', 'Saki West');
  await person('c2rep', 'rep@saki-union.demo.harvestslot.example', 'Ibrahim Demo-Rep');
  await member('c2rep', c2.id, ['OWNER', 'REPRESENTATIVE']);

  // ── Farmers (9 with accounts, 6 represented) ───────────────────────
  type F = { profileId: string; locationId: string; actor?: Actor; name: string };
  const farmers: Record<string, F> = {};
  const farm = async (key: string, name: string, lga: string, lat: number, lng: number, opts: { email?: string; represented?: { coop: string; scopes: string[] } ; phoneN?: number } = {}) => {
    let userId: string | null = null;
    if (opts.email) {
      const p = await person(key, opts.email, name, { phone: opts.phoneN ? fakePhone(opts.phoneN) : undefined });
      userId = p.id;
    }
    const profile = await prisma.farmerProfile.create({
      data: {
        userId,
        displayName: name,
        phone: opts.phoneN ? fakePhone(opts.phoneN) : null,
        lga,
        community: `${lga} demo community`,
        claimStatus: userId ? 'SELF_REGISTERED' : 'REPRESENTED_UNCLAIMED',
        createdByUserId: userId ?? people.rep!.id,
        createdViaOrgId: opts.represented ? opts.represented.coop : null,
        contactConsentAt: new Date(),
        locationConsentAt: new Date(),
        isDemo: true,
      },
    });
    const loc = await prisma.farmLocation.create({
      data: {
        farmerProfileId: profile.id,
        label: `${name.split(' ')[0]}'s farm (demo pin)`,
        lga,
        community: `${lga} demo community`,
        exactLat: lat,
        exactLng: lng,
        approxLat: Math.round(lat * 100) / 100,
        approxLng: Math.round(lng * 100) / 100,
        accuracyM: 30,
        source: userId ? 'SELF_REPORTED_PIN' : 'COOPERATIVE_REPORTED',
        directions: 'Fictional demo location — follow the farm road past the demo junction.',
        isDemo: true,
      },
    });
    if (opts.represented) {
      await prisma.cooperativeMembership.create({ data: { cooperativeId: opts.represented.coop, farmerProfileId: profile.id, memberRef: `M-${key.toUpperCase()}`, createdByUserId: people.rep!.id } });
      await prisma.delegationConsent.create({
        data: { cooperativeId: opts.represented.coop, farmerProfileId: profile.id, scopes: opts.represented.scopes as never, method: 'RECORDED_BY_REPRESENTATIVE', recordedByUserId: opts.represented.coop === c1.id ? people.rep!.id : people.c2rep!.id, witnessName: 'Demo witness (cooperative secretary)', note: 'Consent recorded in person at a cooperative meeting (demo).' },
      });
    }
    farmers[key] = { profileId: profile.id, locationId: loc.id, actor: userId ? people[key]!.actor : undefined, name };
    return farmers[key]!;
  };
  const ALL_SCOPES = ['ASSIST_DATA_ENTRY', 'APPROVE_SALE', 'CONFIRM_HANDOVER', 'VIEW_FINANCIALS', 'CONFIRM_PAYMENT_RECEIPT'];
  await farm('adunni', 'Adunni Demo-Adebayo', 'Akinyele', 7.538, 3.917, { email: DEMO_PERSONAS.farmer, phoneN: 31 });
  await farm('f2', 'Emeka Demo-Okafor', 'Ido', 7.512, 3.741, { email: 'farmer.emeka@demo.harvestslot.example' });
  await farm('f3', 'Halima Demo-Bello', 'Iseyin', 7.981, 3.611, { email: 'farmer.halima@demo.harvestslot.example' });
  await farm('f4', 'Kayode Demo-Ajayi', 'Akinyele', 7.561, 3.902, { email: 'farmer.kayode@demo.harvestslot.example' });
  await farm('f5', 'Ngozi Demo-Eze', 'Oluyole', 7.251, 3.859, { email: 'farmer.ngozi@demo.harvestslot.example' });
  await farm('f6', 'Tolu Demo-Adeyemi', 'Lagelu', 7.462, 4.011, { email: 'farmer.tolu@demo.harvestslot.example' });
  await farm('f7', 'Bisi Demo-Ogunleye', 'Akinyele', 7.521, 3.943, { email: 'farmer.bisi@demo.harvestslot.example' });
  await farm('f8', 'Femi Demo-Olawale', 'Afijio', 7.722, 3.931, { email: 'farmer.femi@demo.harvestslot.example' });
  await farm('f9', 'Grace Demo-Akande', 'Iseyin', 7.955, 3.588, { email: 'farmer.grace@demo.harvestslot.example' });
  await farm('r1', 'Baba Demo-Alabi', 'Akinyele', 7.548, 3.931, { represented: { coop: c1.id, scopes: ALL_SCOPES }, phoneN: 41 });
  await farm('r2', 'Iya Demo-Oyewole', 'Akinyele', 7.529, 3.956, { represented: { coop: c1.id, scopes: ALL_SCOPES }, phoneN: 42 });
  await farm('r3', 'Sule Demo-Garba', 'Akinyele', 7.571, 3.925, { represented: { coop: c1.id, scopes: ALL_SCOPES }, phoneN: 43 });
  await farm('r4', 'Mojisola Demo-Ige', 'Akinyele', 7.509, 3.898, { represented: { coop: c1.id, scopes: ['ASSIST_DATA_ENTRY'] }, phoneN: 44 });
  await farm('r5', 'Danjuma Demo-Musa', 'Saki West', 8.671, 3.402, { represented: { coop: c2.id, scopes: ALL_SCOPES }, phoneN: 45 });
  await farm('r6', 'Kehinde Demo-Ola', 'Saki West', 8.652, 3.381, { represented: { coop: c2.id, scopes: ALL_SCOPES }, phoneN: 46 });
  // An account farmer who joined the Akinyele cooperative and granted limited permissions in-app.
  await prisma.cooperativeMembership.create({ data: { cooperativeId: c1.id, farmerProfileId: farmers.f7!.profileId, memberRef: 'M-F7' } });
  await prisma.delegationConsent.create({ data: { cooperativeId: c1.id, farmerProfileId: farmers.f7!.profileId, scopes: ['ASSIST_DATA_ENTRY', 'VIEW_FINANCIALS'], method: 'FARMER_IN_APP', recordedByUserId: people.f7!.id } });

  // ── Facilities, lines and slots ────────────────────────────────────
  const criteria = (maxHours: number, varieties: string[] = []): QualityTerms => qualityTermsSchema.parse({ maxHoursHarvestToDelivery: maxHours, soilAndStemsRemoved: true, maxVisibleRotPercent: 5, minRootLengthCm: 15, varietiesAccepted: varieties, notes: 'Fresh roots, harvested no more than the stated hours before delivery.' });
  const fac = async (actorKey: string, orgId: string, name: string, lga: string, lat: number, lng: number, price: number, maxKm: number, crit: QualityTerms) =>
    facilities.create(people[actorKey]!.actor, orgId, {
      name,
      lga,
      address: `${name}, demo industrial road, ${lga}`,
      point: { lat, lng },
      qualityCriteria: crit,
      minOrderKg: '500',
      maxPickupDistanceKm: maxKm,
      indicativePriceKoboPerKg: price,
      defaultToleranceBps: 500,
      defaultPaymentTermsDays: 7,
      rejectionHandling: 'RETURNED_AT_PROCESSOR_COST',
      cancellationTerms: 'Either party may cancel without penalty before harvest starts. After harvest starts, problems are handled as incidents.',
    });
  const f1 = await fac('manager', p1.id, 'Oluyole Garri & Starch Plant', 'Oluyole', 7.246, 3.849, 24_000, 120, criteria(48));
  const f2fac = await fac('p2owner', p2.id, 'Akinyele Flour Mill', 'Akinyele', 7.552, 3.928, 25_500, 60, criteria(36));
  const f3fac = await fac('p3owner', p3.id, 'Iseyin Garri Hub', 'Iseyin', 7.968, 3.603, 23_000, 90, criteria(48));
  await fac('p4owner', p4.id, 'Ogbomoso Chips Plant', 'Ogbomosho North', 8.131, 4.244, 22_500, 80, criteria(48));
  const addLine = async (actorKey: string, facilityId: string, name: string, product: 'GARRI' | 'STARCH' | 'FLOUR') => {
    const f = await facilities.addLine(people[actorKey]!.actor, facilityId, { name, product });
    return f.lines.find((l) => l.name === name)!.id;
  };
  const lines = {
    p1a: await addLine('manager', f1.id, 'Garri line A', 'GARRI'),
    p1b: await addLine('manager', f1.id, 'Starch line', 'STARCH'),
    p2: await addLine('p2owner', f2fac.id, 'Flour line', 'FLOUR'),
    p3: await addLine('p3owner', f3fac.id, 'Garri line', 'GARRI'),
  };
  const slots: Record<string, string> = {};
  const lineCaps: Record<string, [string, string, string]> = { p1a: ['manager', '6000', '5000'], p1b: ['manager', '4000', '4000'], p2: ['p2owner', '3000', '3000'], p3: ['p3owner', '5000', '4500'] };
  for (const [lineKey, [actorKey, proc, purchase]] of Object.entries(lineCaps)) {
    for (let d = -10; d <= 14; d++) {
      const tight = lineKey === 'p2' && d === 9;
      const s = await facilities.createSlot(people[actorKey]!.actor, {
        lineId: lines[lineKey as keyof typeof lines],
        startsAt: slotStart(d).toISOString(),
        endsAt: new Date(slotStart(d).getTime() + 8 * HOUR).toISOString(),
        processingCapacityKg: tight ? '2500' : proc,
        purchaseLimitKg: tight ? '2500' : purchase,
        notes: tight ? 'Reduced intake this day (demo capacity-conflict example)' : undefined,
        publish: true,
      });
      slots[`${lineKey}:${d}`] = s.id;
    }
  }
  const slotInfo = async (key: string) => prisma.processingSlot.findUniqueOrThrow({ where: { id: slots[key]! } });

  // ── Helpers to drive a booking through the real services ──────────
  const processorActor: Record<string, string> = { [p1.id]: 'manager', [p2.id]: 'p2owner', [p3.id]: 'p3owner' };
  const receivingActor: Record<string, string> = { [p1.id]: 'receiving', [p2.id]: 'p2owner', [p3.id]: 'p3owner' };
  const financeActor: Record<string, string> = { [p1.id]: 'finance', [p2.id]: 'p2owner', [p3.id]: 'p3owner' };
  const transporterActor: Record<string, string> = { [t1.id]: 'dispatcher', [t2.id]: 't2owner' };
  const driverUser: Record<string, string> = { tunde: 'tunde', kunle: 'kunle', sade: 'sade', chidi: 't2owner' };
  const vehicleOrg: Record<string, string> = { v1: t1.id, v2: t1.id, v3: t1.id, v4: t1.id, v5: t2.id, v6: t2.id };

  const harvestFor = async (farmerKey: string, qty: string, earliest: number, latest: number, createdAt: Date, actorKey?: string, publish = true) => {
    at(createdAt);
    const f = farmers[farmerKey]!;
    const actor = actorKey ? people[actorKey]!.actor : f.actor!;
    return harvests.create(actor, f.profileId, {
      farmLocationId: f.locationId,
      estimatedQuantityKg: qty,
      earliestHarvestDate: addDays(today, earliest),
      latestHarvestDate: addDays(today, latest),
      variety: 'TME 419',
      cropAgeMonths: 12,
      notes: 'Demo harvest request.',
      transportPreference: 'PROCESSOR_PAYS',
      maxDistanceKm: 150,
      publish,
    });
  };

  interface Scenario {
    farmer: string;
    farmerActor?: string; // coop rep acting
    slot: string;
    processorOrg: string;
    qty: string;
    price: number;
    times: { offer: Date; accept: Date };
    validForHours?: number;
  }
  const createAndAccept = async (s: Scenario, mode: 'ACCEPT' | 'PREPARE' = 'ACCEPT') => {
    const slot = await slotInfo(s.slot);
    const S = slot.startsAt.getTime();
    const h = await harvestFor(s.farmer, s.qty, Math.floor((S - realNow().getTime()) / DAY) - 2, Math.floor((S - realNow().getTime()) / DAY) + 2, new Date(s.times.offer.getTime() - 6 * HOUR), s.farmerActor);
    at(s.times.offer);
    const facility = await prisma.facility.findFirstOrThrow({ where: { organisationId: s.processorOrg } });
    const o = await offers.create(people[processorActor[s.processorOrg]!]!.actor, {
      harvestRequestId: h.id,
      slotId: slot.id,
      quantityKg: s.qty,
      priceKoboPerKg: s.price,
      plannedHarvestDate: lagosDateString(new Date(S - 20 * HOUR)),
      pickupWindowStart: new Date(S - 16 * HOUR).toISOString(),
      pickupWindowEnd: new Date(S - 12 * HOUR).toISOString(),
      deliveryWindowStart: new Date(S).toISOString(),
      deliveryWindowEnd: new Date(S + 4 * HOUR).toISOString(),
      qualityTerms: qualityTermsSchema.parse(facility.qualityCriteria),
      toleranceBps: 500,
      paymentTermsDays: 7,
      freightPayer: 'PROCESSOR',
      rejectionHandling: 'RETURNED_AT_PROCESSOR_COST',
      cancellationTerms: facility.cancellationTerms,
      validForHours: s.validForHours ?? 48,
    });
    at(s.times.accept);
    const farmerSide = s.farmerActor ? people[s.farmerActor]!.actor : farmers[s.farmer]!.actor!;
    const res = await offers.accept(farmerSide, o.id, { expectedVersionNo: 1 }, mode);
    return { bookingId: res.bookingId, S, harvestId: h.id, offerId: o.id };
  };
  const arrangeTransport = async (bookingId: string, S: number, vehicle: string, driver: string, price: number, t: { quote: Date; accept?: Date; assign?: Date }) => {
    const orgId = vehicleOrg[vehicle]!;
    at(t.quote);
    const q = await quotes.submit(people[transporterActor[orgId]!]!.actor, orgId, {
      bookingId,
      vehicleId: vehicles[vehicle]!,
      pickupWindowStart: new Date(S - 15 * HOUR).toISOString(),
      pickupWindowEnd: new Date(S - 13 * HOUR).toISOString(),
      deliveryWindowStart: new Date(S).toISOString(),
      deliveryWindowEnd: new Date(S + 3 * HOUR).toISOString(),
      priceKobo: price,
      includedServices: ['LOADING', 'OFFLOADING', 'TARPAULIN_COVER'],
      cancellationTerms: 'Free cancellation up to 12 hours before pickup; later cancellations are handled as incidents.',
      validForHours: 48,
    });
    if (!t.accept) return q.id;
    at(t.accept);
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    await quotes.accept(people[processorActor[b.processorOrgId]!]!.actor, q.id, { expectedVersion: q.version });
    if (!t.assign) return q.id;
    at(t.assign);
    await quotes.acceptAssignment(people[transporterActor[orgId]!]!.actor, { quoteId: q.id, driverId: drivers[driver]! });
    return q.id;
  };
  const farmerSideActor = (farmerKey: string, actorKey?: string) => (actorKey ? people[actorKey]!.actor : farmers[farmerKey]!.actor!);
  const runToPickup = async (bookingId: string, S: number, farmerKey: string, driver: string, opts: { actorKey?: string; until: 'HARVEST' | 'EN_ROUTE' | 'DELIVERED' } ) => {
    const fa = farmerSideActor(farmerKey, opts.actorKey);
    at(new Date(S - 20 * HOUR));
    const b = await bookings.detail(fa, bookingId);
    await bookings.startHarvest(fa, bookingId, b.version);
    at(new Date(S - 17 * HOUR));
    await bookings.readyForPickup(fa, bookingId, { reportedHarvestedKg: b.current.content.quantityKg });
    if (opts.until === 'HARVEST') return null;
    const driverActor = people[driverUser[driver]!]!.actor;
    const shipment = await prisma.shipment.findFirstOrThrow({ where: { bookingId, status: { not: 'CANCELLED' } } });
    at(new Date(S - 16 * HOUR));
    let job = await shipments.milestone(driverActor, shipment.id, 'depart', { expectedVersion: shipment.version });
    if (opts.until === 'EN_ROUTE') return job;
    at(new Date(S - 15 * HOUR));
    job = await shipments.milestone(driverActor, shipment.id, 'arrivePickup', { expectedVersion: job.version, gps: { point: { lat: 7.5, lng: 3.9 }, accuracyM: 25, source: 'DEVICE_GPS' } });
    at(new Date(S - 14.5 * HOUR));
    await shipments.recordCollection(driverActor, shipment.id, { expectedVersion: job.version, quantityKg: b.current.content.quantityKg, evidenceAttachmentIds: [], note: 'Loaded in 40 bags (demo)' });
    at(new Date(S - 14.4 * HOUR));
    await shipments.confirmPickup(fa, shipment.id, { agree: true });
    const s2 = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    at(new Date(S - 14.3 * HOUR));
    job = await shipments.milestone(driverActor, shipment.id, 'leavePickup', { expectedVersion: s2.version });
    at(new Date(S + 0.5 * HOUR));
    job = await shipments.milestone(driverActor, shipment.id, 'arriveFacility', { expectedVersion: job.version });
    const bk = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    at(new Date(S + 0.6 * HOUR));
    await shipments.confirmDelivery(people[receivingActor[bk.processorOrgId]!]!.actor, shipment.id);
    return job;
  };
  const receive = async (bookingId: string, S: number, gross: string, tare: string, accepted: string, rejected: string, opts: { reasons?: string[]; note?: string } = {}) => {
    const bk = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    const actor = people[receivingActor[bk.processorOrgId]!]!.actor;
    at(new Date(S + 1 * HOUR));
    await receiving.recordWeighing(actor, bookingId, { grossKg: gross, tareKg: tare, weighingMethod: 'WEIGHBRIDGE', scaleReference: `WB-DEMO-${Math.floor(1000 + Math.random() * 8999)}` });
    await receiving.addEvidence(actor, bookingId, { kind: 'WEIGHBRIDGE_TICKET', reference: 'Ticket recorded on paper (demo; no photo attached)' });
    const rec = (await receiving.get(actor, bookingId))!;
    at(new Date(S + 1.5 * HOUR));
    return receiving.submitDecision(actor, bookingId, {
      expectedVersion: rec.version,
      acceptedKg: accepted,
      rejectedKg: rejected,
      rejectionReasons: (opts.reasons ?? []) as never,
      rejectionNote: opts.note,
      rejectedDisposition: Number(rejected) > 0 ? 'RETURNED_TO_FARMER' : 'NONE',
      criteriaResults: { soilAndStemsRemoved: true, visibleRotPercent: Number(rejected) > 0 ? 6 : 2 },
      hoursSinceHarvest: 20,
    });
  };
  const pay = async (bookingId: string, kind: 'PRODUCE' | 'FREIGHT' | 'PLATFORM_FEE', amountKobo: number | 'ALL', when: Date, confirmAt: Date | null, ref: string) => {
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { bookingId_kind: { bookingId, kind } } });
    const payerActor = people[financeActor[inv.payerOrgId!]!]!.actor;
    at(when);
    const amount = amountKobo === 'ALL' ? Number(inv.totalKobo - inv.confirmedPaidKobo) : amountKobo;
    const dto = await finance.reportPayment(payerActor, inv.id, { method: 'BANK_TRANSFER', amountKobo: amount, payerReference: ref, paidOn: lagosDateString(when), evidenceAttachmentIds: [] });
    if (!confirmAt) return;
    at(confirmAt);
    const attempt = dto.payments[dto.payments.length - 1]!;
    let confirmer: Actor;
    if (inv.payeeType === 'FARMER') {
      const profile = await prisma.farmerProfile.findUniqueOrThrow({ where: { id: inv.payeeFarmerId! } });
      confirmer = profile.userId ? people[Object.keys(people).find((k) => people[k]!.id === profile.userId)!]!.actor : people.rep!.actor;
    } else if (inv.payeeType === 'PLATFORM') {
      confirmer = people.admin!.actor;
    } else {
      confirmer = people[transporterActor[inv.payeeOrgId!]!]!.actor;
    }
    await finance.receipt(confirmer, attempt.id, { decision: 'CONFIRMED', note: 'Received (demo)' });
  };

  // ── Historical scenarios ──────────────────────────────────────────
  // H1: Adunni — completed 9 days ago; produce invoice partially paid, one payment awaiting her confirmation.
  {
    const S = slotStart(-9).getTime();
    const { bookingId } = await createAndAccept({ farmer: 'adunni', slot: 'p1a:-9', processorOrg: p1.id, qty: '2000', price: 24_000, times: { offer: new Date(S - 4 * DAY), accept: new Date(S - 3.8 * DAY) } });
    await arrangeTransport(bookingId, S, 'v1', 'tunde', 3_500_000, { quote: new Date(S - 3.5 * DAY), accept: new Date(S - 3.4 * DAY), assign: new Date(S - 3.3 * DAY) });
    await runToPickup(bookingId, S, 'adunni', 'tunde', { until: 'DELIVERED' });
    await receive(bookingId, S, '2050', '100', '1950', '0');
    await pay(bookingId, 'PRODUCE', 30_000_000, new Date(S + 2 * DAY), new Date(S + 3 * DAY), 'GTB-TRF-88120');
    await pay(bookingId, 'PRODUCE', 10_000_000, ago(30), null, 'GTB-TRF-90231');
    await pay(bookingId, 'FREIGHT', 'ALL', new Date(S + 2 * DAY), new Date(S + 2.5 * DAY), 'ACC-FRT-1102');
    await pay(bookingId, 'PLATFORM_FEE', 'ALL', new Date(S + 4 * DAY), new Date(S + 4.5 * DAY), 'HS-FEE-TRF-001');
    at(new Date(S + 1 * DAY));
    await bookings.postMessage(people.manager!.actor, bookingId, { body: 'Thank you — good quality roots. First transfer is on its way.' });
  }
  // H2: Bisi — completed 8 days ago, fully paid, processed.
  {
    const S = slotStart(-8).getTime();
    const { bookingId } = await createAndAccept({ farmer: 'f7', slot: 'p2:-8', processorOrg: p2.id, qty: '1500', price: 25_500, times: { offer: new Date(S - 3 * DAY), accept: new Date(S - 2.9 * DAY) } });
    await arrangeTransport(bookingId, S, 'v5', 'chidi', 2_400_000, { quote: new Date(S - 2.5 * DAY), accept: new Date(S - 2.4 * DAY), assign: new Date(S - 2.3 * DAY) });
    await runToPickup(bookingId, S, 'f7', 'chidi', { until: 'DELIVERED' });
    await receive(bookingId, S, '1500', '0', '1480', '20', { reasons: ['EXCESS_SOIL_OR_STEMS'], note: 'One bag mostly stems' });
    const fa = farmers.f7!.actor!;
    const rec = (await receiving.get(fa, bookingId))!;
    at(new Date(S + 3 * HOUR));
    await receiving.farmerReview(fa, bookingId, { expectedVersion: rec.version, decision: 'ACCEPTED', note: 'Agreed' });
    at(new Date(S + 2 * HOUR));
    await receiving.startProcessing(people.p2owner!.actor, bookingId, { lineId: lines.p2, inputKg: '1480' });
    at(new Date(S + 9 * HOUR));
    await receiving.completeProcessing(people.p2owner!.actor, bookingId, { outputProduct: 'FLOUR', outputKg: '370', handlingLossKg: '12', handlingLossReason: 'Spillage at the grater (measured)' });
    await pay(bookingId, 'PRODUCE', 'ALL', new Date(S + 4 * DAY), new Date(S + 4.2 * DAY), 'FBN-TRF-55120');
    await pay(bookingId, 'FREIGHT', 'ALL', new Date(S + 3 * DAY), new Date(S + 3.1 * DAY), 'FBN-FRT-55121');
    const fee = await prisma.invoice.findUniqueOrThrow({ where: { bookingId_kind: { bookingId, kind: 'PLATFORM_FEE' } } });
    if (loadConfig().PAYMENT_PROVIDER === 'simulated') {
      at(new Date(S + 5 * DAY));
      const c = await finance.checkout(people.p2owner!.actor, fee.id);
      await finance.simulate(people.p2owner!.actor, c.reference, 'success');
    }
  }
  // H3: Femi — completed 7 days ago after a dispute resolved by an administrator.
  {
    const S = slotStart(-7).getTime();
    const { bookingId } = await createAndAccept({ farmer: 'f8', slot: 'p1b:-7', processorOrg: p1.id, qty: '2000', price: 24_500, times: { offer: new Date(S - 3 * DAY), accept: new Date(S - 2.8 * DAY) } });
    await arrangeTransport(bookingId, S, 'v2', 'kunle', 3_800_000, { quote: new Date(S - 2.5 * DAY), accept: new Date(S - 2.4 * DAY), assign: new Date(S - 2.3 * DAY) });
    await runToPickup(bookingId, S, 'f8', 'kunle', { until: 'DELIVERED' });
    await receive(bookingId, S, '1950', '50', '1750', '150', { reasons: ['TOO_LONG_SINCE_HARVEST'], note: 'Some roots harvested more than 48 h earlier' });
    const fa = farmers.f8!.actor!;
    const rec = (await receiving.get(fa, bookingId))!;
    at(new Date(S + 5 * HOUR));
    await receiving.farmerReview(fa, bookingId, { expectedVersion: rec.version, decision: 'DISPUTED', dispute: { category: 'QUALITY_REJECTION', quantityInQuestionKg: '150', description: 'All roots were harvested the evening before pickup, as the driver can confirm.' } });
    const d = await prisma.dispute.findFirstOrThrow({ where: { bookingId } });
    at(new Date(S + 1 * DAY));
    await disputes.message(people.manager!.actor, d.id, { body: 'Our inspector found softening on part of the load; we will share the photos.', evidenceAttachmentIds: [] });
    at(new Date(S + 2 * DAY));
    await disputes.resolve(people.admin!.actor, d.id, { outcome: 'Half of the rejected quantity accepted', rationale: 'The pickup record supports a recent harvest, but the processor documented some softening. Splitting the disputed 150 kg.', revisedAcceptedKg: '1825' });
    await pay(bookingId, 'PRODUCE', 'ALL', new Date(S + 4 * DAY), new Date(S + 4.5 * DAY), 'UBA-TRF-23317');
  }
  // H4: Grace — cancelled by the processor before harvest (line maintenance).
  {
    const S = slotStart(-3).getTime();
    const { bookingId } = await createAndAccept({ farmer: 'f9', slot: 'p3:-3', processorOrg: p3.id, qty: '1200', price: 23_000, times: { offer: new Date(S - 4 * DAY), accept: new Date(S - 3.9 * DAY) } });
    await arrangeTransport(bookingId, S, 'v4', 'sade', 2_600_000, { quote: new Date(S - 3.5 * DAY), accept: new Date(S - 3.4 * DAY), assign: new Date(S - 3.3 * DAY) });
    at(new Date(S - 2 * DAY));
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    await bookings.cancel(people.p3owner!.actor, bookingId, { expectedVersion: b.version, reason: 'Unplanned line maintenance; the processor apologised and cancelled before harvest' }, 'CANCEL');
  }
  // H5: Kayode — expired: accepted, but transport was never confirmed before the hold lapsed.
  {
    const S = slotStart(2).getTime();
    await createAndAccept({ farmer: 'f4', slot: 'p3:2', processorOrg: p3.id, qty: '800', price: 23_000, times: { offer: ago(5 * 24 + 2), accept: ago(5 * 24) } });
    void S;
  }

  // ── Current scenarios ─────────────────────────────────────────────
  // C1: Ngozi — delivered this morning (or yesterday if it is still early); weighed; quality decision pending.
  {
    const d1 = realNow().getTime() > slotStart(0).getTime() + 2 * HOUR ? 0 : -1;
    const S = slotStart(d1).getTime();
    const before = Math.min(S - 3 * DAY, ago(72).getTime());
    const { bookingId } = await createAndAccept({ farmer: 'f5', slot: `p1a:${d1}`, processorOrg: p1.id, qty: '2000', price: 24_000, times: { offer: new Date(before), accept: new Date(before + 2 * HOUR) } });
    await arrangeTransport(bookingId, S, 'v3', 'sade', 3_200_000, { quote: new Date(before + 6 * HOUR), accept: new Date(before + 7 * HOUR), assign: new Date(before + 8 * HOUR) });
    await runToPickup(bookingId, S, 'f5', 'sade', { until: 'DELIVERED' });
    at(new Date(S + 1 * HOUR));
    await receiving.recordWeighing(people.receiving!.actor, bookingId, { grossKg: '2400', tareKg: '500', weighingMethod: 'WEIGHBRIDGE', scaleReference: 'WB-DEMO-4410' });
  }
  // C2: Tolu — yesterday's delivery; 1,900 kg net, 1,800 accepted / 100 rejected; awaiting the farmer's review.
  {
    const S = slotStart(-1).getTime();
    const { bookingId } = await createAndAccept({ farmer: 'f6', slot: 'p2:-1', processorOrg: p2.id, qty: '2000', price: 25_500, times: { offer: new Date(S - 3 * DAY), accept: new Date(S - 2.9 * DAY) } });
    await arrangeTransport(bookingId, S, 'v6', 'chidi', 2_900_000, { quote: new Date(S - 2.5 * DAY), accept: new Date(S - 2.4 * DAY), assign: new Date(S - 2.3 * DAY) });
    await runToPickup(bookingId, S, 'f6', 'chidi', { until: 'DELIVERED' });
    await receive(bookingId, S, '2000', '100', '1800', '100', { reasons: ['ROTTEN_OR_DAMAGED'], note: 'Soft rot found in four bags (photos on the workbench)' });
  }
  // C3: Halima — disputed receiving decision; awaiting the processor's response / admin review.
  {
    const S = slotStart(-2).getTime();
    const { bookingId } = await createAndAccept({ farmer: 'f3', slot: 'p3:-2', processorOrg: p3.id, qty: '1500', price: 23_500, times: { offer: new Date(S - 3 * DAY), accept: new Date(S - 2.9 * DAY) } });
    await arrangeTransport(bookingId, S, 'v4', 'kunle', 3_000_000, { quote: new Date(S - 2.5 * DAY), accept: new Date(S - 2.4 * DAY), assign: new Date(S - 2.3 * DAY) });
    await runToPickup(bookingId, S, 'f3', 'kunle', { until: 'DELIVERED' });
    await receive(bookingId, S, '1500', '40', '1300', '160', { reasons: ['UNDERSIZED'], note: 'Roots below 15 cm' });
    const fa = farmers.f3!.actor!;
    const rec = (await receiving.get(fa, bookingId))!;
    at(new Date(S + 6 * HOUR));
    await receiving.farmerReview(fa, bookingId, { expectedVersion: rec.version, decision: 'DISPUTED', dispute: { category: 'WEIGHT', quantityInQuestionKg: '160', description: 'Our own scale showed 1,520 kg at loading; the rejection for size was not part of the agreed criteria for this variety.' } });
  }
  // C4: Emeka — harvest started, driver Tunde on the way (the pickup window is still open).
  {
    const d4 = [0, 1, 2].find((d) => slotStart(d).getTime() > realNow().getTime() + 9 * HOUR)!;
    const S = slotStart(d4).getTime();
    const { bookingId } = await createAndAccept({ farmer: 'f2', slot: `p1b:${d4}`, processorOrg: p1.id, qty: '1800', price: 24_500, times: { offer: ago(60), accept: ago(58) } });
    await arrangeTransport(bookingId, S, 'v1', 'tunde', 3_100_000, { quote: ago(50), accept: ago(49), assign: ago(48) });
    const startAt = ago(3).getTime();
    at(new Date(startAt));
    const fa = farmers.f2!.actor!;
    const b = await bookings.detail(fa, bookingId);
    await bookings.startHarvest(fa, bookingId, b.version);
    at(ago(1));
    await bookings.readyForPickup(fa, bookingId, { reportedHarvestedKg: '1800' });
    const shipment = await prisma.shipment.findFirstOrThrow({ where: { bookingId, status: { not: 'CANCELLED' } } });
    at(ago(0.5));
    await shipments.milestone(people.tunde!.actor, shipment.id, 'depart', { expectedVersion: shipment.version, note: 'Leaving the depot' });
    void S;
  }
  // C5: Adunni — confirmed and READY TO HARVEST in three days.
  {
    const S = slotStart(3).getTime();
    const { bookingId } = await createAndAccept({ farmer: 'adunni', slot: 'p1a:3', processorOrg: p1.id, qty: '2500', price: 24_500, times: { offer: ago(30), accept: ago(26) } });
    await arrangeTransport(bookingId, S, 'v2', 'kunle', 3_600_000, { quote: ago(20), accept: ago(19), assign: ago(18) });
    at(ago(17));
    await bookings.postMessage(people.dispatcher!.actor, bookingId, { body: 'Kunle will call you the evening before pickup. Please have the roots bagged.' });
  }
  // C6: Bisi — confirmed, but the transporter cancelled: not ready until replacement transport is confirmed.
  {
    const S = slotStart(4).getTime();
    const { bookingId } = await createAndAccept({ farmer: 'f7', slot: 'p2:4', processorOrg: p2.id, qty: '1500', price: 25_500, times: { offer: ago(40), accept: ago(38) } });
    await arrangeTransport(bookingId, S, 'v5', 'chidi', 2_500_000, { quote: ago(30), accept: ago(29), assign: ago(28) });
    at(ago(2));
    const trip = await prisma.tripReservation.findFirstOrThrow({ where: { bookingId, status: 'CONFIRMED' } });
    await quotes.cancelTrip(people.t2owner!.actor, trip.id, 'Truck needs a new gearbox; cannot make this pickup');
  }
  // C7: Grace — accepted, transport not yet arranged (open opportunity for transporters).
  {
    await createAndAccept({ farmer: 'f9', slot: 'p3:5', processorOrg: p3.id, qty: '2200', price: 23_500, times: { offer: ago(8), accept: ago(5) } });
  }
  // C8: Halima — processor accepted a quote; awaiting the transporter to confirm a driver (dispatcher action).
  {
    const S = slotStart(6).getTime();
    const { bookingId } = await createAndAccept({ farmer: 'f3', slot: 'p1b:6', processorOrg: p1.id, qty: '1600', price: 24_500, times: { offer: ago(12), accept: ago(10) } });
    await arrangeTransport(bookingId, S, 'v3', 'sade', 2_800_000, { quote: ago(4), accept: ago(1) });
  }
  // C9: Mojisola (represented, data-entry permission only) — acceptance prepared by the representative, awaiting approval.
  {
    await createAndAccept({ farmer: 'r4', farmerActor: 'rep', slot: 'p2:5', processorOrg: p2.id, qty: '900', price: 25_000, times: { offer: ago(6), accept: ago(2) } }, 'PREPARE');
  }
  // C10: Baba Alabi (represented, full permissions) — confirmed by the cooperative representative acting for him.
  {
    const S = slotStart(7).getTime();
    const { bookingId } = await createAndAccept({ farmer: 'r1', farmerActor: 'rep', slot: 'p1a:7', processorOrg: p1.id, qty: '1200', price: 24_000, times: { offer: ago(20), accept: ago(16) } });
    await arrangeTransport(bookingId, S, 'v6', 'chidi', 2_300_000, { quote: ago(12), accept: ago(11), assign: ago(10) });
  }

  // ── Open requests and offers ──────────────────────────────────────
  // Adunni's second request with two competing offers to compare.
  {
    const h = await harvestFor('adunni', '3000', 6, 12, ago(20));
    for (const [slotKey, orgId, price] of [['p1a:8', p1.id, 25_000], ['p3:9', p3.id, 23_500]] as const) {
      const slot = await slotInfo(slotKey);
      const S = slot.startsAt.getTime();
      const facility = await prisma.facility.findFirstOrThrow({ where: { organisationId: orgId } });
      at(ago(orgId === p1.id ? 10 : 6));
      await offers.create(people[processorActor[orgId]!]!.actor, {
        harvestRequestId: h.id,
        slotId: slot.id,
        quantityKg: '3000',
        priceKoboPerKg: price,
        plannedHarvestDate: lagosDateString(new Date(S - 20 * HOUR)),
        pickupWindowStart: new Date(S - 16 * HOUR).toISOString(),
        pickupWindowEnd: new Date(S - 12 * HOUR).toISOString(),
        deliveryWindowStart: new Date(S).toISOString(),
        deliveryWindowEnd: new Date(S + 4 * HOUR).toISOString(),
        qualityTerms: qualityTermsSchema.parse(facility.qualityCriteria),
        toleranceBps: 500,
        paymentTermsDays: orgId === p1.id ? 7 : 3,
        freightPayer: 'PROCESSOR',
        rejectionHandling: 'RETURNED_AT_PROCESSOR_COST',
        cancellationTerms: facility.cancellationTerms,
        note: orgId === p1.id ? 'We can collect the evening before.' : 'Faster payment: 3 days.',
        validForHours: 96,
      });
    }
  }
  // A tight slot: 2,500 kg capacity with a 2,000 kg hold — a second request cannot overbook it.
  {
    const h = await harvestFor('r5', '2000', 7, 11, ago(14), 'c2rep');
    const slot = await slotInfo('p2:9');
    const S = slot.startsAt.getTime();
    const facility = await prisma.facility.findFirstOrThrow({ where: { organisationId: p2.id } });
    at(ago(9));
    await offers.create(people.p2owner!.actor, {
      harvestRequestId: h.id,
      slotId: slot.id,
      quantityKg: '2000',
      priceKoboPerKg: 25_000,
      plannedHarvestDate: lagosDateString(new Date(S - 20 * HOUR)),
      pickupWindowStart: new Date(S - 16 * HOUR).toISOString(),
      pickupWindowEnd: new Date(S - 12 * HOUR).toISOString(),
      deliveryWindowStart: new Date(S).toISOString(),
      deliveryWindowEnd: new Date(S + 4 * HOUR).toISOString(),
      qualityTerms: qualityTermsSchema.parse(facility.qualityCriteria),
      toleranceBps: 500,
      paymentTermsDays: 7,
      freightPayer: 'PROCESSOR',
      rejectionHandling: 'RETURNED_AT_PROCESSOR_COST',
      cancellationTerms: facility.cancellationTerms,
      validForHours: 120,
    });
  }
  await harvestFor('r6', '1000', 8, 12, ago(12), 'c2rep');
  await harvestFor('r2', '1400', 4, 10, ago(30), 'rep');
  await harvestFor('f4', '1700', 5, 14, ago(36));
  // Drafts, a closed and a withdrawn request.
  await harvestFor('f2', '1200', 9, 14, ago(5), undefined, false);
  await harvestFor('r3', '800', 10, 14, ago(4), 'rep', false);
  {
    const h = await harvestFor('f5', '900', 4, 9, ago(50));
    at(ago(40));
    await harvests.end(farmers.f5!.actor!, h.id, h.version, 'Sold part of the field to a local trader before offers arrived', 'CLOSE');
  }
  {
    const h = await harvestFor('f8', '1100', 5, 9, ago(45));
    at(ago(44));
    await harvests.end(farmers.f8!.actor!, h.id, h.version, 'Crop needs another month to mature', 'WITHDRAW');
  }

  // ── Bring everything to the real present ──────────────────────────
  resetClock();
  const now = realNow();
  const swept = await sweepExpiredHolds(prisma as PrismaClient, now);
  await recheckReadiness(prisma as PrismaClient, now);
  const counts = {
    users: await prisma.user.count({ where: { isDemo: true } }),
    farmers: await prisma.farmerProfile.count({ where: { isDemo: true } }),
    organisations: await prisma.organisation.count({ where: { isDemo: true } }),
    vehicles: await prisma.vehicle.count({ where: { isDemo: true } }),
    harvestRequests: await prisma.harvestRequest.count({ where: { isDemo: true } }),
    slots: await prisma.processingSlot.count({ where: { isDemo: true } }),
    bookings: Object.fromEntries((await prisma.booking.groupBy({ by: ['status'], where: { isDemo: true }, _count: true })).map((g) => [g.status, g._count])),
    invoices: await prisma.invoice.count({ where: { isDemo: true } }),
    disputes: await prisma.dispute.count({ where: { isDemo: true } }),
    notifications: await prisma.notification.count({ where: { isDemo: true } }),
    expiredBySweep: swept.bookingsExpired,
  };
  console.warn('Demo data seeded:', JSON.stringify(counts, null, 2));
  console.warn(`Demo password for every demo account: ${DEMO_PASSWORD}`);
  await app.close();
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
