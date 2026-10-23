import type { Request, Response } from 'express';
import type { Actor } from '@harvestslot/core';

export interface SessionContext {
  id: string;
  mfaPending: boolean;
  mfaVerifiedAt: Date | null;
  absoluteExpiresAt: Date;
}

export interface AppRequest extends Request {
  requestId: string;
  actor?: Actor;
  sessionCtx?: SessionContext;
  rawBody?: Buffer;
}

export type AppResponse = Response;

export const SESSION_COOKIE = 'hs_session';
export const CSRF_COOKIE = 'hs_csrf';
export const CSRF_HEADER = 'x-csrf-token';
export const IDEMPOTENCY_HEADER = 'idempotency-key';
