import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  closeHarvestSchema,
  createHarvestSchema,
  harvestListQuerySchema,
  harvestSchema,
  inboxItemSchema,
  matchResponseSchema,
  updateHarvestSchema,
  uuid as uuidSchema,
} from '@harvestslot/contracts';
import type { Actor } from '@harvestslot/core';
import { CurrentActor, Idempotent } from '../../common/decorators.js';
import { ApiOk, ZodBody, ZodQuery } from '../../common/zod.js';
import { HarvestsService } from './harvests.service.js';

const uuid = () => new ParseUUIDPipe();
const versionBody = z.object({ expectedVersion: z.number().int().min(1) });
const inviteBody = z.object({ facilityId: uuidSchema });

@ApiTags('harvests & matching')
@Controller()
export class HarvestsController {
  constructor(private readonly harvests: HarvestsService) {}

  @Get('harvests')
  @ApiOk(z.array(harvestSchema))
  list(@CurrentActor() actor: Actor, @ZodQuery(harvestListQuerySchema) q: z.infer<typeof harvestListQuerySchema>) {
    return this.harvests.list(actor, q);
  }

  @Post('farmers/:farmerId/harvests')
  @Idempotent('harvest.create')
  @ApiOk(harvestSchema)
  create(@CurrentActor() actor: Actor, @Param('farmerId', uuid()) farmerId: string, @ZodBody(createHarvestSchema) body: z.infer<typeof createHarvestSchema>) {
    return this.harvests.create(actor, farmerId, body);
  }

  @Get('harvests/:id')
  @ApiOk(harvestSchema)
  get(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.harvests.get(actor, id);
  }

  @Patch('harvests/:id')
  @ApiOk(harvestSchema)
  update(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(updateHarvestSchema) body: z.infer<typeof updateHarvestSchema>) {
    return this.harvests.update(actor, id, body);
  }

  @Post('harvests/:id/publish')
  @HttpCode(200)
  @ApiOk(harvestSchema)
  publish(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(versionBody) body: z.infer<typeof versionBody>) {
    return this.harvests.publish(actor, id, body.expectedVersion);
  }

  @Post('harvests/:id/close')
  @HttpCode(200)
  @ApiOk(harvestSchema)
  close(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(closeHarvestSchema) body: z.infer<typeof closeHarvestSchema>) {
    return this.harvests.end(actor, id, body.expectedVersion, body.reason, 'CLOSE');
  }

  @Post('harvests/:id/withdraw')
  @HttpCode(200)
  @ApiOk(harvestSchema)
  withdraw(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(closeHarvestSchema) body: z.infer<typeof closeHarvestSchema>) {
    return this.harvests.end(actor, id, body.expectedVersion, body.reason, 'WITHDRAW');
  }

  @Get('harvests/:id/matches')
  @ApiOk(matchResponseSchema)
  matches(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.harvests.matches(actor, id);
  }

  @Post('harvests/:id/offer-requests')
  invite(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(inviteBody) body: z.infer<typeof inviteBody>) {
    return this.harvests.invite(actor, id, body.facilityId);
  }

  @Get('organisations/:orgId/inbox')
  @ApiOk(z.array(inboxItemSchema))
  inbox(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string) {
    return this.harvests.inbox(actor, orgId);
  }
}
