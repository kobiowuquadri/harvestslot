import { z } from 'zod';
import { lgaName, nigeriaPoint, optionalText, phoneNumber, reasonText, shortText, uuid } from './common.js';
import {
  DriverStatusE,
  FreightPayerE,
  HandoverMethodE,
  LocationSourceE,
  QuoteStatusE,
  ShipmentStatusE,
  TripStatusE,
  VehicleStatusE,
  VehicleTypeE,
} from './enums.js';
import { isoDateTime } from './time.js';
import { kgString as nonNegativeKg, koboInt, positiveKgString } from './units.js';

export const vehicleInputSchema = z.object({
  registrationPlate: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{5,12}$/, 'Use letters, digits and dashes (e.g. OYO-123-AB)'),
  type: VehicleTypeE.schema,
  capacityKg: positiveKgString,
  description: optionalText(300),
});
export const updateVehicleSchema = vehicleInputSchema.partial().extend({
  expectedVersion: z.number().int().min(1),
  status: VehicleStatusE.schema.optional(),
});

export const vehicleSchema = z.object({
  id: uuid,
  registrationPlate: z.string(),
  type: VehicleTypeE.schema,
  capacityKg: z.string(),
  description: z.string().nullable(),
  status: VehicleStatusE.schema,
  isDemo: z.boolean(),
  version: z.number(),
  nextCommitment: z.object({ bookingReference: z.string(), startsAt: z.string(), endsAt: z.string() }).nullable(),
});
export type VehicleDto = z.infer<typeof vehicleSchema>;

export const driverInputSchema = z.object({
  /** Existing user (by email/phone) to add as a driver, or create a driver login. */
  emailOrPhone: z.string().trim().min(3).max(254),
  displayName: shortText(120),
  phone: phoneNumber.optional(),
  licenceNumber: optionalText(40),
});
export const updateDriverSchema = z.object({
  expectedVersion: z.number().int().min(1),
  displayName: shortText(120).optional(),
  phone: phoneNumber.optional(),
  licenceNumber: optionalText(40),
  status: DriverStatusE.schema.optional(),
});
export const driverSchema = z.object({
  id: uuid,
  userId: uuid,
  displayName: z.string(),
  phone: z.string().nullable(),
  licenceNumber: z.string().nullable(),
  status: DriverStatusE.schema,
  version: z.number(),
});
export type DriverDto = z.infer<typeof driverSchema>;

export const serviceAreasSchema = z.object({ lgas: z.array(lgaName).max(40) });

export const availabilityInputSchema = z
  .object({ vehicleId: uuid, startsAt: isoDateTime, endsAt: isoDateTime, note: optionalText(300) })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), { message: 'End must be after start', path: ['endsAt'] });
export const availabilitySchema = z.object({
  id: uuid,
  vehicleId: uuid,
  vehiclePlate: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  note: z.string().nullable(),
});

export const INCLUDED_SERVICES = ['LOADING', 'OFFLOADING', 'TARPAULIN_COVER', 'WEIGHING_AT_FARM'] as const;

export const submitQuoteSchema = z
  .object({
    bookingId: uuid,
    vehicleId: uuid,
    driverId: uuid.optional(),
    pickupWindowStart: isoDateTime,
    pickupWindowEnd: isoDateTime,
    deliveryWindowStart: isoDateTime,
    deliveryWindowEnd: isoDateTime,
    priceKobo: koboInt,
    includedServices: z.array(z.enum(INCLUDED_SERVICES)).default([]),
    cancellationTerms: z.string().trim().min(5).max(1000),
    validForHours: z.number().int().min(1).max(168).default(24),
  })
  .refine((v) => new Date(v.pickupWindowEnd) > new Date(v.pickupWindowStart), {
    message: 'Pickup window must end after it starts',
    path: ['pickupWindowEnd'],
  })
  .refine((v) => new Date(v.deliveryWindowEnd) > new Date(v.deliveryWindowStart), {
    message: 'Delivery window must end after it starts',
    path: ['deliveryWindowEnd'],
  })
  .refine((v) => new Date(v.deliveryWindowStart) >= new Date(v.pickupWindowStart), {
    message: 'Delivery cannot start before pickup',
    path: ['deliveryWindowStart'],
  });
export type SubmitQuoteInput = z.infer<typeof submitQuoteSchema>;

export const decideQuoteSchema = z.object({ expectedVersion: z.number().int().min(1), reason: optionalText(500) });
export const acceptAssignmentSchema = z.object({ quoteId: uuid, driverId: uuid });
export const cancelTripSchema = z.object({ reason: reasonText });

export const quoteSchema = z.object({
  id: uuid,
  bookingId: uuid,
  bookingReference: z.string(),
  transporterOrgId: uuid,
  transporterName: z.string(),
  transporterReviewed: z.boolean(),
  vehicle: z.object({ id: uuid, plate: z.string(), type: VehicleTypeE.schema, capacityKg: z.string() }),
  driver: z.object({ id: uuid, name: z.string() }).nullable(),
  status: QuoteStatusE.schema,
  pickupWindowStart: z.string(),
  pickupWindowEnd: z.string(),
  deliveryWindowStart: z.string(),
  deliveryWindowEnd: z.string(),
  priceKobo: z.number(),
  freightPayer: FreightPayerE.schema,
  includedServices: z.array(z.string()),
  cancellationTerms: z.string(),
  validUntil: z.string(),
  /** True when the quote's windows fall outside the agreed booking windows (needs extra approval). */
  changesAgreedWindows: z.boolean(),
  decisionReason: z.string().nullable(),
  /** Vehicle/driver hold created when the quote was accepted; HELD means the transporter must assign a driver. */
  trip: z.object({ id: uuid, status: TripStatusE.schema, expiresAt: z.string().nullable() }).nullable(),
  version: z.number(),
  createdAt: z.string(),
});
export type QuoteDto = z.infer<typeof quoteSchema>;

/** Transport opportunities: bookings needing transport inside the transporter's service area. */
export const opportunitySchema = z.object({
  bookingId: uuid,
  bookingReference: z.string(),
  pickupLga: z.string(),
  pickupCommunity: z.string().nullable(),
  pickupApprox: z.object({ lat: z.number(), lng: z.number() }).nullable(),
  facilityName: z.string(),
  facilityLga: z.string(),
  quantityKg: z.string(),
  pickupWindow: z.object({ start: z.string(), end: z.string() }),
  deliveryWindow: z.object({ start: z.string(), end: z.string() }),
  freightPayer: FreightPayerE.schema,
  straightLineKm: z.number(),
  myQuote: z.object({ id: uuid, status: QuoteStatusE.schema, priceKobo: z.number() }).nullable(),
  reason: z.enum(['NEW', 'REPLACEMENT']),
});
export type OpportunityDto = z.infer<typeof opportunitySchema>;

export const gpsInputSchema = z
  .object({
    point: nigeriaPoint,
    accuracyM: z.number().int().min(0).max(100_000).optional(),
    source: LocationSourceE.schema.default('DEVICE_GPS'),
  })
  .optional();

export const jobMilestoneSchema = z.object({ expectedVersion: z.number().int().min(1), gps: gpsInputSchema, note: optionalText(500) });
export const recordCollectionSchema = z.object({
  expectedVersion: z.number().int().min(1),
  quantityKg: nonNegativeKg,
  gps: gpsInputSchema,
  note: optionalText(500),
  evidenceAttachmentIds: z.array(uuid).max(10).default([]),
});
export const enterHandoverCodeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });
export const handoverExceptionSchema = z.object({ reason: reasonText });
export const confirmPickupSchema = z.object({
  farmerReportedQuantityKg: nonNegativeKg.optional(),
  actingForFarmerId: uuid.optional(),
  agree: z.literal(true, { message: 'Confirm that you handed over the produce' }),
});

export const jobSchema = z.object({
  shipmentId: uuid,
  tripId: uuid,
  bookingId: uuid,
  bookingReference: z.string(),
  status: ShipmentStatusE.schema,
  tripStatus: TripStatusE.schema,
  version: z.number(),
  vehicle: z.object({ plate: z.string(), type: VehicleTypeE.schema }),
  driver: z.object({ id: uuid, name: z.string(), phone: z.string().nullable() }),
  quantityKg: z.string(),
  pickupWindow: z.object({ start: z.string(), end: z.string() }),
  deliveryWindow: z.object({ start: z.string(), end: z.string() }),
  pickup: z.object({
    farmerName: z.string(),
    farmerPhone: z.string().nullable(),
    label: z.string(),
    lga: z.string(),
    community: z.string().nullable(),
    directions: z.string().nullable(),
    exact: z.object({ lat: z.number(), lng: z.number(), accuracyM: z.number().nullable() }).nullable(),
  }),
  destination: z.object({ facilityName: z.string(), address: z.string().nullable(), lat: z.number(), lng: z.number() }),
  milestones: z.object({
    enRouteAt: z.string().nullable(),
    arrivedPickupAt: z.string().nullable(),
    collectedAt: z.string().nullable(),
    pickupConfirmedAt: z.string().nullable(),
    departedAt: z.string().nullable(),
    arrivedFacilityAt: z.string().nullable(),
    deliveredAt: z.string().nullable(),
  }),
  pickupRecord: z
    .object({
      reportedQuantityKg: z.string(),
      confirmationMethod: HandoverMethodE.schema.nullable(),
      confirmedAt: z.string().nullable(),
      farmerReportedQuantityKg: z.string().nullable(),
      exceptionReason: z.string().nullable(),
      locationSource: LocationSourceE.schema.nullable(),
      accuracyM: z.number().nullable(),
    })
    .nullable(),
  harvestStatus: z.string(),
  allowedActions: z.array(z.string()),
  priceKobo: z.number(),
  freightPayer: FreightPayerE.schema,
});
export type JobDto = z.infer<typeof jobSchema>;
