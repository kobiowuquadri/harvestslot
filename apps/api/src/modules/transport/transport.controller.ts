import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  acceptAssignmentSchema,
  availabilityInputSchema,
  availabilitySchema,
  cancelTripSchema,
  confirmPickupSchema,
  decideQuoteSchema,
  driverInputSchema,
  driverSchema,
  enterHandoverCodeSchema,
  handoverExceptionSchema,
  jobMilestoneSchema,
  jobSchema,
  opportunitySchema,
  quoteSchema,
  reasonText,
  recordCollectionSchema,
  serviceAreasSchema,
  submitQuoteSchema,
  updateDriverSchema,
  updateVehicleSchema,
  vehicleInputSchema,
  vehicleSchema,
} from '@harvestslot/contracts';
import type { Actor } from '@harvestslot/core';
import { CurrentActor, Idempotent, RateLimit, byActor } from '../../common/decorators.js';
import { ApiOk, ZodBody } from '../../common/zod.js';
import { FleetService } from './fleet.service.js';
import { QuotesService } from './quotes.service.js';
import { ShipmentsService } from './shipments.service.js';

const uuid = () => new ParseUUIDPipe();
const reasonBody = z.object({ reason: reasonText });
const purposeBody = z.object({ purpose: z.enum(['PICKUP', 'DELIVERY']) });

@ApiTags('transport')
@Controller()
export class TransportController {
  constructor(
    private readonly fleet: FleetService,
    private readonly quotes: QuotesService,
    private readonly shipments: ShipmentsService,
  ) {}

  // ── Fleet
  @Get('organisations/:orgId/vehicles')
  @ApiOk(z.array(vehicleSchema))
  vehicles(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string) {
    return this.fleet.vehicles(actor, orgId);
  }

  @Post('organisations/:orgId/vehicles')
  @ApiOk(z.array(vehicleSchema))
  addVehicle(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string, @ZodBody(vehicleInputSchema) body: z.infer<typeof vehicleInputSchema>) {
    return this.fleet.addVehicle(actor, orgId, body);
  }

  @Patch('vehicles/:id')
  @ApiOk(z.array(vehicleSchema))
  updateVehicle(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(updateVehicleSchema) body: z.infer<typeof updateVehicleSchema>) {
    return this.fleet.updateVehicle(actor, id, body);
  }

  @Get('organisations/:orgId/drivers')
  @ApiOk(z.array(driverSchema))
  drivers(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string) {
    return this.fleet.drivers(actor, orgId);
  }

  @Post('organisations/:orgId/drivers')
  @ApiOk(z.array(driverSchema))
  addDriver(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string, @ZodBody(driverInputSchema) body: z.infer<typeof driverInputSchema>) {
    return this.fleet.addDriver(actor, orgId, body);
  }

  @Patch('drivers/:id')
  @ApiOk(z.array(driverSchema))
  updateDriver(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(updateDriverSchema) body: z.infer<typeof updateDriverSchema>) {
    return this.fleet.updateDriver(actor, id, body);
  }

  @Get('organisations/:orgId/service-areas')
  serviceAreas(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string) {
    return this.fleet.serviceAreas(actor, orgId);
  }

  @Put('organisations/:orgId/service-areas')
  setServiceAreas(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string, @ZodBody(serviceAreasSchema) body: z.infer<typeof serviceAreasSchema>) {
    return this.fleet.setServiceAreas(actor, orgId, body);
  }

  @Get('organisations/:orgId/availability')
  @ApiOk(z.array(availabilitySchema))
  availability(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string) {
    return this.fleet.availability(actor, orgId);
  }

  @Post('organisations/:orgId/availability')
  @ApiOk(z.array(availabilitySchema))
  addAvailability(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string, @ZodBody(availabilityInputSchema) body: z.infer<typeof availabilityInputSchema>) {
    return this.fleet.addAvailability(actor, orgId, body);
  }

  @Delete('availability/:id')
  @ApiOk(z.array(availabilitySchema))
  removeAvailability(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.fleet.removeAvailability(actor, id);
  }

  @Get('organisations/:orgId/opportunities')
  @ApiOk(z.array(opportunitySchema))
  opportunities(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string) {
    return this.fleet.opportunities(actor, orgId);
  }

  // ── Quotes & assignments
  @Post('organisations/:orgId/quotes')
  @Idempotent('quote.submit')
  @ApiOk(quoteSchema)
  submitQuote(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string, @ZodBody(submitQuoteSchema) body: z.infer<typeof submitQuoteSchema>) {
    return this.quotes.submit(actor, orgId, body);
  }

  @Get('organisations/:orgId/quotes')
  @ApiOk(z.array(quoteSchema))
  orgQuotes(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string) {
    return this.quotes.forOrg(actor, orgId);
  }

  @Get('bookings/:id/quotes')
  @ApiOk(z.array(quoteSchema))
  bookingQuotes(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.quotes.forBooking(actor, id);
  }

  @Post('quotes/:id/accept')
  @HttpCode(200)
  @Idempotent('quote.accept')
  @ApiOk(quoteSchema)
  acceptQuote(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(decideQuoteSchema) body: z.infer<typeof decideQuoteSchema>) {
    return this.quotes.accept(actor, id, body);
  }

  @Post('quotes/:id/decline')
  @HttpCode(200)
  @ApiOk(quoteSchema)
  declineQuote(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(decideQuoteSchema) body: z.infer<typeof decideQuoteSchema>) {
    return this.quotes.decline(actor, id, body);
  }

  @Post('quotes/:id/withdraw')
  @HttpCode(200)
  @ApiOk(quoteSchema)
  withdrawQuote(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(reasonBody.partial()) body: { reason?: string }) {
    return this.quotes.withdraw(actor, id, body.reason);
  }

  @Post('assignments/accept')
  @HttpCode(200)
  @Idempotent('assignment.accept')
  @ApiOk(quoteSchema)
  acceptAssignment(@CurrentActor() actor: Actor, @ZodBody(acceptAssignmentSchema) body: z.infer<typeof acceptAssignmentSchema>) {
    return this.quotes.acceptAssignment(actor, body);
  }

  @Post('quotes/:id/decline-assignment')
  @HttpCode(200)
  @ApiOk(quoteSchema)
  declineAssignment(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(reasonBody) body: z.infer<typeof reasonBody>) {
    return this.quotes.declineAssignment(actor, id, body.reason);
  }

  @Post('trips/:id/cancel')
  @HttpCode(200)
  @Idempotent('trip.cancel')
  cancelTrip(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(cancelTripSchema) body: z.infer<typeof cancelTripSchema>) {
    return this.quotes.cancelTrip(actor, id, body.reason);
  }

  // ── Jobs & handover
  @Get('organisations/:orgId/jobs')
  @ApiOk(z.array(jobSchema))
  jobs(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string) {
    return this.shipments.jobs(actor, orgId);
  }

  @Get('shipments/:id')
  @ApiOk(jobSchema)
  job(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.shipments.job(actor, id);
  }

  @Post('shipments/:id/depart')
  @HttpCode(200)
  @ApiOk(jobSchema)
  depart(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(jobMilestoneSchema) body: z.infer<typeof jobMilestoneSchema>) {
    return this.shipments.milestone(actor, id, 'depart', body);
  }

  @Post('shipments/:id/arrive-pickup')
  @HttpCode(200)
  @ApiOk(jobSchema)
  arrivePickup(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(jobMilestoneSchema) body: z.infer<typeof jobMilestoneSchema>) {
    return this.shipments.milestone(actor, id, 'arrivePickup', body);
  }

  @Post('shipments/:id/collection')
  @HttpCode(200)
  @Idempotent('shipment.collection')
  @ApiOk(jobSchema)
  collection(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(recordCollectionSchema) body: z.infer<typeof recordCollectionSchema>) {
    return this.shipments.recordCollection(actor, id, body);
  }

  @Post('shipments/:id/handover-code')
  @HttpCode(200)
  issueCode(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(purposeBody) body: z.infer<typeof purposeBody>) {
    return this.shipments.issueCode(actor, id, body.purpose);
  }

  @Post('shipments/:id/pickup-code')
  @HttpCode(200)
  @RateLimit({ name: 'handover-code', limit: 20, windowSec: 900, key: byActor })
  @ApiOk(jobSchema)
  pickupCode(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(enterHandoverCodeSchema) body: z.infer<typeof enterHandoverCodeSchema>) {
    return this.shipments.enterCode(actor, id, 'PICKUP', body.code);
  }

  @Post('shipments/:id/delivery-code')
  @HttpCode(200)
  @RateLimit({ name: 'handover-code', limit: 20, windowSec: 900, key: byActor })
  @ApiOk(jobSchema)
  deliveryCode(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(enterHandoverCodeSchema) body: z.infer<typeof enterHandoverCodeSchema>) {
    return this.shipments.enterCode(actor, id, 'DELIVERY', body.code);
  }

  @Post('shipments/:id/confirm-pickup')
  @HttpCode(200)
  @Idempotent('shipment.confirm-pickup')
  confirmPickup(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(confirmPickupSchema) body: z.infer<typeof confirmPickupSchema>) {
    return this.shipments.confirmPickup(actor, id, body);
  }

  @Post('shipments/:id/pickup-exception')
  @HttpCode(200)
  @ApiOk(jobSchema)
  pickupException(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(handoverExceptionSchema) body: z.infer<typeof handoverExceptionSchema>) {
    return this.shipments.requestPickupException(actor, id, body.reason);
  }

  @Post('shipments/:id/approve-exception')
  @HttpCode(200)
  approveException(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(reasonBody) body: z.infer<typeof reasonBody>) {
    return this.shipments.approvePickupException(actor, id, body.reason);
  }

  @Post('shipments/:id/leave-pickup')
  @HttpCode(200)
  @ApiOk(jobSchema)
  leavePickup(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(jobMilestoneSchema) body: z.infer<typeof jobMilestoneSchema>) {
    return this.shipments.milestone(actor, id, 'leavePickup', body);
  }

  @Post('shipments/:id/arrive-facility')
  @HttpCode(200)
  @ApiOk(jobSchema)
  arriveFacility(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(jobMilestoneSchema) body: z.infer<typeof jobMilestoneSchema>) {
    return this.shipments.milestone(actor, id, 'arriveFacility', body);
  }

  @Post('shipments/:id/confirm-delivery')
  @HttpCode(200)
  @Idempotent('shipment.confirm-delivery')
  confirmDelivery(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.shipments.confirmDelivery(actor, id);
  }
}
