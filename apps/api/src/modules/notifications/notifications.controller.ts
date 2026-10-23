import { Controller, Get, HttpCode, Injectable, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DELIVERY_STATUS_LABELS, notificationSchema, type NotificationDto } from '@harvestslot/contracts';
import { DomainError, type Actor } from '@harvestslot/core';
import { CurrentActor } from '../../common/decorators.js';
import { PrismaService } from '../../common/prisma.service.js';
import { iso } from '../../common/serialize.js';
import { ApiOk } from '../../common/zod.js';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: Actor, opts: { cursor?: string; limit: number; unread: boolean }): Promise<{ items: NotificationDto[]; nextCursor: string | null }> {
    const rows = await this.prisma.db.notification.findMany({
      where: { userId: actor.userId, ...(opts.unread ? { readAt: null } : {}) },
      include: { deliveries: true },
      orderBy: { id: 'desc' },
      take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, opts.limit);
    return {
      items: page.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        bookingId: n.bookingId,
        readAt: iso(n.readAt),
        createdAt: n.createdAt.toISOString(),
        // Each external channel reports what actually happened — never "sent" without a provider.
        deliveries: [
          { channel: 'IN_APP' as const, status: 'SENT' as const, detail: 'Shown in your HarvestSlot inbox' },
          ...n.deliveries.map((d) => ({ channel: d.channel, status: d.status, detail: `${DELIVERY_STATUS_LABELS[d.status]}${d.destinationMasked ? ` (${d.destinationMasked})` : ''}` })),
        ],
      })),
      nextCursor: rows.length > opts.limit ? page[page.length - 1]!.id : null,
    };
  }

  async unreadCount(actor: Actor) {
    return { unread: await this.prisma.db.notification.count({ where: { userId: actor.userId, readAt: null } }) };
  }

  async markRead(actor: Actor, id: string) {
    const r = await this.prisma.db.notification.updateMany({ where: { id, userId: actor.userId, readAt: null }, data: { readAt: new Date() } });
    if (r.count === 0 && !(await this.prisma.db.notification.findFirst({ where: { id, userId: actor.userId } }))) throw new DomainError('NOT_FOUND', 'Notification not found');
    return this.unreadCount(actor);
  }

  async markAllRead(actor: Actor) {
    await this.prisma.db.notification.updateMany({ where: { userId: actor.userId, readAt: null }, data: { readAt: new Date() } });
    return this.unreadCount(actor);
  }
}

const listQuery = z.object({ cursor: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(30), unread: z.enum(['true', 'false']).optional() });

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOk(z.object({ items: z.array(notificationSchema), nextCursor: z.string().nullable() }))
  list(@CurrentActor() actor: Actor, @Query() raw: Record<string, string>) {
    const q = listQuery.parse(raw);
    return this.notifications.list(actor, { cursor: q.cursor, limit: q.limit, unread: q.unread === 'true' });
  }

  @Get('unread-count')
  unread(@CurrentActor() actor: Actor) {
    return this.notifications.unreadCount(actor);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@CurrentActor() actor: Actor, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.notifications.markRead(actor, id);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentActor() actor: Actor) {
    return this.notifications.markAllRead(actor);
  }
}
