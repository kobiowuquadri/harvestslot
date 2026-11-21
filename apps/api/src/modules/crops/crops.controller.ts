import { Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { cropCode, cropInputSchema, cropRequestInputSchema, cropUpdateSchema, dismissCropRequestsSchema } from '@harvestslot/contracts';
import { DomainError, type Actor } from '@harvestslot/core';
import { AdminOnly, CurrentActor } from '../../common/decorators.js';
import { ZodBody } from '../../common/zod.js';
import { CropsService } from './crops.service.js';

function codeParam(raw: string): string {
  const parsed = cropCode.safeParse(raw);
  if (!parsed.success) throw new DomainError('NOT_FOUND', 'Crop not found');
  return parsed.data;
}

@ApiTags('crops')
@Controller()
export class CropsController {
  constructor(private readonly crops: CropsService) {}

  /** The crops farmers can list now (also part of the public config). */
  @Get('crops')
  list() {
    return this.crops.listActive();
  }

  /** "My crop isn't listed": ask for a crop to be added. */
  @Post('crop-requests')
  request(@CurrentActor() actor: Actor, @ZodBody(cropRequestInputSchema) body: z.infer<typeof cropRequestInputSchema>) {
    return this.crops.request(actor, body);
  }
}

@ApiTags('admin')
@AdminOnly()
@Controller('admin')
export class AdminCropsController {
  constructor(private readonly crops: CropsService) {}

  @Get('crops')
  list() {
    return this.crops.listAll();
  }

  @Post('crops')
  create(@CurrentActor() actor: Actor, @ZodBody(cropInputSchema) body: z.infer<typeof cropInputSchema>) {
    return this.crops.create(actor, body);
  }

  @Patch('crops/:code')
  update(@CurrentActor() actor: Actor, @Param('code') code: string, @ZodBody(cropUpdateSchema) body: z.infer<typeof cropUpdateSchema>) {
    return this.crops.update(actor, codeParam(code), body);
  }

  @Get('crop-requests')
  requests() {
    return this.crops.openRequests();
  }

  @Post('crop-requests/dismiss')
  @HttpCode(200)
  dismiss(@CurrentActor() actor: Actor, @ZodBody(dismissCropRequestsSchema) body: z.infer<typeof dismissCropRequestsSchema>) {
    return this.crops.dismiss(actor, body);
  }
}
