import { z } from 'zod';

const bool = (defaultValue: boolean) =>
  z
    .enum(['true', 'false', '1', '0', 'yes', 'no'])
    .optional()
    .transform((v) => (v === undefined ? defaultValue : ['true', '1', 'yes'].includes(v)));

const int = (defaultValue: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce.number().int().min(min).max(max).default(defaultValue);

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()));

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

/** Values that must never reach production. Kept in one place so validation and docs agree. */
export const INSECURE_DEFAULT_MARKERS = ['change-me', 'changeme', 'dev-only', 'insecure', 'example-secret'];

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Deployment environment. Demo features are only allowed in `local`, `test` and `demo`. */
    APP_ENV: z.enum(['local', 'test', 'demo', 'staging', 'production']).default('local'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),
    ALLOWED_ORIGINS: csv,
    API_PORT: int(4000, 1, 65535),
    API_HOST: z.string().default('0.0.0.0'),
    TRUST_PROXY: bool(false),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_POOL_MAX: int(10, 1, 200),

    QUEUE_BACKEND: z.enum(['redis', 'postgres']).optional(),
    REDIS_URL: optionalString,

    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    DATA_ENCRYPTION_KEY: z
      .string()
      // 32 bytes in standard or URL-safe base64 (hosts such as Render generate either).
      .regex(/^[A-Za-z0-9+/_-]{43}=?$/, 'DATA_ENCRYPTION_KEY must be 32 bytes, base64 encoded'),
    SESSION_IDLE_TIMEOUT_MINUTES: int(720, 5, 60 * 24 * 7),
    SESSION_ABSOLUTE_TIMEOUT_DAYS: int(14, 1, 90),
    COOKIE_SECURE: bool(false),
    ADMIN_REQUIRE_MFA: bool(true),

    /** cloudinary (default) or s3 (any S3-compatible service) for production; filesystem for development only. */
    STORAGE_DRIVER: z.enum(['cloudinary', 's3', 'filesystem']).default('cloudinary'),
    /** cloudinary://<api_key>:<api_secret>@<cloud_name>, as shown in the Cloudinary console; or set the three values below. */
    CLOUDINARY_URL: optionalString,
    CLOUDINARY_CLOUD_NAME: optionalString,
    CLOUDINARY_API_KEY: optionalString,
    CLOUDINARY_API_SECRET: optionalString,
    /** Folder (public ID prefix) for HarvestSlot files in the Cloudinary account. */
    CLOUDINARY_FOLDER: z.string().default('harvestslot'),
    S3_ENDPOINT: optionalString,
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: z.string().default('harvestslot-private'),
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_FORCE_PATH_STYLE: bool(true),
    FILESYSTEM_STORAGE_DIR: z.string().default('.local/storage'),
    UPLOAD_MAX_BYTES: int(10 * 1024 * 1024, 1024, 50 * 1024 * 1024),
    CLAMAV_HOST: optionalString,
    CLAMAV_PORT: int(3310, 1, 65535),

    MAIL_TRANSPORT: z.enum(['smtp', 'dev-capture']).default('smtp'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: int(1025, 1, 65535),
    SMTP_SECURE: bool(false),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    MAIL_FROM: z.string().default('HarvestSlot <no-reply@harvestslot.example>'),
    /** True when SMTP points at a local capture tool such as Mailpit; demo accounts may then receive mail. */
    MAIL_LOCAL_CAPTURE: bool(false),

    SMS_PROVIDER: z.enum(['none', 'termii']).default('none'),
    TERMII_API_KEY: optionalString,
    TERMII_SENDER_ID: optionalString,
    TERMII_BASE_URL: z.url().default('https://api.ng.termii.com'),

    PAYMENT_PROVIDER: z.enum(['none', 'paystack', 'simulated']).default('none'),
    PAYSTACK_MODE: z.enum(['test', 'live']).default('test'),
    PAYSTACK_SECRET_KEY: optionalString,
    PAYSTACK_PUBLIC_KEY: optionalString,
    PAYSTACK_BASE_URL: z.url().default('https://api.paystack.co'),
    /** Simulator webhook signing secret (development only). */
    PAYMENT_SIMULATOR_SECRET: optionalString,

    MAP_STYLE_URL: optionalString,
    MAP_ATTRIBUTION: optionalString,
    ROUTING_PROVIDER: z.enum(['none', 'osrm']).default('none'),
    OSRM_BASE_URL: optionalString,
    /** Multiplier applied to straight-line distance to give a labelled, conservative road estimate. */
    ROAD_DISTANCE_FACTOR: z.coerce.number().min(1).max(3).default(1.4),

    AI_VOICE_DRAFTS_ENABLED: bool(false),
    TRANSCRIPTION_BASE_URL: optionalString,
    TRANSCRIPTION_API_KEY: optionalString,
    TRANSCRIPTION_MODEL: optionalString,
    ANTHROPIC_API_KEY: optionalString,
    ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),

    DEMO_MODE: bool(false),
    DEV_TOOLS_ENABLED: bool(false),

    OFFER_HOLD_HOURS: int(24, 1, 24 * 14),
    BOOKING_CONFIRMATION_HOLD_HOURS: int(72, 1, 24 * 14),
    TRANSPORT_BUFFER_MINUTES: int(120, 0, 24 * 60),
    HANDOVER_CODE_TTL_MINUTES: int(240, 5, 24 * 60),
    RECEIVING_REVIEW_HOURS: int(48, 1, 24 * 14),
    DISPUTE_RESPONSE_HOURS: int(72, 1, 24 * 30),
    PLATFORM_FEE_ENABLED: bool(true),
    PLATFORM_FEE_BPS: int(150, 0, 2000),
    IDEMPOTENCY_TTL_HOURS: int(48, 1, 24 * 30),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    const isProd = env.NODE_ENV === 'production' || env.APP_ENV === 'production';

    if (env.STORAGE_DRIVER === 'cloudinary' && !cloudinaryCredentials(env)) {
      issue('CLOUDINARY_URL', 'Cloudinary storage requires CLOUDINARY_URL, or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET');
    }
    if (env.STORAGE_DRIVER === 's3' && (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)) {
      issue('S3_ACCESS_KEY_ID', 'S3 storage requires S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY');
    }
    if (env.SMS_PROVIDER === 'termii' && (!env.TERMII_API_KEY || !env.TERMII_SENDER_ID)) {
      issue('TERMII_API_KEY', 'SMS_PROVIDER=termii requires TERMII_API_KEY and TERMII_SENDER_ID');
    }
    if (env.PAYMENT_PROVIDER === 'paystack') {
      if (!env.PAYSTACK_SECRET_KEY) issue('PAYSTACK_SECRET_KEY', 'PAYMENT_PROVIDER=paystack requires PAYSTACK_SECRET_KEY');
      else if (!env.PAYSTACK_SECRET_KEY.startsWith(`sk_${env.PAYSTACK_MODE}_`)) {
        issue('PAYSTACK_SECRET_KEY', `PAYSTACK_MODE=${env.PAYSTACK_MODE} requires a sk_${env.PAYSTACK_MODE}_ key`);
      }
    }
    if (env.PAYMENT_PROVIDER === 'simulated' && !env.PAYMENT_SIMULATOR_SECRET) {
      issue('PAYMENT_SIMULATOR_SECRET', 'PAYMENT_PROVIDER=simulated requires PAYMENT_SIMULATOR_SECRET');
    }
    if (env.ROUTING_PROVIDER === 'osrm' && !env.OSRM_BASE_URL) {
      issue('OSRM_BASE_URL', 'ROUTING_PROVIDER=osrm requires OSRM_BASE_URL');
    }
    if (env.AI_VOICE_DRAFTS_ENABLED && (!env.ANTHROPIC_API_KEY || !env.TRANSCRIPTION_BASE_URL || !env.TRANSCRIPTION_MODEL)) {
      issue('AI_VOICE_DRAFTS_ENABLED', 'Voice drafts need ANTHROPIC_API_KEY, TRANSCRIPTION_BASE_URL and TRANSCRIPTION_MODEL');
    }
    if (env.QUEUE_BACKEND === 'redis' && !env.REDIS_URL) {
      issue('REDIS_URL', 'QUEUE_BACKEND=redis requires REDIS_URL');
    }

    if (env.NODE_ENV === 'production' && !['staging', 'production', 'demo'].includes(env.APP_ENV)) {
      issue('APP_ENV', 'NODE_ENV=production requires APP_ENV=staging, demo or production');
    }

    if (!isProd) return;
    // Production safety rules: refuse to start rather than run with development shortcuts.
    const lower = (s: string) => s.toLowerCase();
    for (const key of ['SESSION_SECRET', 'DATA_ENCRYPTION_KEY'] as const) {
      if (INSECURE_DEFAULT_MARKERS.some((m) => lower(env[key]).includes(m))) {
        issue(key, `${key} looks like a development default`);
      }
    }
    if (!env.PUBLIC_BASE_URL.startsWith('https://')) issue('PUBLIC_BASE_URL', 'Production requires an https PUBLIC_BASE_URL');
    if (!env.COOKIE_SECURE) issue('COOKIE_SECURE', 'Production requires COOKIE_SECURE=true');
    if (!env.ADMIN_REQUIRE_MFA) issue('ADMIN_REQUIRE_MFA', 'Production requires ADMIN_REQUIRE_MFA=true');
    if (env.DEMO_MODE) issue('DEMO_MODE', 'Demo mode (demo logins, role switching) is not allowed in production');
    if (env.DEV_TOOLS_ENABLED) issue('DEV_TOOLS_ENABLED', 'Development mail/OTP tools are not allowed in production');
    if (env.STORAGE_DRIVER === 'filesystem') issue('STORAGE_DRIVER', 'Production requires Cloudinary or S3-compatible object storage');
    if (env.MAIL_TRANSPORT !== 'smtp') issue('MAIL_TRANSPORT', 'Production requires a real SMTP transport');
    if (env.MAIL_LOCAL_CAPTURE) issue('MAIL_LOCAL_CAPTURE', 'MAIL_LOCAL_CAPTURE must be false in production');
    if (env.PAYMENT_PROVIDER === 'simulated') issue('PAYMENT_PROVIDER', 'The payment simulator cannot run in production');
    if (env.ALLOWED_ORIGINS.some((o) => o.includes('localhost'))) issue('ALLOWED_ORIGINS', 'localhost origins are not allowed in production');
  });

export type Env = z.infer<typeof envSchema>;

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/** Cloudinary credentials from CLOUDINARY_URL or the three separate values; null when incomplete. */
export function cloudinaryCredentials(env: Pick<Env, 'CLOUDINARY_URL' | 'CLOUDINARY_CLOUD_NAME' | 'CLOUDINARY_API_KEY' | 'CLOUDINARY_API_SECRET'>): CloudinaryCredentials | null {
  if (env.CLOUDINARY_URL) {
    const m = /^cloudinary:\/\/([^:@\s]+):([^@\s]+)@([^/?\s]+)\/?$/.exec(env.CLOUDINARY_URL);
    return m ? { apiKey: decodeURIComponent(m[1]!), apiSecret: decodeURIComponent(m[2]!), cloudName: m[3]! } : null;
  }
  if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
    return { cloudName: env.CLOUDINARY_CLOUD_NAME, apiKey: env.CLOUDINARY_API_KEY, apiSecret: env.CLOUDINARY_API_SECRET };
  }
  return null;
}

export function isProduction(env: Pick<Env, 'NODE_ENV' | 'APP_ENV'>): boolean {
  return env.NODE_ENV === 'production' || env.APP_ENV === 'production';
}

/** Demo-only behaviour (seed data, demo role switching) is permitted only in these environments. */
export function demoFeaturesAllowed(env: Pick<Env, 'NODE_ENV' | 'APP_ENV' | 'DEMO_MODE'>): boolean {
  return env.DEMO_MODE && !isProduction(env) && ['local', 'test', 'demo'].includes(env.APP_ENV);
}

export function devToolsAllowed(env: Pick<Env, 'NODE_ENV' | 'APP_ENV' | 'DEV_TOOLS_ENABLED'>): boolean {
  return env.DEV_TOOLS_ENABLED && !isProduction(env) && ['local', 'test'].includes(env.APP_ENV);
}

export function effectiveQueueBackend(env: Pick<Env, 'QUEUE_BACKEND' | 'REDIS_URL'>): 'redis' | 'postgres' {
  return env.QUEUE_BACKEND ?? (env.REDIS_URL ? 'redis' : 'postgres');
}

export function allowedOrigins(env: Pick<Env, 'ALLOWED_ORIGINS' | 'PUBLIC_BASE_URL'>): string[] {
  const base = new URL(env.PUBLIC_BASE_URL).origin;
  return Array.from(new Set([base, ...env.ALLOWED_ORIGINS.map((o) => new URL(o).origin)]));
}
