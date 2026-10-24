'use client';

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * Offline drafts of harvest requests, kept in IndexedDB on this device only.
 * - Scoped to the signed-in account (key prefix) and cleared at sign-out.
 * - Expire after 14 days; only the fields of the form are stored (no server responses).
 * - Syncing is an explicit user action that sends the draft id as the idempotency key, so a
 *   repeated sync cannot create a duplicate request.
 */
export interface HarvestDraft {
  id: string; // client draft id (UUID) — also the server's clientDraftId
  userId: string;
  farmerProfileId: string;
  /** Present when editing an existing server request offline (for conflict detection). */
  serverId?: string;
  serverVersion?: number;
  values: Record<string, unknown>;
  savedAt: number;
  expiresAt: number;
}

interface DraftDb extends DBSchema {
  drafts: { key: string; value: HarvestDraft; indexes: { byUser: string } };
}

const TTL_MS = 14 * 24 * 3600_000;
let dbPromise: Promise<IDBPDatabase<DraftDb>> | null = null;

function db() {
  dbPromise ??= openDB<DraftDb>('harvestslot-drafts', 1, {
    upgrade(d) {
      const store = d.createObjectStore('drafts', { keyPath: 'id' });
      store.createIndex('byUser', 'userId');
    },
  });
  return dbPromise;
}

export async function saveDraft(draft: Omit<HarvestDraft, 'savedAt' | 'expiresAt'>): Promise<HarvestDraft> {
  const now = Date.now();
  const full: HarvestDraft = { ...draft, savedAt: now, expiresAt: now + TTL_MS };
  await (await db()).put('drafts', full);
  return full;
}

export async function listDrafts(userId: string): Promise<HarvestDraft[]> {
  const d = await db();
  const all = await d.getAllFromIndex('drafts', 'byUser', userId);
  const now = Date.now();
  const live: HarvestDraft[] = [];
  for (const draft of all) {
    if (draft.expiresAt <= now) await d.delete('drafts', draft.id);
    else live.push(draft);
  }
  return live.sort((a, b) => b.savedAt - a.savedAt);
}

export async function getDraft(id: string): Promise<HarvestDraft | undefined> {
  const draft = await (await db()).get('drafts', id);
  return draft && draft.expiresAt > Date.now() ? draft : undefined;
}

export async function deleteDraft(id: string): Promise<void> {
  await (await db()).delete('drafts', id);
}

export async function clearAllDrafts(userId: string): Promise<void> {
  const d = await db();
  for (const draft of await d.getAllFromIndex('drafts', 'byUser', userId)) await d.delete('drafts', draft.id);
}
