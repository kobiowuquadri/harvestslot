import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  addWeightEvidenceSchema,
  completeProcessingSchema,
  farmerReceivingReviewSchema,
  processingSchema,
  receivingSchema,
  recordLossSchema,
  recordWeighingSchema,
  startProcessingSchema,
  submitQualityDecisionSchema,
} from '@harvestslot/contracts';
import type { Actor } from '@harvestslot/core';
import { CurrentActor, Idempotent } from '../../common/decorators.js';
import { ApiOk, ZodBody } from '../../common/zod.js';
import { ReceivingService } from './receiving.service.js';

const uuid = () => new ParseUUIDPipe();

@ApiTags('receiving & processing')
@Controller()
export class ReceivingController {
  constructor(private readonly receiving: ReceivingService) {}

  @Get('bookings/:id/receiving')
  @ApiOk(receivingSchema.nullable())
  get(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.receiving.get(actor, id);
  }

  @Post('bookings/:id/receiving/weighing')
  @HttpCode(200)
  @ApiOk(receivingSchema)
  weigh(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(recordWeighingSchema) body: z.infer<typeof recordWeighingSchema>) {
    return this.receiving.recordWeighing(actor, id, body);
  }

  @Post('bookings/:id/receiving/evidence')
  @ApiOk(receivingSchema)
  evidence(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(addWeightEvidenceSchema) body: z.infer<typeof addWeightEvidenceSchema>) {
    return this.receiving.addEvidence(actor, id, body);
  }

  @Post('bookings/:id/receiving/decision')
  @HttpCode(200)
  @Idempotent('receiving.decision')
  @ApiOk(receivingSchema)
  decide(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(submitQualityDecisionSchema) body: z.infer<typeof submitQualityDecisionSchema>) {
    return this.receiving.submitDecision(actor, id, body);
  }

  @Post('bookings/:id/receiving/review')
  @HttpCode(200)
  @Idempotent('receiving.review')
  @ApiOk(receivingSchema)
  review(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(farmerReceivingReviewSchema) body: z.infer<typeof farmerReceivingReviewSchema>) {
    return this.receiving.farmerReview(actor, id, body);
  }

  @Get('bookings/:id/processing')
  @ApiOk(processingSchema)
  processing(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.receiving.processing(actor, id);
  }

  @Post('bookings/:id/processing/start')
  @HttpCode(200)
  @ApiOk(processingSchema)
  start(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(startProcessingSchema) body: z.infer<typeof startProcessingSchema>) {
    return this.receiving.startProcessing(actor, id, body);
  }

  @Post('bookings/:id/processing/complete')
  @HttpCode(200)
  @ApiOk(processingSchema)
  complete(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(completeProcessingSchema) body: z.infer<typeof completeProcessingSchema>) {
    return this.receiving.completeProcessing(actor, id, body);
  }

  @Post('bookings/:id/losses')
  @ApiOk(processingSchema)
  loss(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(recordLossSchema) body: z.infer<typeof recordLossSchema>) {
    return this.receiving.recordLoss(actor, id, body);
  }

  @Get('organisations/:orgId/intake')
  intake(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.receiving.intake(actor, orgId, from, to);
  }
}
