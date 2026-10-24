import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { demoFeaturesAllowed, devToolsAllowed, effectiveQueueBackend } from '@harvestslot/config';
import { integrationStatusSchema, publicConfigSchema, type IntegrationStatus, type PublicConfig } from '@harvestslot/contracts';
import { DomainError, listCapturedMessages } from '@harvestslot/core';
import { CurrentActor, Public } from '../../common/decorators.js';
import { PrismaService } from '../../common/prisma.service.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { ENV, MESSAGING, PAYMENTS, STORAGE, type Env, type Messaging, type ObjectStorage, type PaymentProvider } from '../../common/tokens.js';
import { ApiOk } from '../../common/zod.js';
import type { Actor } from '@harvestslot/core';

@ApiTags('system')
@Controller()
export class SystemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: RateLimitService,
    @Inject(ENV) private readonly env: Env,
    @Inject(STORAGE) private readonly storage: ObjectStorage,
    @Inject(MESSAGING) private readonly messaging: Messaging,
    @Inject(PAYMENTS) private readonly payments: PaymentProvider | null,
  ) {}

  /** Liveness: the process is up. */
  @Public()
  @Get('health/live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: the database answers and migrations are applied. Used by deploy health checks. */
  @Public()
  @Get('health/ready')
  async ready() {
    const started = Date.now();
    try {
      await this.prisma.db.$queryRaw`SELECT 1`;
      const pending = await this.prisma.db.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`;
      if (Number(pending[0]?.n ?? 0) > 0) throw new Error('migration in progress');
      return { status: 'ok', database: 'ok', latencyMs: Date.now() - started };
    } catch (error) {
      throw new DomainError('PROVIDER_UNAVAILABLE', `Not ready: ${String(error).slice(0, 120)}`);
    }
  }

  @Public()
  @Get('config/public')
  @ApiOk(publicConfigSchema)
  async publicConfig(): Promise<PublicConfig> {
    const locations = await this.prisma.db.supportedLocation.findMany({ where: { active: true }, orderBy: { lga: 'asc' }, select: { lga: true } });
    return {
      demoMode: demoFeaturesAllowed(this.env),
      devTools: devToolsAllowed(this.env),
      smsAvailable: this.messaging.sms !== null,
      paymentProvider: this.payments ? this.payments.name : 'none',
      voiceDrafts: this.env.AI_VOICE_DRAFTS_ENABLED,
      mapStyleUrl: this.env.MAP_STYLE_URL ?? null,
      mapAttribution: this.env.MAP_ATTRIBUTION ?? null,
      routing: 'none',
      roadDistanceFactor: this.env.ROAD_DISTANCE_FACTOR,
      supportedLgas: locations.map((l) => l.lga),
    };
  }

  /** Capability report for signed-in users: what is configured, simulated or missing. Never reveals secrets. */
  @Get('integrations/status')
  @ApiOk(integrationStatusSchema)
  async integrations(): Promise<IntegrationStatus> {
    const storage = await this.storage.health();
    const queue = effectiveQueueBackend(this.env);
    const cap = (key: string, label: string, status: IntegrationStatus['capabilities'][number]['status'], detail: string) => ({ key, label, status, detail });
    return {
      environment: this.env.APP_ENV,
      capabilities: [
        cap('database', 'PostgreSQL', 'configured', 'Authoritative store for capacity, bookings, payments and audit.'),
        cap('queue', 'Background jobs', 'configured', queue === 'redis' ? 'BullMQ on Redis.' : 'BullMQ on its PostgreSQL backend (no Redis configured).'),
        cap('rateLimit', 'Rate limiting', 'configured', this.limiter.backend === 'redis' ? 'Shared counters in Redis.' : 'In-process counters (single API instance).'),
        cap(
          'storage',
          'Private file storage',
          this.storage.driver === 'filesystem' ? 'simulated' : storage.ok ? 'configured' : 'unconfigured',
          this.storage.driver === 'filesystem' ? 'Development filesystem storage (not for production).' : storage.detail,
        ),
        cap('scanning', 'Malware scanning', this.env.CLAMAV_HOST ? 'configured' : 'unconfigured', this.env.CLAMAV_HOST ? 'ClamAV daemon.' : 'No scanner: files are marked "not scanned" and served only as downloads.'),
        cap(
          'email',
          'Email',
          this.messaging.mail.mode === 'dev-capture' ? 'simulated' : 'configured',
          this.messaging.mail.mode === 'dev-capture' ? 'Captured locally for development; nothing is delivered.' : this.messaging.mail.localOnly ? 'SMTP to a local capture tool (Mailpit).' : 'SMTP delivery.',
        ),
        cap(
          'sms',
          'SMS',
          !this.messaging.sms ? 'unconfigured' : this.messaging.sms.mode === 'dev-capture' ? 'simulated' : 'configured',
          !this.messaging.sms ? 'No SMS provider: SMS deliveries are recorded as unavailable and phone codes are disabled.' : this.messaging.sms.mode === 'dev-capture' ? 'Codes captured locally for development; nothing is sent.' : 'Termii.',
        ),
        cap(
          'payments',
          'Online payments (service fees)',
          !this.payments ? 'unconfigured' : this.payments.name === 'simulated' ? 'simulated' : 'configured',
          !this.payments ? 'No payment provider: fee invoices are paid by recorded bank transfer.' : this.payments.name === 'simulated' ? 'Local payment simulator — no money moves.' : `Paystack (${this.env.PAYSTACK_MODE} mode).`,
        ),
        cap('maps', 'Maps', 'disabled', 'No embedded map in this release: list views, and exact pickup points (for authorised participants) open in OpenStreetMap.'),
        // No routing adapter ships in this release, whatever ROUTING_PROVIDER says: report what actually happens.
        cap('routing', 'Road routing', 'disabled', `Not implemented in this release. Distances are straight-line with a labelled ×${this.env.ROAD_DISTANCE_FACTOR} road estimate.`),
        cap('ai', 'Voice-to-draft assistant', this.env.AI_VOICE_DRAFTS_ENABLED ? 'configured' : 'disabled', this.env.AI_VOICE_DRAFTS_ENABLED ? 'Feature flag on; every extracted field must be reviewed.' : 'Off. The manual harvest form is the complete path.'),
        cap('demo', 'Demonstration mode', demoFeaturesAllowed(this.env) ? 'configured' : 'disabled', demoFeaturesAllowed(this.env) ? 'Demo logins and role switching are enabled in this environment.' : 'Off.'),
      ],
    };
  }

  /** Development mailbox: captured emails/SMS (including OTPs). Refused outside local/test environments. */
  @Get('dev/mailbox')
  devMailbox(@CurrentActor() _actor: Actor) {
    if (!devToolsAllowed(this.env)) throw new DomainError('NOT_FOUND', 'Not found');
    return { label: 'Development capture — these messages were NOT delivered to anyone.', messages: listCapturedMessages(100) };
  }
}
