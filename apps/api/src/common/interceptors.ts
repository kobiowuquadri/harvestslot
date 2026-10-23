import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom, Observable } from 'rxjs';
import { DomainError, canonicalJson } from '@harvestslot/core';
import type { Prisma } from '@harvestslot/db';
import { sha256Hex } from './crypto.js';
import { IDEMPOTENT } from './decorators.js';
import { IDEMPOTENCY_HEADER, type AppRequest, type AppResponse } from './http.js';
import { PrismaService } from './prisma.service.js';
import { ENV, type Env } from './tokens.js';

/** Authenticated responses must never be cached by shared caches or reused across users. */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<AppResponse>();
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Vary', 'Cookie');
    return next.handle();
  }
}

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const STALE_IN_PROGRESS_MS = 120_000;

/**
 * Idempotency for consequential operations. The key is scoped to (actor, operation) and bound to a
 * hash of method + path + canonical body. A replay returns the stored response; reuse with a
 * different payload is rejected; 5xx/429 outcomes are not stored so the client can retry.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const operation = this.reflector.get<string | undefined>(IDEMPOTENT, context.getHandler());
    if (!operation) return next.handle();
    return from(this.run(context, next, operation));
  }

  private async run(context: ExecutionContext, next: CallHandler, operation: string): Promise<unknown> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const res = context.switchToHttp().getResponse<AppResponse>();
    const key = req.headers[IDEMPOTENCY_HEADER];
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      throw new DomainError('IDEMPOTENCY_KEY_REQUIRED', 'This action needs an Idempotency-Key header (8–128 letters, digits, - or _)');
    }
    const actorUserId = req.actor?.userId;
    if (!actorUserId) throw new DomainError('UNAUTHENTICATED', 'Sign in to continue');
    const requestHash = sha256Hex(`${req.method} ${req.path}\n${canonicalJson(req.body ?? null)}`);
    const db = this.prisma.db;
    const where = { actorUserId_operation_key: { actorUserId, operation, key } };

    const existing = await db.idempotencyRecord.findUnique({ where });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a different request');
      }
      if (existing.state === 'COMPLETED') {
        res.setHeader('Idempotent-Replayed', 'true');
        res.status(existing.responseStatus ?? 200);
        if ((existing.responseStatus ?? 200) >= 400) {
          const err = existing.responseBody as { error?: { code?: string; message?: string; details?: unknown } } | null;
          throw new DomainError((err?.error?.code ?? 'BAD_REQUEST') as never, err?.error?.message ?? 'Replayed error', err?.error?.details);
        }
        return existing.responseBody;
      }
      if (Date.now() - existing.createdAt.getTime() < STALE_IN_PROGRESS_MS) {
        throw new DomainError('IDEMPOTENCY_IN_PROGRESS', 'The same request is still being processed');
      }
      await db.idempotencyRecord.delete({ where: { id: existing.id } });
    }
    let recordId: string;
    try {
      const rec = await db.idempotencyRecord.create({
        data: {
          actorUserId,
          operation,
          key,
          requestHash,
          expiresAt: new Date(Date.now() + this.env.IDEMPOTENCY_TTL_HOURS * 3_600_000),
        },
      });
      recordId = rec.id;
    } catch {
      throw new DomainError('IDEMPOTENCY_IN_PROGRESS', 'The same request is already being processed');
    }

    try {
      const result = await lastValueFrom(next.handle(), { defaultValue: null });
      await db.idempotencyRecord.update({
        where: { id: recordId },
        data: { state: 'COMPLETED', responseStatus: res.statusCode || 200, responseBody: toJson(result) },
      });
      return result;
    } catch (error) {
      if (error instanceof DomainError && error.status < 500 && error.status !== 429) {
        await db.idempotencyRecord.update({
          where: { id: recordId },
          data: {
            state: 'COMPLETED',
            responseStatus: error.status,
            responseBody: { error: { code: error.code, message: error.message, details: toJson(error.details ?? null) } } as Prisma.InputJsonValue,
          },
        });
      } else {
        await db.idempotencyRecord.delete({ where: { id: recordId } }).catch(() => undefined);
      }
      throw error;
    }
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null, jsonReplacer)) as Prisma.InputJsonValue;
}

/** Global JSON replacer: BigInt → number (within safe range) or string; Prisma Decimal → string. */
export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(value) : value.toString();
  }
  return value;
}

