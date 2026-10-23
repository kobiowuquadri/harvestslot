import { Global, Module } from '@nestjs/common';
import { loadConfig } from '@harvestslot/config';
import { createMessaging, createPaymentProvider, createStorage } from '@harvestslot/core';
import { AccessService } from './access.service.js';
import { PrismaService } from './prisma.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { SessionService } from './sessions.service.js';
import { ENV, MESSAGING, PAYMENTS, STORAGE, type Env } from './tokens.js';

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadConfig() },
    PrismaService,
    { provide: STORAGE, inject: [ENV], useFactory: (env: Env) => createStorage(env) },
    { provide: MESSAGING, inject: [ENV], useFactory: (env: Env) => createMessaging(env) },
    { provide: PAYMENTS, inject: [ENV, PrismaService], useFactory: (env: Env, prisma: PrismaService) => createPaymentProvider(env, prisma.db) },
    AccessService,
    RateLimitService,
    SessionService,
  ],
  exports: [ENV, PrismaService, STORAGE, MESSAGING, PAYMENTS, AccessService, RateLimitService, SessionService],
})
export class CommonModule {}
