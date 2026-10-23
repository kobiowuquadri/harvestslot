import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  adminDataRequestDecisionSchema,
  adminLocationSchema,
  adminPolicyUpdateSchema,
  adminReviewDocumentSchema,
  adminReviewOrgSchema,
  adminUserStatusSchema,
  analyticsQuerySchema,
  analyticsResponseSchema,
  auditQuerySchema,
  dataRequestInputSchema,
  exportQuerySchema,
  reasonText,
} from '@harvestslot/contracts';
import { audit, DomainError, enqueueOutbox, OUTBOX_TYPES, notify, adminUserIds, type Actor } from '@harvestslot/core';
import { AdminOnly, CurrentActor } from '../../common/decorators.js';
import type { AppResponse } from '../../common/http.js';
import { PrismaService } from '../../common/prisma.service.js';
import { ApiOk, ZodBody, ZodQuery } from '../../common/zod.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { AdminService } from './admin.service.js';

const uuid = () => new ParseUUIDPipe();
const reasonBody = z.object({ reason: reasonText });

@ApiTags('admin')
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('organisations')
  organisations(@Query('status') status?: string, @Query('type') type?: string) {
    return this.admin.organisations(status, type);
  }

  @Post('organisations/:id/review')
  @HttpCode(200)
  review(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(adminReviewOrgSchema) body: z.infer<typeof adminReviewOrgSchema>) {
    return this.admin.reviewOrganisation(actor, id, body);
  }

  @Post('attachments/:id/review')
  @HttpCode(200)
  reviewDocument(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(adminReviewDocumentSchema) body: z.infer<typeof adminReviewDocumentSchema>) {
    return this.admin.reviewDocument(actor, id, body);
  }

  @Get('users')
  users(@Query('q') q?: string) {
    return this.admin.users(q?.slice(0, 80));
  }

  @Post('users/:id/status')
  @HttpCode(200)
  setUserStatus(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(adminUserStatusSchema) body: z.infer<typeof adminUserStatusSchema>) {
    return this.admin.setUserStatus(actor, id, body);
  }

  @Get('incidents')
  incidents() {
    return this.admin.incidents();
  }

  @Get('policies')
  policies() {
    return this.admin.policies();
  }

  @Put('policies')
  setPolicy(@CurrentActor() actor: Actor, @ZodBody(adminPolicyUpdateSchema) body: z.infer<typeof adminPolicyUpdateSchema>) {
    return this.admin.setPolicy(actor, body);
  }

  @Get('locations')
  locations() {
    return this.admin.locations();
  }

  @Put('locations')
  setLocation(@CurrentActor() actor: Actor, @ZodBody(adminLocationSchema) body: z.infer<typeof adminLocationSchema>) {
    return this.admin.setLocation(actor, body);
  }

  @Get('outbox')
  outbox(@Query('status') status?: string) {
    return this.admin.outbox(status);
  }

  @Post('outbox/:id/requeue')
  @HttpCode(200)
  requeue(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(reasonBody) body: z.infer<typeof reasonBody>) {
    return this.admin.requeue(actor, id, body.reason);
  }

  @Get('webhooks')
  webhooks() {
    return this.admin.webhooks();
  }

  @Get('audit')
  auditLog(@ZodQuery(auditQuerySchema) q: z.infer<typeof auditQuerySchema>) {
    return this.admin.auditLog(q);
  }

  @Get('exports')
  async export(@CurrentActor() actor: Actor, @ZodQuery(exportQuerySchema) q: z.infer<typeof exportQuerySchema>, @Res() res: AppResponse) {
    const { filename, csv } = await this.admin.export(actor, q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(`﻿${csv}`);
  }

  @Get('data-requests')
  dataRequests() {
    return this.admin.dataRequests();
  }

  @Post('data-requests/:id')
  @HttpCode(200)
  decideDataRequest(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @ZodBody(adminDataRequestDecisionSchema) body: z.infer<typeof adminDataRequestDecisionSchema>) {
    return this.admin.decideDataRequest(actor, id, body);
  }

  @Get('analytics')
  @ApiOk(analyticsResponseSchema)
  platformAnalytics(@CurrentActor() actor: Actor, @ZodQuery(analyticsQuerySchema) q: z.infer<typeof analyticsQuerySchema>) {
    return this.analytics.compute(actor, { kind: 'platform', id: null }, q);
  }
}

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('organisations/:orgId')
  @ApiOk(analyticsResponseSchema)
  async org(@CurrentActor() actor: Actor, @Param('orgId', uuid()) orgId: string, @ZodQuery(analyticsQuerySchema) q: z.infer<typeof analyticsQuerySchema>) {
    const org = await this.prisma.db.organisation.findUnique({ where: { id: orgId }, select: { type: true } });
    if (!org) throw new DomainError('NOT_FOUND', 'Organisation not found');
    const kind = org.type === 'PROCESSOR' ? 'processor' : org.type === 'TRANSPORTER' ? 'transporter' : 'cooperative';
    return this.analytics.compute(actor, { kind, id: orgId }, q);
  }

  @Get('farmers/:farmerId')
  @ApiOk(analyticsResponseSchema)
  farmer(@CurrentActor() actor: Actor, @Param('farmerId', uuid()) farmerId: string, @ZodQuery(analyticsQuerySchema) q: z.infer<typeof analyticsQuerySchema>) {
    return this.analytics.compute(actor, { kind: 'farmer', id: farmerId }, q);
  }
}

@ApiTags('privacy')
@Controller('privacy')
export class PrivacyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('consents')
  async consents(@CurrentActor() actor: Actor) {
    const rows = await this.prisma.db.consentRecord.findMany({ where: { userId: actor.userId }, orderBy: { createdAt: 'desc' } });
    return rows.map((c) => ({ type: c.type, granted: c.granted, documentVersion: c.documentVersion, method: c.method, createdAt: c.createdAt.toISOString() }));
  }

  @Get('requests')
  async requests(@CurrentActor() actor: Actor) {
    const rows = await this.prisma.db.dataRequest.findMany({ where: { userId: actor.userId }, orderBy: { createdAt: 'desc' } });
    return rows.map((r) => ({ id: r.id, type: r.type, status: r.status, note: r.note, outcomeNote: r.outcomeNote, resultAttachmentId: r.resultAttachmentId, createdAt: r.createdAt.toISOString(), completedAt: r.completedAt?.toISOString() ?? null }));
  }

  /** Export requests are fulfilled automatically by the worker; deletion requests are reviewed by an administrator. */
  @Post('requests')
  async create(@CurrentActor() actor: Actor, @ZodBody(dataRequestInputSchema) body: z.infer<typeof dataRequestInputSchema>) {
    const open = await this.prisma.db.dataRequest.count({ where: { userId: actor.userId, type: body.type, status: { in: ['RECEIVED', 'IN_PROGRESS'] } } });
    if (open) throw new DomainError('DUPLICATE', 'You already have an open request of this type');
    const req = await this.prisma.db.$transaction(async (tx) => {
      const r = await tx.dataRequest.create({ data: { userId: actor.userId, type: body.type, note: body.note ?? null } });
      await audit(tx, { actor, action: `privacy.${body.type.toLowerCase()}-requested`, entityType: 'data_request', entityId: r.id });
      if (body.type === 'EXPORT') {
        await enqueueOutbox(tx, { type: OUTBOX_TYPES.DATA_EXPORT, aggregateType: 'data_request', aggregateId: r.id, payload: { requestId: r.id }, dedupeKey: `export:${r.id}` });
      } else {
        await notify(tx, { userIds: await adminUserIds(tx), type: 'privacy.deletion-requested', category: 'account', title: 'Account deletion requested', body: 'Review it in Admin › Data requests.', link: '/admin/data-requests', dedupeKey: `deletion:${r.id}` });
      }
      return r;
    });
    return { id: req.id, status: req.status };
  }
}

