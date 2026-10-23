import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  createOrganisationSchema,
  inviteStaffSchema,
  organisationSchema,
  updateMemberRolesSchema,
  updateOrganisationSchema,
} from '@harvestslot/contracts';
import type { Actor } from '@harvestslot/core';
import { CurrentActor } from '../../common/decorators.js';
import { ApiOk, ZodBody } from '../../common/zod.js';
import { OrganisationsService } from './organisations.service.js';

const reasonBody = z.object({ reason: z.string().trim().min(5).max(1000) });

@ApiTags('organisations')
@Controller('organisations')
export class OrganisationsController {
  constructor(private readonly orgs: OrganisationsService) {}

  @Post()
  @ApiOk(organisationSchema)
  create(@CurrentActor() actor: Actor, @ZodBody(createOrganisationSchema) body: z.infer<typeof createOrganisationSchema>) {
    return this.orgs.create(actor, body);
  }

  @Get(':orgId')
  @ApiOk(organisationSchema)
  get(@CurrentActor() actor: Actor, @Param('orgId', new ParseUUIDPipe()) orgId: string) {
    return this.orgs.get(actor, orgId);
  }

  @Patch(':orgId')
  @ApiOk(organisationSchema)
  update(@CurrentActor() actor: Actor, @Param('orgId', new ParseUUIDPipe()) orgId: string, @ZodBody(updateOrganisationSchema) body: z.infer<typeof updateOrganisationSchema>) {
    return this.orgs.update(actor, orgId, body);
  }

  @Get(':orgId/staff')
  staff(@CurrentActor() actor: Actor, @Param('orgId', new ParseUUIDPipe()) orgId: string) {
    return this.orgs.staff(actor, orgId);
  }

  @Post(':orgId/invitations')
  invite(@CurrentActor() actor: Actor, @Param('orgId', new ParseUUIDPipe()) orgId: string, @ZodBody(inviteStaffSchema) body: z.infer<typeof inviteStaffSchema>) {
    return this.orgs.invite(actor, orgId, body);
  }

  @Post(':orgId/invitations/:invitationId/revoke')
  @HttpCode(200)
  revokeInvitation(@CurrentActor() actor: Actor, @Param('orgId', new ParseUUIDPipe()) orgId: string, @Param('invitationId', new ParseUUIDPipe()) id: string) {
    return this.orgs.revokeInvitation(actor, orgId, id);
  }

  @Post(':orgId/members/:membershipId/roles')
  @HttpCode(200)
  setRoles(
    @CurrentActor() actor: Actor,
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
    @ZodBody(updateMemberRolesSchema) body: z.infer<typeof updateMemberRolesSchema>,
  ) {
    return this.orgs.setRoles(actor, orgId, membershipId, body);
  }

  @Post(':orgId/members/:membershipId/revoke')
  @HttpCode(200)
  revoke(
    @CurrentActor() actor: Actor,
    @Param('orgId', new ParseUUIDPipe()) orgId: string,
    @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
    @ZodBody(reasonBody) body: z.infer<typeof reasonBody>,
  ) {
    return this.orgs.revokeMember(actor, orgId, membershipId, body.reason);
  }
}
