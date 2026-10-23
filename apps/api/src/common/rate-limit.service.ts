import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';
import { ENV, type Env } from './tokens.js';

export interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window rate limiter. Uses Redis (shared across API instances) when REDIS_URL is set,
 * otherwise an in-process map (adequate for a single API instance; documented limitation).
 */
@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger('RateLimit');
  private readonly redis: Redis | null;
  private readonly memory = new Map<string, { count: number; resetAt: number }>();

  constructor(@Inject(ENV) env: Env) {
    this.redis = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false }) : null;
    this.redis?.on('error', (e) => this.logger.warn(`Redis unavailable for rate limiting: ${e.message}`));
  }

  get backend(): 'redis' | 'memory' {
    return this.redis ? 'redis' : 'memory';
  }

  async consume(rawKey: string, limit: number, windowSec: number): Promise<ConsumeResult> {
    // Keys may contain identifiers (emails/phones); store only a hash.
    const key = `rl:${createHash('sha256').update(rawKey).digest('hex').slice(0, 32)}`;
    if (this.redis && this.redis.status === 'ready') {
      try {
        const results = await this.redis.multi().incr(key).pttl(key).exec();
        const count = Number(results?.[0]?.[1] ?? 1);
        let ttl = Number(results?.[1]?.[1] ?? -1);
        if (ttl < 0) {
          await this.redis.pexpire(key, windowSec * 1000);
          ttl = windowSec * 1000;
        }
        return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds: Math.ceil(ttl / 1000) };
      } catch {
        // fall through to memory if Redis misbehaves
      }
    }
    const now = Date.now();
    let entry = this.memory.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowSec * 1000 };
      this.memory.set(key, entry);
    }
    entry.count++;
    if (this.memory.size > 50_000) {
      for (const [k, v] of this.memory) if (v.resetAt <= now) this.memory.delete(k);
    }
    return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }

  /** Clears a bucket (e.g. after a successful login). */
  async reset(rawKey: string): Promise<void> {
    const key = `rl:${createHash('sha256').update(rawKey).digest('hex').slice(0, 32)}`;
    this.memory.delete(key);
    if (this.redis?.status === 'ready') await this.redis.del(key).catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => undefined);
  }
}
