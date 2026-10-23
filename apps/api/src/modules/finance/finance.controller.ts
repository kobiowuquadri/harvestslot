import { Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  initialiseCheckoutResultSchema,
  invoiceListQuerySchema,
  invoiceSchema,
  receiptDecisionSchema,
  reportPaymentSchema,
  reportRefundSchema,
} from '@harvestslot/contracts';
import type { Actor } from '@harvestslot/core';
import { byActor, CurrentActor, Idempotent, Public, RateLimit, Req, SkipCsrf } from '../../common/decorators.js';
import type { AppRequest, AppResponse } from '../../common/http.js';
import { ApiOk, ZodBody, ZodQuery } from '../../common/zod.js';
import { FinanceService } from './finance.service.js';

const uuid = () => new ParseUUIDPipe();
const simulateBody = z.object({ outcome: z.enum(['success', 'failed', 'abandoned']) });
const verifyBody = z.object({ reference: z.string().min(6).max(80) });

function sendDocument(res: AppResponse, doc: { filename: string; html: string }) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${doc.filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
  // Rendered as a download; if opened inline it is sandboxed with no scripts.
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(doc.html);
}

@ApiTags('invoices & payments')
@Controller()
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('invoices')
  @ApiOk(z.array(invoiceSchema))
  list(@CurrentActor() actor: Actor, @ZodQuery(invoiceListQuerySchema) q: z.infer<typeof invoiceListQuerySchema>) {
    return this.finance.list(actor, q);
  }

  @Get('invoices/:id')
  @ApiOk(invoiceSchema)
  get(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.finance.get(actor, id);
  }

  @Get('invoices/:id/document')
  async document(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @Res() res: AppResponse) {
    sendDocument(res, await this.finance.invoiceDocument(actor, id));
  }

  @Post('invoices/:id/payments')
  @Idempotent('payment.report')
  @ApiOk(invoiceSchema)
  report(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(reportPaymentSchema) body: z.infer<typeof reportPaymentSchema>) {
    return this.finance.reportPayment(actor, id, body);
  }

  @Post('payments/:id/receipt')
  @HttpCode(200)
  @Idempotent('payment.receipt')
  @ApiOk(invoiceSchema)
  receipt(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(receiptDecisionSchema) body: z.infer<typeof receiptDecisionSchema>) {
    return this.finance.receipt(actor, id, body);
  }

  @Get('payments/:id/acknowledgement')
  async acknowledgement(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @Res() res: AppResponse) {
    sendDocument(res, await this.finance.acknowledgementDocument(actor, id));
  }

  @Post('invoices/:id/refunds')
  @Idempotent('refund.report')
  @ApiOk(invoiceSchema)
  refund(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(reportRefundSchema) body: z.infer<typeof reportRefundSchema>) {
    return this.finance.reportRefund(actor, id, body);
  }

  @Post('refunds/:id/confirm')
  @HttpCode(200)
  @ApiOk(invoiceSchema)
  confirmRefund(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.finance.confirmRefund(actor, id);
  }

  @Post('invoices/:id/checkout')
  @HttpCode(200)
  @Idempotent('payment.checkout')
  @RateLimit({ name: 'checkout', limit: 20, windowSec: 3600, key: byActor })
  @ApiOk(initialiseCheckoutResultSchema)
  checkout(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.finance.checkout(actor, id);
  }

  @Post('payments/verify')
  @HttpCode(200)
  verify(@CurrentActor() actor: Actor, @ZodBody(verifyBody) body: z.infer<typeof verifyBody>) {
    return this.finance.verifyReturn(actor, body.reference);
  }

  /** Paystack webhook. Public, CSRF-exempt, authenticated by HMAC-SHA512 signature over the raw body. */
  @Public()
  @SkipCsrf()
  @Post('webhooks/paystack')
  @HttpCode(200)
  paystackWebhook(@Req() req: AppRequest, @Headers('x-paystack-signature') signature?: string) {
    return this.finance.webhook('paystack', req.rawBody, signature);
  }

  @Get('dev/payment-simulator/:reference')
  simulatorInfo(@CurrentActor() actor: Actor, @Param('reference') reference: string) {
    return this.finance.simulatorInfo(actor, reference);
  }

  @Post('dev/payment-simulator/:reference')
  @HttpCode(200)
  simulate(@CurrentActor() actor: Actor, @Param('reference') reference: string, @ZodBody(simulateBody) body: z.infer<typeof simulateBody>) {
    return this.finance.simulate(actor, reference, body.outcome);
  }

  @Get('payments/return')
  @Public()
  returnHint(@Query('reference') reference?: string) {
    return { message: 'Open the HarvestSlot app to finish verifying this payment.', reference: reference ?? null };
  }
}
