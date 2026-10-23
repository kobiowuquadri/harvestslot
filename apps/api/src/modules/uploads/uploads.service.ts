import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { connect } from 'node:net';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { z } from 'zod';
import { uploadMetaSchema, type AttachmentDto, type AttachmentPurpose } from '@harvestslot/contracts';
import { audit, DomainError, type Actor } from '@harvestslot/core';
import type { Attachment } from '@harvestslot/db';
import { AccessService } from '../../common/access.service.js';
import { signAttachmentLink, verifyAttachmentLink } from '../../common/crypto.js';
import { PrismaService } from '../../common/prisma.service.js';
import { ENV, STORAGE, type Env, type ObjectStorage } from '../../common/tokens.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOC_TYPES = ['application/pdf'];
const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'video/webm', 'audio/x-m4a', 'audio/wav', 'audio/vnd.wave'];

const ALLOWED: Record<AttachmentPurpose, string[]> = {
  ORG_DOCUMENT: [...IMAGE_TYPES, ...DOC_TYPES],
  IDENTITY_DOCUMENT: [...IMAGE_TYPES, ...DOC_TYPES],
  HARVEST_PHOTO: IMAGE_TYPES,
  PICKUP_EVIDENCE: IMAGE_TYPES,
  DELIVERY_EVIDENCE: IMAGE_TYPES,
  WEIGHT_EVIDENCE: [...IMAGE_TYPES, ...DOC_TYPES],
  QUALITY_PHOTO: IMAGE_TYPES,
  PAYMENT_EVIDENCE: [...IMAGE_TYPES, ...DOC_TYPES],
  DISPUTE_EVIDENCE: [...IMAGE_TYPES, ...DOC_TYPES],
  MESSAGE_ATTACHMENT: [...IMAGE_TYPES, ...DOC_TYPES],
  CONSENT_FORM: [...IMAGE_TYPES, ...DOC_TYPES],
  VOICE_NOTE: AUDIO_TYPES,
  DATA_EXPORT: ['application/json'],
};

/** Files that must not be shared with other parties until a scan says CLEAN (when a scanner exists). */
const SENSITIVE: AttachmentPurpose[] = ['IDENTITY_DOCUMENT', 'ORG_DOCUMENT', 'PAYMENT_EVIDENCE', 'DISPUTE_EVIDENCE', 'CONSENT_FORM'];

const LINK_TTL_MS = 5 * 60_000;

@Injectable()
export class UploadsService {
  private readonly logger = new Logger('Uploads');
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    @Inject(ENV) private readonly env: Env,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** Who may attach a file for a purpose; returns the denormalised links to store. */
  private async authoriseUpload(actor: Actor, meta: z.infer<typeof uploadMetaSchema>) {
    const p = meta.purpose;
    if (['PICKUP_EVIDENCE', 'DELIVERY_EVIDENCE', 'WEIGHT_EVIDENCE', 'QUALITY_PHOTO', 'PAYMENT_EVIDENCE', 'DISPUTE_EVIDENCE', 'MESSAGE_ATTACHMENT'].includes(p)) {
      if (!meta.bookingId) throw new DomainError('VALIDATION_FAILED', 'bookingId is required for this file');
      const a = await this.access.booking(actor, meta.bookingId);
      if ((p === 'PICKUP_EVIDENCE' || p === 'DELIVERY_EVIDENCE') && !a.transporter) throw new DomainError('FORBIDDEN', 'Only the assigned transporter records pickup/delivery evidence');
      if ((p === 'WEIGHT_EVIDENCE' || p === 'QUALITY_PHOTO') && !a.parties.includes('PROCESSOR')) throw new DomainError('FORBIDDEN', 'Only the processor records weighing and quality evidence');
      return { bookingId: meta.bookingId, organisationId: null, farmerProfileId: null, harvestRequestId: null, disputeId: meta.disputeId ?? null };
    }
    if (p === 'HARVEST_PHOTO') {
      if (!meta.harvestRequestId) throw new DomainError('VALIDATION_FAILED', 'harvestRequestId is required');
      const h = await this.prisma.db.harvestRequest.findUnique({ where: { id: meta.harvestRequestId } });
      if (!h) throw new DomainError('NOT_FOUND', 'Harvest request not found');
      await this.access.farmer(actor, h.farmerProfileId, 'harvest.edit');
      return { bookingId: null, organisationId: null, farmerProfileId: h.farmerProfileId, harvestRequestId: h.id, disputeId: null };
    }
    if (p === 'ORG_DOCUMENT') {
      if (!meta.organisationId) throw new DomainError('VALIDATION_FAILED', 'organisationId is required');
      const m = (await this.access.memberships(actor)).find((x) => x.organisationId === meta.organisationId);
      if (!m || !m.roles.some((r) => r === 'OWNER' || r === 'MANAGER')) throw new DomainError('NOT_FOUND', 'Organisation not found');
      return { bookingId: null, organisationId: meta.organisationId, farmerProfileId: null, harvestRequestId: null, disputeId: null };
    }
    if (p === 'CONSENT_FORM') {
      if (!meta.organisationId) throw new DomainError('VALIDATION_FAILED', 'organisationId is required');
      await this.access.requireOrg(actor, meta.organisationId, 'coop.members.manage');
      return { bookingId: null, organisationId: meta.organisationId, farmerProfileId: meta.farmerProfileId ?? null, harvestRequestId: null, disputeId: null };
    }
    if (p === 'IDENTITY_DOCUMENT' || p === 'VOICE_NOTE') {
      if (meta.farmerProfileId) await this.access.farmer(actor, meta.farmerProfileId, 'harvest.edit');
      return { bookingId: null, organisationId: null, farmerProfileId: meta.farmerProfileId ?? null, harvestRequestId: null, disputeId: null };
    }
    throw new DomainError('FORBIDDEN', 'This file type cannot be uploaded here');
  }

  /** ClamAV `INSTREAM` over TCP. Returns null when no scanner is configured. */
  private async scan(buffer: Buffer): Promise<'CLEAN' | 'INFECTED' | null> {
    if (!this.env.CLAMAV_HOST) return null;
    return new Promise((resolve) => {
      const socket = connect({ host: this.env.CLAMAV_HOST!, port: this.env.CLAMAV_PORT });
      let response = '';
      socket.setTimeout(30_000, () => {
        socket.destroy();
        this.logger.warn('ClamAV scan timed out');
        resolve(null);
      });
      socket.on('error', (e) => {
        this.logger.warn(`ClamAV unavailable: ${e.message}`);
        resolve(null);
      });
      socket.on('data', (d) => (response += d.toString()));
      socket.on('end', () => resolve(/OK\0?$/.test(response.trim()) ? 'CLEAN' : /FOUND/.test(response) ? 'INFECTED' : null));
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let i = 0; i < buffer.length; i += 64 * 1024) {
          const chunk = buffer.subarray(i, i + 64 * 1024);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(chunk.length);
          socket.write(len);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }

  async upload(actor: Actor, file: { buffer: Buffer; originalname: string; size: number } | undefined, rawMeta: unknown): Promise<AttachmentDto> {
    if (!file?.buffer?.length) throw new DomainError('UPLOAD_REJECTED', 'Attach a file');
    if (file.size > this.env.UPLOAD_MAX_BYTES) throw new DomainError('PAYLOAD_TOO_LARGE', `Files must be at most ${Math.round(this.env.UPLOAD_MAX_BYTES / 1_048_576)} MB`);
    const parsed = uploadMetaSchema.safeParse(rawMeta);
    if (!parsed.success) throw new DomainError('VALIDATION_FAILED', 'Invalid upload details', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    const meta = parsed.data;
    const links = await this.authoriseUpload(actor, meta);
    // The declared extension and Content-Type are ignored; the bytes decide.
    const detected = await fileTypeFromBuffer(file.buffer);
    let mime = detected?.mime ?? (meta.purpose === 'DATA_EXPORT' ? 'application/json' : 'application/octet-stream');
    if (!ALLOWED[meta.purpose].includes(mime)) {
      throw new DomainError('UPLOAD_REJECTED', `This file type (${mime}) is not accepted here. Allowed: ${ALLOWED[meta.purpose].join(', ')}`);
    }
    const scan = await this.scan(file.buffer);
    if (scan === 'INFECTED') {
      await audit(this.prisma.db, { actor, action: 'upload.rejected-malware', entityType: 'upload', entityId: randomUUID(), data: { purpose: meta.purpose } });
      throw new DomainError('UPLOAD_REJECTED', 'The file failed a malware scan and was not stored');
    }
    let body = file.buffer;
    const metadata: Record<string, unknown> = { capturedAtSelfReported: meta.capturedAt ?? null };
    if (IMAGE_TYPES.includes(mime)) {
      // Field photos are compressed and re-encoded; EXIF (including GPS) is stripped from the stored copy.
      const info = await sharp(file.buffer).metadata();
      metadata.original = { width: info.width, height: info.height, format: info.format, bytes: file.size, exifPresent: Boolean(info.exif) };
      body = await sharp(file.buffer).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
      mime = 'image/jpeg';
    }
    const ext = mime === 'image/jpeg' ? 'jpg' : (detected?.ext ?? 'bin');
    const now = new Date();
    const key = `${meta.purpose.toLowerCase()}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ext}`;
    await this.storage.put(key, body, mime);
    const safeName = file.originalname.replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120) || `file.${ext}`;
    const row = await this.prisma.db.attachment.create({
      data: {
        ownerUserId: actor.userId,
        ...links,
        purpose: meta.purpose,
        objectKey: key,
        originalFilename: safeName,
        contentType: mime,
        sizeBytes: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
        scanStatus: scan ?? 'NOT_SCANNED',
        metadata: metadata as object,
        isDemo: actor.isDemo,
      },
    });
    await audit(this.prisma.db, { actor, action: 'upload.stored', entityType: 'attachment', entityId: row.id, data: { purpose: meta.purpose, contentType: mime, sizeBytes: body.length } });
    return this.dto(row);
  }

  async dto(a: Attachment): Promise<AttachmentDto> {
    const owner = await this.prisma.db.user.findUnique({ where: { id: a.ownerUserId }, select: { displayName: true } });
    return {
      id: a.id,
      purpose: a.purpose,
      filename: a.originalFilename,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
      scanStatus: a.scanStatus,
      reviewStatus: a.reviewStatus,
      createdAt: a.createdAt.toISOString(),
      uploadedBy: owner?.displayName ?? 'Unknown',
      metadata: (a.metadata ?? {}) as Record<string, unknown>,
    };
  }

  /** Object-level authorisation for reading an attachment. */
  async authoriseRead(actor: Actor, a: Attachment): Promise<void> {
    if (a.ownerUserId === actor.userId) return;
    if (actor.platformRole === 'ADMIN') {
      await audit(this.prisma.db, { actor, action: 'attachment.admin-viewed', entityType: 'attachment', entityId: a.id });
      return;
    }
    if (a.bookingId) {
      await this.access.booking(actor, a.bookingId);
      if (SENSITIVE.includes(a.purpose) && a.scanStatus === 'INFECTED') throw new DomainError('NOT_FOUND', 'Not found');
      return;
    }
    if (a.organisationId) {
      const m = (await this.access.memberships(actor)).find((x) => x.organisationId === a.organisationId);
      if (m) return;
    }
    if (a.farmerProfileId) {
      await this.access.farmer(actor, a.farmerProfileId, 'profile.view');
      return;
    }
    throw new DomainError('NOT_FOUND', 'Not found');
  }

  async get(actor: Actor, id: string): Promise<AttachmentDto> {
    const a = await this.prisma.db.attachment.findUnique({ where: { id } });
    if (!a) throw new DomainError('NOT_FOUND', 'Not found');
    await this.authoriseRead(actor, a);
    return this.dto(a);
  }

  async link(actor: Actor, id: string): Promise<{ url: string; expiresAt: string }> {
    await this.get(actor, id);
    const exp = Date.now() + LINK_TTL_MS;
    const sig = signAttachmentLink(this.env.SESSION_SECRET, id, actor.userId, exp);
    return { url: `/api/v1/attachments/${id}/content?exp=${exp}&sig=${sig}`, expiresAt: new Date(exp).toISOString() };
  }

  /** Streams the private object if the signed link is valid for this user and access still holds. */
  async content(actor: Actor, id: string, exp: number, sig: string): Promise<{ body: Buffer; contentType: string; filename: string; inline: boolean }> {
    if (!verifyAttachmentLink(this.env.SESSION_SECRET, id, actor.userId, exp, sig)) throw new DomainError('FORBIDDEN', 'This link has expired. Open the file again.');
    const a = await this.prisma.db.attachment.findUnique({ where: { id } });
    if (!a || a.scanStatus === 'INFECTED') throw new DomainError('NOT_FOUND', 'Not found');
    await this.authoriseRead(actor, a);
    const body = await this.storage.get(a.objectKey);
    // Re-encoded images are safe to show inline; everything else downloads.
    return { body, contentType: a.contentType, filename: a.originalFilename, inline: a.contentType === 'image/jpeg' };
  }

  async listForBooking(actor: Actor, bookingId: string): Promise<AttachmentDto[]> {
    await this.access.booking(actor, bookingId);
    const rows = await this.prisma.db.attachment.findMany({ where: { bookingId }, orderBy: { createdAt: 'desc' } });
    return Promise.all(rows.map((r) => this.dto(r)));
  }
}
