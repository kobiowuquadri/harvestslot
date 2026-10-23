import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  claimInviteResultSchema,
  farmLocationInputSchema,
  farmLocationSchema,
  farmerProfileSchema,
  grantDelegationSchema,
  linkExistingFarmerSchema,
  reasonText,
  recordDelegationSchema,
  registerMemberSchema,
  revokeDelegationSchema,
  updateFarmLocationSchema,
  updateFarmerProfileSchema,
} from '@harvestslot/contracts';
import type { Actor } from '@harvestslot/core';
import { CurrentActor, Idempotent } from '../../common/decorators.js';
import { ApiOk, ZodBody } from '../../common/zod.js';
import { CooperativesService } from './cooperatives.service.js';
import { createOwnProfileSchema, FarmersService } from './farmers.service.js';

const uuidParam = () => new ParseUUIDPipe();
const reasonBody = z.object({ reason: reasonText });

@ApiTags('farmers')
@Controller()
export class FarmersController {
  constructor(
    private readonly farmers: FarmersService,
    private readonly coops: CooperativesService,
  ) {}

  @Get('farmers/me')
  @ApiOk(farmerProfileSchema)
  async me(@CurrentActor() actor: Actor) {
    return this.farmers.profile(actor, await this.farmers.ownProfileId(actor));
  }

  @Post('farmers/me')
  @ApiOk(farmerProfileSchema)
  createMe(@CurrentActor() actor: Actor, @ZodBody(createOwnProfileSchema) body: z.infer<typeof createOwnProfileSchema>) {
    return this.farmers.createOwn(actor, body);
  }

  @Get('farmers/:farmerId')
  @ApiOk(farmerProfileSchema)
  profile(@CurrentActor() actor: Actor, @Param('farmerId', uuidParam()) farmerId: string) {
    return this.farmers.profile(actor, farmerId);
  }

  @Patch('farmers/:farmerId')
  @ApiOk(farmerProfileSchema)
  update(@CurrentActor() actor: Actor, @Param('farmerId', uuidParam()) farmerId: string, @ZodBody(updateFarmerProfileSchema) body: z.infer<typeof updateFarmerProfileSchema>) {
    return this.farmers.update(actor, farmerId, body);
  }

  @Post('farmers/:farmerId/locations')
  @ApiOk(farmLocationSchema)
  addLocation(@CurrentActor() actor: Actor, @Param('farmerId', uuidParam()) farmerId: string, @ZodBody(farmLocationInputSchema) body: z.infer<typeof farmLocationInputSchema>) {
    return this.farmers.addLocation(actor, farmerId, body);
  }

  @Patch('farmers/:farmerId/locations/:locationId')
  @ApiOk(farmLocationSchema)
  updateLocation(
    @CurrentActor() actor: Actor,
    @Param('farmerId', uuidParam()) farmerId: string,
    @Param('locationId', uuidParam()) locationId: string,
    @ZodBody(updateFarmLocationSchema) body: z.infer<typeof updateFarmLocationSchema>,
  ) {
    return this.farmers.updateLocation(actor, farmerId, locationId, body);
  }

  @Post('farmers/:farmerId/locations/:locationId/archive')
  @HttpCode(200)
  archiveLocation(@CurrentActor() actor: Actor, @Param('farmerId', uuidParam()) farmerId: string, @Param('locationId', uuidParam()) locationId: string) {
    return this.farmers.archiveLocation(actor, farmerId, locationId);
  }

  @Get('farmers/:farmerId/delegations')
  delegations(@CurrentActor() actor: Actor, @Param('farmerId', uuidParam()) farmerId: string) {
    return this.farmers.delegations(actor, farmerId);
  }

  @Post('farmers/:farmerId/delegations')
  grant(@CurrentActor() actor: Actor, @Param('farmerId', uuidParam()) farmerId: string, @ZodBody(grantDelegationSchema) body: z.infer<typeof grantDelegationSchema>) {
    return this.farmers.grant(actor, farmerId, body);
  }

  @Post('delegations/:delegationId/revoke')
  @HttpCode(200)
  revoke(@CurrentActor() actor: Actor, @Param('delegationId', uuidParam()) id: string, @ZodBody(revokeDelegationSchema) body: z.infer<typeof revokeDelegationSchema>) {
    return this.farmers.revoke(actor, id, body.reason);
  }

  // ───────────── Cooperative management ─────────────

  @Get('cooperatives/:coopId/members')
  members(@CurrentActor() actor: Actor, @Param('coopId', uuidParam()) coopId: string) {
    return this.coops.members(actor, coopId);
  }

  @Post('cooperatives/:coopId/members')
  @Idempotent('cooperative.register-member')
  registerMember(@CurrentActor() actor: Actor, @Param('coopId', uuidParam()) coopId: string, @ZodBody(registerMemberSchema) body: z.infer<typeof registerMemberSchema>) {
    return this.coops.register(actor, coopId, body);
  }

  @Post('cooperatives/:coopId/members/link')
  linkMember(@CurrentActor() actor: Actor, @Param('coopId', uuidParam()) coopId: string, @ZodBody(linkExistingFarmerSchema) body: z.infer<typeof linkExistingFarmerSchema>) {
    return this.coops.link(actor, coopId, body);
  }

  @Post('cooperatives/:coopId/members/:farmerId/delegations')
  recordDelegation(
    @CurrentActor() actor: Actor,
    @Param('coopId', uuidParam()) coopId: string,
    @Param('farmerId', uuidParam()) farmerId: string,
    @ZodBody(recordDelegationSchema) body: z.infer<typeof recordDelegationSchema>,
  ) {
    return this.coops.recordDelegation(actor, coopId, farmerId, body);
  }

  @Post('cooperatives/:coopId/members/:farmerId/claim-invite')
  @ApiOk(claimInviteResultSchema)
  claimInvite(@CurrentActor() actor: Actor, @Param('coopId', uuidParam()) coopId: string, @Param('farmerId', uuidParam()) farmerId: string) {
    return this.coops.claimInvite(actor, coopId, farmerId);
  }

  @Post('cooperatives/:coopId/members/:farmerId/end')
  @HttpCode(200)
  endMembership(
    @CurrentActor() actor: Actor,
    @Param('coopId', uuidParam()) coopId: string,
    @Param('farmerId', uuidParam()) farmerId: string,
    @ZodBody(reasonBody) body: z.infer<typeof reasonBody>,
  ) {
    return this.coops.endMembership(actor, coopId, farmerId, body.reason);
  }
}
