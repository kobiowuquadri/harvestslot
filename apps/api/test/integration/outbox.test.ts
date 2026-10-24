import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '@harvestslot/config';
import { deliverNotification, drainOutbox, notify, type Messaging, type OutboxHandler } from '@harvestslot/core';
import { makeUser, startApp, type TestApp } from '../support/harness.js';

let t: TestApp;
beforeAll(async () => {
  t = await startApp();
});
afterAll(async () => {
  await t.close();
});

function flakyMessaging(state: { failing: boolean; sent: string[] }): Messaging {
  return {
    mail: {
      mode: 'smtp',
      localOnly: false,
      async send(msg) {
        if (state.failing) throw new Error('SMTP connection refused');
        state.sent.push(msg.to);
        return { messageId: `m-${state.sent.length}` };
      },
    },
    sms: null,
  };
}

describe('transactional outbox', () => {
  // Other test files share this database and leave their own events queued; settle them so each
  // drain here sees only the event under test.
  beforeEach(async () => {
    await t.db.outboxEvent.updateMany({ where: { status: { in: ['PENDING', 'FAILED', 'PROCESSING'] } }, data: { status: 'DONE', processedAt: new Date(), lockedAt: null, lockedBy: null } });
  });

  it('survives a provider failure, retries with backoff, and never sends twice', async () => {
    const user = await makeUser(t.db, 'notified');
    await t.db.consentRecord.create({ data: { userId: user.id, type: 'CONTACT_EMAIL', documentVersion: 'test', granted: true, method: 'FARMER_IN_APP' } });
    await t.db.user.update({ where: { id: user.id }, data: { notificationPrefs: { email: true, sms: true, mutedCategories: [] } } });
    // A business event commits the in-app notification and the outbox row together.
    await t.db.$transaction(async (tx) => {
      await notify(tx, { userIds: [user.id], type: 'test.event', category: 'bookings', title: 'Test', body: 'Body', dedupeKey: `outbox-test:${user.id}` });
    });
    const notification = await t.db.notification.findFirstOrThrow({ where: { userId: user.id } });
    const event = await t.db.outboxEvent.findFirstOrThrow({ where: { aggregateId: notification.id } });
    expect(event.status).toBe('PENDING');

    const env = loadConfig();
    const state = { failing: true, sent: [] as string[] };
    const messaging = flakyMessaging(state);
    let now = new Date();
    const handlers: Record<string, OutboxHandler> = {
      'notification.deliver': (e) => deliverNotification(t.db, messaging, env, (e.payload as { notificationId: string }).notificationId, 'bookings', now),
    };

    // Provider down: the event is kept, marked FAILED with a future retry, and the attempt is recorded.
    await drainOutbox(t.db, handlers, 'test-worker', { now: () => now });
    let ev = await t.db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(ev.status).toBe('FAILED');
    expect(ev.attempts).toBe(1);
    expect(ev.nextAttemptAt.getTime()).toBeGreaterThan(now.getTime());
    let attempt = await t.db.deliveryAttempt.findUniqueOrThrow({ where: { notificationId_channel: { notificationId: notification.id, channel: 'EMAIL' } } });
    expect(attempt.status).toBe('FAILED');
    // SMS has no provider: recorded honestly as unavailable, not "sent".
    const sms = await t.db.deliveryAttempt.findUnique({ where: { notificationId_channel: { notificationId: notification.id, channel: 'SMS' } } });
    expect(sms).toBeNull(); // phone not verified → no SMS channel attempted

    // Not due yet: nothing is claimed.
    expect((await drainOutbox(t.db, handlers, 'test-worker', { now: () => now })).claimed).toBe(0);

    // Provider recovers; after the backoff the event is delivered exactly once.
    state.failing = false;
    now = new Date(Date.now() + 3_600_000);
    await drainOutbox(t.db, handlers, 'test-worker', { now: () => now });
    ev = await t.db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(ev.status).toBe('DONE');
    attempt = await t.db.deliveryAttempt.findUniqueOrThrow({ where: { notificationId_channel: { notificationId: notification.id, channel: 'EMAIL' } } });
    expect(attempt.status).toBe('SENT');
    expect(state.sent).toEqual([user.email]);

    // Re-processing the same notification does not resend a SENT channel.
    await deliverNotification(t.db, messaging, env, notification.id, 'bookings', now);
    expect(state.sent).toHaveLength(1);

    // Duplicate business events are deduplicated by key.
    await t.db.$transaction(async (tx) => {
      await notify(tx, { userIds: [user.id], type: 'test.event', category: 'bookings', title: 'Test', body: 'Body', dedupeKey: `outbox-test:${user.id}` });
    });
    expect(await t.db.notification.count({ where: { userId: user.id } })).toBe(1);
  });

  it('dead-letters after the maximum attempts and can be re-queued', async () => {
    const { requeueOutboxEvent } = await import('@harvestslot/core');
    const e = await t.db.outboxEvent.create({ data: { type: 'unknown.type', aggregateType: 'x', aggregateId: 'y', payload: {}, maxAttempts: 2 } });
    let now = new Date();
    await drainOutbox(t.db, {}, 'w', { now: () => now });
    now = new Date(Date.now() + 3_600_000);
    await drainOutbox(t.db, {}, 'w', { now: () => now });
    const dead = await t.db.outboxEvent.findUniqueOrThrow({ where: { id: e.id } });
    expect(dead.status).toBe('DEAD');
    expect(dead.lastError).toMatch(/No handler/);
    expect(await requeueOutboxEvent(t.db, e.id)).toBe(true);
    expect((await t.db.outboxEvent.findUniqueOrThrow({ where: { id: e.id } })).status).toBe('PENDING');
  });
});
