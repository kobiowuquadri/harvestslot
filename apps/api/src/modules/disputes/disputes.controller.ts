import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { disputeMessageInputSchema, disputeSchema, openDisputeSchema, reasonText, resolveDisputeSchema } from '@harvestslot/contracts';
import type { Actor } from '@harvestslot/core';
import { AdminOnly, CurrentActor, Idempotent } from '../../common/decorators.js';
import { ApiOk, ZodBody } from '../../common/zod.js';
import { DisputesService } from './disputes.service.js';

const uuid = () => new ParseUUIDPipe();
const reasonBody = z.object({ reason: reasonText });

@ApiTags('disputes')
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  @ApiOk(z.array(disputeSchema))
  list(@CurrentActor() actor: Actor, @Query('bookingId') bookingId?: string) {
    return this.disputes.list(actor, bookingId && /^[0-9a-f-]{36}$/i.test(bookingId) ? bookingId : undefined);
  }

  @Post()
  @Idempotent('dispute.open')
  @ApiOk(disputeSchema)
  open(@CurrentActor() actor: Actor, @ZodBody(openDisputeSchema) body: z.infer<typeof openDisputeSchema>) {
    return this.disputes.open(actor, body);
  }

  @Get(':id')
  @ApiOk(disputeSchema)
  get(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.disputes.get(actor, id);
  }

  @Post(':id/messages')
  @ApiOk(disputeSchema)
  message(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(disputeMessageInputSchema) body: z.infer<typeof disputeMessageInputSchema>) {
    return this.disputes.message(actor, id, body);
  }

  @Post(':id/messages/:messageId/accept-settlement')
  @HttpCode(200)
  @Idempotent('dispute.accept-settlement')
  @ApiOk(disputeSchema)
  accept(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @Param('messageId', uuid()) messageId: string) {
    return this.disputes.acceptSettlement(actor, id, messageId);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @AdminOnly()
  @Idempotent('dispute.resolve')
  @ApiOk(disputeSchema)
  resolve(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(resolveDisputeSchema) body: z.infer<typeof resolveDisputeSchema>) {
    return this.disputes.resolve(actor, id, body);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  @ApiOk(disputeSchema)
  withdraw(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(reasonBody) body: z.infer<typeof reasonBody>) {
    return this.disputes.withdraw(actor, id, body.reason);
  }
}
