import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseInterceptors, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { attachmentLinkSchema, attachmentSchema } from '@harvestslot/contracts';
import { loadConfig } from '@harvestslot/config';
import type { Actor } from '@harvestslot/core';
import { byActor, CurrentActor, RateLimit } from '../../common/decorators.js';
import type { AppResponse } from '../../common/http.js';
import { ApiOk } from '../../common/zod.js';
import { UploadsService } from './uploads.service.js';

const uuid = () => new ParseUUIDPipe();

@ApiTags('files')
@Controller()
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('uploads')
  @RateLimit({ name: 'upload', limit: 60, windowSec: 3600, key: byActor })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: loadConfig().UPLOAD_MAX_BYTES, files: 1, fields: 10 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, purpose: { type: 'string' }, bookingId: { type: 'string' } } } })
  @ApiOk(attachmentSchema)
  upload(@CurrentActor() actor: Actor, @UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined, @Body() body: Record<string, string>) {
    return this.uploads.upload(actor, file, Object.fromEntries(Object.entries(body ?? {}).filter(([, v]) => v !== '')));
  }

  @Get('attachments/:id')
  @ApiOk(attachmentSchema)
  get(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.uploads.get(actor, id);
  }

  @Get('attachments/:id/link')
  @ApiOk(attachmentLinkSchema)
  link(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.uploads.link(actor, id);
  }

  @Get('attachments/:id/content')
  async content(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: AppResponse) {
    const file = await this.uploads.content(actor, id, Number(exp), String(sig ?? ''));
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `${file.inline ? 'inline' : 'attachment'}; filename="${file.filename.replace(/"/g, '')}"`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.body);
  }

  @Get('bookings/:id/attachments')
  @ApiOk(z.array(attachmentSchema))
  forBooking(@CurrentActor() actor: Actor, @Param('id', uuid()) id: string) {
    return this.uploads.listForBooking(actor, id);
  }
}
