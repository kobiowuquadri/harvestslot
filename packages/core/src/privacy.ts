import { randomUUID, createHash } from 'node:crypto';
import type { PrismaClient } from '@harvestslot/db';
import type { ObjectStorage } from './storage.js';
import { audit } from './audit.js';
import { notify } from './notify.js';

function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

/** Assembles the personal data HarvestSlot holds about a user, as JSON. */
export async function buildUserExport(prisma: PrismaClient, userId: string): Promise<Record<string, unknown>> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, phone: true, displayName: true, locale: true, createdAt: true, lastLoginAt: true, notificationPrefs: true, platformRole: true },
  });
  const farmer = await prisma.farmerProfile.findUnique({ where: { userId }, include: { locations: true, delegations: true, coopMemberships: true } });
  const harvests = farmer ? await prisma.harvestRequest.findMany({ where: { farmerProfileId: farmer.id } }) : [];
  const bookings = farmer ? await prisma.booking.findMany({ where: { farmerProfileId: farmer.id }, select: { id: true, reference: true, status: true, createdAt: true, completedAt: true } }) : [];
  const invoices = farmer
    ? await prisma.invoice.findMany({ where: { OR: [{ payeeFarmerId: farmer.id }, { payerFarmerId: farmer.id }] }, include: { lines: true, payments: true } })
    : [];
  return plain({
    generatedAt: new Date().toISOString(),
    note: 'Personal data export from HarvestSlot. Transaction records are shared with your counterparties and are retained as required for contracts and accounting.',
    user,
    memberships: await prisma.membership.findMany({ where: { userId }, include: { organisation: { select: { name: true, type: true } } } }),
    consents: await prisma.consentRecord.findMany({ where: { OR: [{ userId }, ...(farmer ? [{ farmerProfileId: farmer.id }] : [])] }, orderBy: { createdAt: 'asc' } }),
    sessions: await prisma.session.findMany({ where: { userId }, select: { createdAt: true, lastSeenAt: true, ip: true, userAgent: true, revokedAt: true } }),
    farmerProfile: farmer,
    harvestRequests: harvests,
    bookings,
    invoices,
    notifications: await prisma.notification.findMany({ where: { userId }, select: { type: true, title: true, createdAt: true, readAt: true } }),
  }) as Record<string, unknown>;
}

/** Fulfils an export request: stores the JSON privately for the user and marks the request completed. */
export async function fulfilDataExport(prisma: PrismaClient, storage: ObjectStorage, requestId: string): Promise<void> {
  const req = await prisma.dataRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (req.type !== 'EXPORT' || req.status === 'COMPLETED') return;
  const data = Buffer.from(JSON.stringify(await buildUserExport(prisma, req.userId), null, 2));
  const key = `data_export/${new Date().getUTCFullYear()}/${randomUUID()}.json`;
  await storage.put(key, data, 'application/json');
  await prisma.$transaction(async (tx) => {
    const att = await tx.attachment.create({
      data: {
        ownerUserId: req.userId,
        purpose: 'DATA_EXPORT',
        objectKey: key,
        originalFilename: `harvestslot-data-export-${new Date().toISOString().slice(0, 10)}.json`,
        contentType: 'application/json',
        sizeBytes: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
        scanStatus: 'NOT_SCANNED',
      },
    });
    await tx.dataRequest.update({ where: { id: requestId }, data: { status: 'COMPLETED', completedAt: new Date(), resultAttachmentId: att.id, outcomeNote: 'Export generated automatically.' } });
    await audit(tx, { action: 'privacy.export-generated', entityType: 'data_request', entityId: requestId, actorParty: 'SYSTEM' });
    await notify(tx, { userIds: [req.userId], type: 'privacy.export-ready', category: 'account', title: 'Your data export is ready', body: 'Download it from Settings › Privacy. The link is private to you.', link: '/settings/privacy', dedupeKey: `export-ready:${requestId}` });
  });
}
