import { Controller, Get, HttpCode, MessageEvent, Param, ParseUUIDPipe, Post, Sse } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { from, interval, map, Observable, startWith, switchMap, distinctUntilChanged, filter } from 'rxjs';
import { z } from 'zod';
import {
  approveDraftSchema,
  bookingDetailSchema,
  bookingListQuerySchema,
  cancelBookingSchema,
  confirmTermsSchema,
  decideAmendmentSchema,
  messageSchema,
  openIncidentSchema,
  postMessageSchema,
  proposeAmendmentSchema,
  readinessSchema,
  readyForPickupSchema,
  resolveIncidentSchema,
  startHarvestSchema,
  timelineEventSchema,
} from '@harvestslot/contracts';
import type { Actor } from '@harvestslot/core';
import { AccessService } from '../../common/access.service.js';
import { CurrentActor, Idempotent } from '../../common/decorators.js';
import { PrismaService } from '../../common/prisma.service.js';
import { ApiOk, ZodBody, ZodQuery } from '../../common/zod.js';
import { BookingsService } from './bookings.service.js';

const uuid = () => new ParseUUIDPipe();

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly access: AccessService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list(@CurrentActor() actor: Actor, @ZodQuery(bookingListQuerySchema) q: z.infer<typeof bookingListQuerySchema>) {
    return this.bookings.list(actor, q);
  }

  @Get(':id')
  @ApiOk(bookingDetailSchema)
  detail(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.bookings.detail(actor, id);
  }

  @Get(':id/readiness')
  @ApiOk(readinessSchema)
  readiness(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.bookings.readiness(actor, id);
  }

  @Get(':id/timeline')
  @ApiOk(z.array(timelineEventSchema))
  async timeline(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    await this.access.booking(actor, id);
    return this.bookings.timeline(id);
  }

  /**
   * Server-sent events: emits `booking.updated` whenever the booking's version changes. Access is
   * re-checked on every poll, so a revoked participant stops receiving updates. Browsers reconnect
   * automatically (EventSource); clients then refetch the detail.
   */
  @Sse(':id/events')
  events(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string): Observable<MessageEvent> {
    return interval(4000).pipe(
      startWith(0),
      switchMap(() =>
        from(
          (async () => {
            await this.access.booking(actor, id);
            const b = await this.prisma.db.booking.findUniqueOrThrow({ where: { id }, select: { version: true, status: true, lastReadiness: true, updatedAt: true } });
            const latestAmendment = await this.prisma.db.bookingAmendment.findFirst({ where: { bookingId: id }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } });
            const shipment = await this.prisma.db.shipment.findFirst({ where: { bookingId: id }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } });
            const receiving = await this.prisma.db.receivingRecord.findUnique({ where: { bookingId: id }, select: { updatedAt: true } });
            const stamp = [b.updatedAt, latestAmendment?.updatedAt, shipment?.updatedAt, receiving?.updatedAt].filter(Boolean).map((d) => d!.getTime()).sort().pop();
            return { version: b.version, status: b.status, ready: b.lastReadiness, stamp: stamp ?? 0 };
          })(),
        ),
      ),
      distinctUntilChanged((a, b) => a.stamp === b.stamp && a.version === b.version),
      filter(Boolean),
      map((data) => ({ type: 'booking.updated', data, retry: 5000 }) as MessageEvent),
    );
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @Idempotent('booking.confirm')
  @ApiOk(bookingDetailSchema)
  confirm(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(confirmTermsSchema) body: z.infer<typeof confirmTermsSchema>) {
    return this.bookings.confirm(actor, id, body);
  }

  @Post(':id/amendments')
  @Idempotent('booking.amend')
  @ApiOk(bookingDetailSchema)
  propose(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(proposeAmendmentSchema) body: z.infer<typeof proposeAmendmentSchema>) {
    return this.bookings.proposeAmendment(actor, id, body);
  }

  @Post(':id/amendments/decide')
  @HttpCode(200)
  @Idempotent('booking.amendment-decide')
  @ApiOk(bookingDetailSchema)
  decide(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(decideAmendmentSchema) body: z.infer<typeof decideAmendmentSchema>) {
    return this.bookings.decideAmendment(actor, id, body);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Idempotent('booking.approve-draft')
  @ApiOk(bookingDetailSchema)
  approve(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(approveDraftSchema) body: z.infer<typeof approveDraftSchema>) {
    return this.bookings.approveDraft(actor, id, body.expectedVersion);
  }

  @Post(':id/discard')
  @HttpCode(200)
  @Idempotent('booking.discard-draft')
  @ApiOk(bookingDetailSchema)
  discard(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(cancelBookingSchema) body: z.infer<typeof cancelBookingSchema>) {
    return this.bookings.cancel(actor, id, body, 'DISCARD');
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Idempotent('booking.cancel')
  @ApiOk(bookingDetailSchema)
  cancel(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(cancelBookingSchema) body: z.infer<typeof cancelBookingSchema>) {
    return this.bookings.cancel(actor, id, body, 'CANCEL');
  }

  @Post(':id/start-harvest')
  @HttpCode(200)
  @Idempotent('booking.start-harvest')
  @ApiOk(bookingDetailSchema)
  startHarvest(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(startHarvestSchema) body: z.infer<typeof startHarvestSchema>) {
    return this.bookings.startHarvest(actor, id, body.expectedVersion);
  }

  @Post(':id/ready-for-pickup')
  @HttpCode(200)
  @ApiOk(bookingDetailSchema)
  readyForPickup(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(readyForPickupSchema) body: z.infer<typeof readyForPickupSchema>) {
    return this.bookings.readyForPickup(actor, id, body);
  }

  @Post(':id/incidents')
  @ApiOk(bookingDetailSchema)
  openIncident(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(openIncidentSchema) body: z.infer<typeof openIncidentSchema>) {
    return this.bookings.openIncident(actor, id, body);
  }

  @Post(':id/incidents/:incidentId/resolve')
  @HttpCode(200)
  @ApiOk(bookingDetailSchema)
  resolveIncident(
    @CurrentActor() actor: Actor,
    @Param('id', uuid()) id: string,
    @Param('incidentId', uuid()) incidentId: string,
    @ZodBody(resolveIncidentSchema) body: z.infer<typeof resolveIncidentSchema>,
  ) {
    return this.bookings.resolveIncident(actor, id, incidentId, body.recoveryAction);
  }

  @Get(':id/messages')
  @ApiOk(z.array(messageSchema))
  messages(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.bookings.messages(actor, id);
  }

  @Post(':id/messages')
  @ApiOk(z.array(messageSchema))
  postMessage(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(postMessageSchema) body: z.infer<typeof postMessageSchema>) {
    return this.bookings.postMessage(actor, id, body);
  }
}
