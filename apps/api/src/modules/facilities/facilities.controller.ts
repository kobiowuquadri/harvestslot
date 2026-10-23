import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  adjustCapacitySchema,
  closeSlotSchema,
  createSlotSchema,
  createSlotSeriesSchema,
  facilityInputSchema,
  facilitySchema,
  lineInputSchema,
  slotSchema,
  slotsQuerySchema,
  updateFacilitySchema,
  updateLineSchema,
} from '@harvestslot/contracts';
import type { Actor } from '@harvestslot/core';
import { CurrentActor } from '../../common/decorators.js';
import { ApiOk, ZodBody, ZodQuery } from '../../common/zod.js';
import { FacilitiesService } from './facilities.service.js';

const uuid = () => new ParseUUIDPipe();
const versionBody = z.object({ expectedVersion: z.number().int().min(1) });

@ApiTags('facilities & capacity')
@Controller()
export class FacilitiesController {
  constructor(private readonly facilities: FacilitiesService) {}

  @Get('organisations/:orgId/facilities')
  @ApiOk(z.array(facilitySchema))
  list(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string) {
    return this.facilities.list(actor, orgId);
  }

  @Post('organisations/:orgId/facilities')
  @ApiOk(facilitySchema)
  create(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string, @ZodBody(facilityInputSchema) body: z.infer<typeof facilityInputSchema>) {
    return this.facilities.create(actor, orgId, body);
  }

  @Get('facilities/:id')
  @ApiOk(facilitySchema)
  get(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.facilities.get(actor, id);
  }

  @Patch('facilities/:id')
  @ApiOk(facilitySchema)
  update(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(updateFacilitySchema) body: z.infer<typeof updateFacilitySchema>) {
    return this.facilities.update(actor, id, body);
  }

  @Post('facilities/:id/lines')
  @ApiOk(facilitySchema)
  addLine(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(lineInputSchema) body: z.infer<typeof lineInputSchema>) {
    return this.facilities.addLine(actor, id, body);
  }

  @Patch('lines/:id')
  @ApiOk(facilitySchema)
  updateLine(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(updateLineSchema) body: z.infer<typeof updateLineSchema>) {
    return this.facilities.updateLine(actor, id, body);
  }

  @Get('organisations/:orgId/slots')
  @ApiOk(z.array(slotSchema))
  slots(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string, @ZodQuery(slotsQuerySchema) q: z.infer<typeof slotsQuerySchema>) {
    return this.facilities.listSlots(actor, orgId, q);
  }

  @Post('slots')
  @ApiOk(slotSchema)
  createSlot(@CurrentActor() actor: Actor, @ZodBody(createSlotSchema) body: z.infer<typeof createSlotSchema>) {
    return this.facilities.createSlot(actor, body);
  }

  @Post('slots/series')
  createSeries(@CurrentActor() actor: Actor, @ZodBody(createSlotSeriesSchema) body: z.infer<typeof createSlotSeriesSchema>) {
    return this.facilities.createSeries(actor, body);
  }

  @Get('slots/:id')
  @ApiOk(slotSchema)
  getSlot(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.facilities.getSlot(actor, id);
  }

  @Post('slots/:id/publish')
  @HttpCode(200)
  @ApiOk(slotSchema)
  publish(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(versionBody) body: z.infer<typeof versionBody>) {
    return this.facilities.publish(actor, id, body.expectedVersion);
  }

  @Post('slots/:id/close')
  @HttpCode(200)
  @ApiOk(slotSchema)
  close(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(closeSlotSchema) body: z.infer<typeof closeSlotSchema>) {
    return this.facilities.close(actor, id, body.expectedVersion, body.reason, 'CLOSE');
  }

  @Post('slots/:id/cancel')
  @HttpCode(200)
  @ApiOk(slotSchema)
  cancel(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(closeSlotSchema) body: z.infer<typeof closeSlotSchema>) {
    return this.facilities.close(actor, id, body.expectedVersion, body.reason, 'CANCEL');
  }

  @Post('slots/:id/capacity')
  @HttpCode(200)
  @ApiOk(slotSchema)
  adjust(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(adjustCapacitySchema) body: z.infer<typeof adjustCapacitySchema>) {
    return this.facilities.adjustCapacity(actor, id, body);
  }

  @Get('slots/:id/adjustments')
  adjustments(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.facilities.adjustments(actor, id);
  }
}
