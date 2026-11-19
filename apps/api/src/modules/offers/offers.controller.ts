import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { acceptOfferResultSchema, counterOfferSchema, createOfferSchema, decideOfferSchema, offerSchema, reviseOfferSchema, sendOfferSchema } from '@harvestslot/contracts';
import type { Actor } from '@harvestslot/core';
import { CurrentActor, Idempotent } from '../../common/decorators.js';
import { ApiOk, ZodBody } from '../../common/zod.js';
import { OffersService } from './offers.service.js';

const uuid = () => new ParseUUIDPipe();

@ApiTags('offers')
@Controller()
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Post('offers')
  @Idempotent('offer.create')
  @ApiOk(offerSchema)
  create(@CurrentActor() actor: Actor, @ZodBody(createOfferSchema) body: z.infer<typeof createOfferSchema>) {
    return this.offers.create(actor, body);
  }

  @Get('offers/:id')
  @ApiOk(offerSchema)
  get(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.offers.get(actor, id);
  }

  @Get('harvests/:id/offers')
  @ApiOk(z.array(offerSchema))
  forHarvest(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.offers.forHarvest(actor, id);
  }

  @Get('organisations/:orgId/offers')
  @ApiOk(z.array(offerSchema))
  forOrg(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string, @Query('status') status?: string) {
    return this.offers.forOrg(actor, orgId, status);
  }

  @Post('offers/:id/revise')
  @HttpCode(200)
  @Idempotent('offer.revise')
  @ApiOk(offerSchema)
  revise(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(reviseOfferSchema) body: z.infer<typeof reviseOfferSchema>) {
    return this.offers.revise(actor, id, body);
  }

  /** Sends a draft offer to the farmer (reserves capacity until it expires). */
  @Post('offers/:id/send')
  @HttpCode(200)
  @Idempotent('offer.send')
  @ApiOk(offerSchema)
  send(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(sendOfferSchema) body: z.infer<typeof sendOfferSchema>) {
    return this.offers.send(actor, id, body);
  }

  @Post('offers/:id/counter')
  @HttpCode(200)
  @Idempotent('offer.counter')
  @ApiOk(offerSchema)
  counter(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(counterOfferSchema) body: z.infer<typeof counterOfferSchema>) {
    return this.offers.counter(actor, id, body);
  }

  /** Farmer (or a representative with APPROVE_SALE) accepts the exact current terms. */
  @Post('offers/:id/accept')
  @HttpCode(200)
  @Idempotent('offer.accept')
  @ApiOk(acceptOfferResultSchema)
  accept(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(decideOfferSchema) body: z.infer<typeof decideOfferSchema>) {
    return this.offers.accept(actor, id, body, 'ACCEPT');
  }

  /** A representative with data-entry permission only prepares acceptance; the farmer must approve it. */
  @Post('offers/:id/prepare-acceptance')
  @HttpCode(200)
  @Idempotent('offer.prepare')
  @ApiOk(acceptOfferResultSchema)
  prepare(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(decideOfferSchema) body: z.infer<typeof decideOfferSchema>) {
    return this.offers.accept(actor, id, body, 'PREPARE');
  }

  @Post('offers/:id/accept-counter')
  @HttpCode(200)
  @Idempotent('offer.accept-counter')
  @ApiOk(acceptOfferResultSchema)
  acceptCounter(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(decideOfferSchema) body: z.infer<typeof decideOfferSchema>) {
    return this.offers.accept(actor, id, body, 'ACCEPT_COUNTER');
  }

  @Post('offers/:id/decline')
  @HttpCode(200)
  @ApiOk(offerSchema)
  decline(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(decideOfferSchema) body: z.infer<typeof decideOfferSchema>) {
    return this.offers.decline(actor, id, body, 'DECLINE');
  }

  @Post('offers/:id/withdraw')
  @HttpCode(200)
  @ApiOk(offerSchema)
  withdraw(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(decideOfferSchema) body: z.infer<typeof decideOfferSchema>) {
    return this.offers.decline(actor, id, body, 'WITHDRAW');
  }
}
