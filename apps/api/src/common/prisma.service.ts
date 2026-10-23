import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@harvestslot/db';
import { loadPolicies, type Policies } from '@harvestslot/core';
import { ENV, type Env } from './tokens.js';

/** Holds the single Prisma client for the process. Inject `PrismaService` and use `.db`. */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly logger = new Logger('Prisma');
  readonly db: PrismaClient;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.db = createPrismaClient({
      url: env.DATABASE_URL,
      poolMax: env.DATABASE_POOL_MAX,
      applicationName: 'harvestslot-api',
      onPoolError: (err) => this.logger.error(`Pool error: ${err.message}`),
    });
  }

  policies(): Promise<Policies> {
    return loadPolicies(this.db, this.env);
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
  }
}
