import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  availabilityInputSchema,
  driverInputSchema,
  phoneNumber,
  serviceAreasSchema,
  updateDriverSchema,
  updateVehicleSchema,
  vehicleInputSchema,
  type BookingTermsContent,
  type DriverDto,
  type OpportunityDto,
  type VehicleDto,
} from '@harvestslot/contracts';
import { audit, DomainError, haversineKm, round1, withTransaction, type Actor } from '@harvestslot/core';
import type { Db } from '@harvestslot/db';
import { AccessService } from '../../common/access.service.js';
import { PrismaService } from '../../common/prisma.service.js';
import { kg, kobo } from '../../common/serialize.js';

/** Trips that occupy a vehicle or driver at `now`: confirmed/in progress, or held and not yet expired. */
export function occupyingTrips(now: Date) {
  return { OR: [{ status: { in: ['CONFIRMED' as const, 'IN_PROGRESS' as const] } }, { status: 'HELD' as const, expiresAt: { gt: now } }] };
}

export async function conflicts(
  db: Db,
  block: { start: Date; end: Date },
  who: { vehicleId?: string; driverId?: string | null },
  now: Date,
  excludeTripId?: string,
): Promise<{ vehicle: boolean; driver: boolean }> {
  const base = { blockStartsAt: { lt: block.end }, blockEndsAt: { gt: block.start }, ...(excludeTripId ? { id: { not: excludeTripId } } : {}), AND: [occupyingTrips(now)] };
  const vehicle = who.vehicleId ? (await db.tripReservation.count({ where: { ...base, vehicleId: who.vehicleId } })) > 0 : false;
  const driver = who.driverId ? (await db.tripReservation.count({ where: { ...base, driverId: who.driverId } })) > 0 : false;
  return { vehicle, driver };
}

@Injectable()
export class FleetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async vehicles(actor: Actor, orgId: string): Promise<VehicleDto[]> {
    await this.access.requireOrg(actor, orgId, 'transport.job.view');
    const now = new Date();
    const rows = await this.prisma.db.vehicle.findMany({
      where: { organisationId: orgId },
      include: { trips: { where: { ...occupyingTrips(now), endsAt: { gt: now } }, orderBy: { startsAt: 'asc' }, take: 1, include: { booking: { select: { reference: true } } } } },
      orderBy: { registrationPlate: 'asc' },
    });
    return rows.map((v) => ({
      id: v.id,
      registrationPlate: v.registrationPlate,
      type: v.type,
      capacityKg: kg(v.capacityKg),
      description: v.description,
      status: v.status,
      isDemo: v.isDemo,
      version: v.version,
      nextCommitment: v.trips[0] ? { bookingReference: v.trips[0].booking.reference, startsAt: v.trips[0].startsAt.toISOString(), endsAt: v.trips[0].endsAt.toISOString() } : null,
    }));
  }

  async addVehicle(actor: Actor, orgId: string, input: z.infer<typeof vehicleInputSchema>): Promise<VehicleDto[]> {
    await this.access.requireOrg(actor, orgId, 'transport.fleet.manage');
    const org = await this.prisma.db.organisation.findUniqueOrThrow({ where: { id: orgId } });
    const v = await this.prisma.db.vehicle.create({
      data: { organisationId: orgId, registrationPlate: input.registrationPlate, type: input.type, capacityKg: input.capacityKg, description: input.description ?? null, isDemo: org.isDemo },
    });
    await audit(this.prisma.db, { actor, organisationId: orgId, action: 'vehicle.added', entityType: 'vehicle', entityId: v.id });
    return this.vehicles(actor, orgId);
  }

  async updateVehicle(actor: Actor, vehicleId: string, input: z.infer<typeof updateVehicleSchema>): Promise<VehicleDto[]> {
    const v = await this.prisma.db.vehicle.findUnique({ where: { id: vehicleId } });
    if (!v) throw new DomainError('NOT_FOUND', 'Vehicle not found');
    await this.access.requireOrg(actor, v.organisationId, 'transport.fleet.manage');
    const { expectedVersion, ...rest } = input;
    if (rest.status && rest.status !== 'ACTIVE') {
      const now = new Date();
      const busy = await this.prisma.db.tripReservation.count({ where: { vehicleId, endsAt: { gt: now }, ...occupyingTrips(now) } });
      if (busy) throw new DomainError('VEHICLE_CONFLICT', 'This vehicle has upcoming trips. Cancel or reassign them first.');
    }
    if (rest.capacityKg) {
      const now = new Date();
      const bigger = await this.prisma.db.tripReservation.findFirst({ where: { vehicleId, endsAt: { gt: now }, ...occupyingTrips(now) }, include: { booking: { select: { termsVersions: { select: { quantityKg: true }, orderBy: { versionNo: 'desc' }, take: 1 } } } } });
      if (bigger && Number(bigger.booking.termsVersions[0]?.quantityKg ?? 0) > Number(rest.capacityKg)) {
        throw new DomainError('VEHICLE_CAPACITY_EXCEEDED', 'An upcoming trip carries more than the new capacity');
      }
    }
    const r = await this.prisma.db.vehicle.updateMany({ where: { id: vehicleId, version: expectedVersion }, data: { ...rest, version: { increment: 1 } } });
    if (r.count !== 1) throw new DomainError('VERSION_CONFLICT', 'The vehicle changed elsewhere. Reload and try again.');
    await audit(this.prisma.db, { actor, organisationId: v.organisationId, action: 'vehicle.updated', entityType: 'vehicle', entityId: vehicleId, data: { fields: Object.keys(rest) } });
    return this.vehicles(actor, v.organisationId);
  }

  async drivers(actor: Actor, orgId: string): Promise<DriverDto[]> {
    await this.access.requireOrg(actor, orgId, 'transport.job.view');
    const rows = await this.prisma.db.driver.findMany({ where: { organisationId: orgId }, orderBy: { displayName: 'asc' } });
    return rows.map((d) => ({ id: d.id, userId: d.userId, displayName: d.displayName, phone: d.phone, licenceNumber: d.licenceNumber, status: d.status, version: d.version }));
  }

  /** Adds an existing user as a driver (DRIVER membership). New people are invited by email from Staff. */
  async addDriver(actor: Actor, orgId: string, input: z.infer<typeof driverInputSchema>): Promise<DriverDto[]> {
    await this.access.requireOrg(actor, orgId, 'transport.staff.manage');
    const id = input.emailOrPhone.trim();
    const phone = phoneNumber.safeParse(id);
    const user = await this.prisma.db.user.findFirst({ where: id.includes('@') ? { email: id.toLowerCase() } : phone.success ? { phone: phone.data } : { id: '00000000-0000-0000-0000-000000000000' } });
    if (!user) throw new DomainError('NOT_FOUND', 'No HarvestSlot account matches. Invite them from Staff so they can create one.');
    await withTransaction(this.prisma.db, async (tx) => {
      const m = await tx.membership.findUnique({ where: { userId_organisationId: { userId: user.id, organisationId: orgId } } });
      if (m) {
        await tx.membership.update({ where: { id: m.id }, data: { status: 'ACTIVE', roles: Array.from(new Set([...m.roles, 'DRIVER' as const])), version: { increment: 1 } } });
      } else {
        await tx.membership.create({ data: { userId: user.id, organisationId: orgId, roles: ['DRIVER'], invitedByUserId: actor.userId } });
      }
      await tx.driver.upsert({
        where: { organisationId_userId: { organisationId: orgId, userId: user.id } },
        create: { organisationId: orgId, userId: user.id, displayName: input.displayName, phone: input.phone ?? user.phone, licenceNumber: input.licenceNumber ?? null },
        update: { displayName: input.displayName, phone: input.phone ?? user.phone, licenceNumber: input.licenceNumber ?? null, status: 'ACTIVE', version: { increment: 1 } },
      });
      await audit(tx, { actor, organisationId: orgId, action: 'driver.added', entityType: 'user', entityId: user.id });
    });
    return this.drivers(actor, orgId);
  }

  async updateDriver(actor: Actor, driverId: string, input: z.infer<typeof updateDriverSchema>): Promise<DriverDto[]> {
    const d = await this.prisma.db.driver.findUnique({ where: { id: driverId } });
    if (!d) throw new DomainError('NOT_FOUND', 'Driver not found');
    await this.access.requireOrg(actor, d.organisationId, 'transport.fleet.manage');
    const { expectedVersion, ...rest } = input;
    if (rest.status === 'INACTIVE') {
      const now = new Date();
      const busy = await this.prisma.db.tripReservation.count({ where: { driverId, endsAt: { gt: now }, ...occupyingTrips(now) } });
      if (busy) throw new DomainError('DRIVER_CONFLICT', 'This driver has upcoming trips. Reassign them first.');
    }
    const r = await this.prisma.db.driver.updateMany({ where: { id: driverId, version: expectedVersion }, data: { ...rest, version: { increment: 1 } } });
    if (r.count !== 1) throw new DomainError('VERSION_CONFLICT', 'The driver record changed elsewhere. Reload and try again.');
    return this.drivers(actor, d.organisationId);
  }

  async serviceAreas(actor: Actor, orgId: string): Promise<string[]> {
    await this.access.requireOrg(actor, orgId, 'transport.job.view');
    return (await this.prisma.db.transportServiceArea.findMany({ where: { organisationId: orgId }, orderBy: { lga: 'asc' } })).map((a) => a.lga);
  }

  async setServiceAreas(actor: Actor, orgId: string, input: z.infer<typeof serviceAreasSchema>): Promise<string[]> {
    await this.access.requireOrg(actor, orgId, 'transport.fleet.manage');
    await withTransaction(this.prisma.db, async (tx) => {
      await tx.transportServiceArea.deleteMany({ where: { organisationId: orgId, lga: { notIn: input.lgas } } });
      await tx.transportServiceArea.createMany({ data: input.lgas.map((lga) => ({ organisationId: orgId, lga })), skipDuplicates: true });
      await audit(tx, { actor, organisationId: orgId, action: 'transport.service-areas-set', entityType: 'organisation', entityId: orgId, data: { lgas: input.lgas } });
    });
    return this.serviceAreas(actor, orgId);
  }

  async availability(actor: Actor, orgId: string) {
    await this.access.requireOrg(actor, orgId, 'transport.job.view');
    const rows = await this.prisma.db.transportAvailability.findMany({
      where: { organisationId: orgId, endsAt: { gt: new Date() } },
      include: { vehicle: { select: { registrationPlate: true } } },
      orderBy: { startsAt: 'asc' },
    });
    return rows.map((a) => ({ id: a.id, vehicleId: a.vehicleId, vehiclePlate: a.vehicle.registrationPlate, startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString(), note: a.note }));
  }

  async addAvailability(actor: Actor, orgId: string, input: z.infer<typeof availabilityInputSchema>) {
    await this.access.requireOrg(actor, orgId, 'transport.fleet.manage');
    const v = await this.prisma.db.vehicle.findUnique({ where: { id: input.vehicleId } });
    if (!v || v.organisationId !== orgId) throw new DomainError('NOT_FOUND', 'Vehicle not found');
    await this.prisma.db.transportAvailability.create({
      data: { organisationId: orgId, vehicleId: input.vehicleId, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), note: input.note ?? null, createdByUserId: actor.userId },
    });
    return this.availability(actor, orgId);
  }

  /** Availability windows are planning data, not commitments: removing one never affects confirmed trips. */
  async removeAvailability(actor: Actor, availabilityId: string) {
    const a = await this.prisma.db.transportAvailability.findUnique({ where: { id: availabilityId } });
    if (!a) throw new DomainError('NOT_FOUND', 'Availability window not found');
    await this.access.requireOrg(actor, a.organisationId, 'transport.fleet.manage');
    await this.prisma.db.transportAvailability.delete({ where: { id: availabilityId } });
    return this.availability(actor, a.organisationId);
  }

  /** Bookings needing transport (new or replacement) whose pickup LGA is in the organisation's service areas. */
  async opportunities(actor: Actor, orgId: string): Promise<OpportunityDto[]> {
    await this.access.requireOrg(actor, orgId, 'transport.quote.manage');
    const org = await this.prisma.db.organisation.findUniqueOrThrow({ where: { id: orgId } });
    const areas = (await this.prisma.db.transportServiceArea.findMany({ where: { organisationId: orgId } })).map((a) => a.lga);
    if (!areas.length) return [];
    const now = new Date();
    const bookings = await this.prisma.db.booking.findMany({
      where: {
        status: { in: ['AWAITING_CONFIRMATIONS', 'CONFIRMED', 'ACTIVE'] },
        isDemo: org.isDemo,
        harvestRequest: { farmLocation: { lga: { in: areas } } },
        amendments: { none: { status: 'PENDING', termsVersion: { transportQuoteId: { not: null } } } },
        trips: { none: { status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] } } },
      },
      include: {
        harvestRequest: { include: { farmLocation: true } },
        facility: true,
        termsVersions: true,
        quotes: { where: { transporterOrgId: orgId }, orderBy: { createdAt: 'desc' }, take: 1 },
        trips: { where: { status: 'CANCELLED' }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const out: OpportunityDto[] = [];
    for (const b of bookings) {
      const c = b.termsVersions.find((v) => v.versionNo === b.currentTermsVersionNo)!.content as unknown as BookingTermsContent;
      if (new Date(c.pickupWindow.end) <= now) continue;
      const l = b.harvestRequest.farmLocation;
      const approx = l.approxLat !== null && l.approxLng !== null ? { lat: Number(l.approxLat), lng: Number(l.approxLng) } : null;
      const q = b.quotes[0];
      out.push({
        bookingId: b.id,
        bookingReference: b.reference,
        pickupLga: l.lga,
        pickupCommunity: l.community,
        pickupApprox: approx,
        facilityName: b.facility.name,
        facilityLga: b.facility.lga,
        quantityKg: c.quantityKg,
        pickupWindow: c.pickupWindow,
        deliveryWindow: c.deliveryWindow,
        freightPayer: c.freightPayer,
        straightLineKm: approx ? round1(haversineKm(approx, { lat: Number(b.facility.lat), lng: Number(b.facility.lng) })) : 0,
        myQuote: q ? { id: q.id, status: q.status, priceKobo: kobo(q.priceKobo) } : null,
        reason: b.trips.length ? 'REPLACEMENT' : 'NEW',
      });
    }
    return out;
  }
}
