import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { allowedOrigins, loadConfig } from '@harvestslot/config';
import { ERROR_CODES } from '@harvestslot/contracts';
import { AppModule } from './app.module.js';
import { jsonReplacer } from './common/interceptors.js';

export const API_PREFIX = 'api/v1';

export function buildOpenApi(app: NestExpressApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('HarvestSlot API')
    .setDescription(
      [
        'Authoritative REST API for HarvestSlot. Browser sessions use an HttpOnly `hs_session` cookie.',
        'State-changing requests must send `X-CSRF-Token` equal to the `hs_csrf` cookie (call `GET /auth/csrf` first).',
        'Consequential operations require an `Idempotency-Key` header. Errors use `{ error: { code, message, details, requestId } }`.',
        `Stable error codes: ${Object.entries(ERROR_CODES).map(([c, s]) => `${c} (${s})`).join(', ')}.`,
        'Quantities are decimal strings in kilograms (3 dp); money is integer kobo; timestamps are UTC ISO-8601.',
      ].join('\n\n'),
    )
    .setVersion('1.0.0')
    .addCookieAuth('hs_session')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-CSRF-Token' }, 'csrf')
    .build();
  return SwaggerModule.createDocument(app, config);
}

export async function createApp(options: { logger?: boolean } = {}): Promise<NestExpressApplication> {
  const env = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bufferLogs: options.logger !== false, logger: options.logger === false ? false : undefined });
  if (options.logger !== false) app.useLogger(app.get(Logger));
  app.set('trust proxy', env.TRUST_PROXY ? 1 : false);
  app.set('json replacer', jsonReplacer);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          // Swagger UI needs its own assets; everything else is JSON.
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          upgradeInsecureRequests: env.COOKIE_SECURE ? [] : null,
        },
      },
      strictTransportSecurity: env.COOKIE_SECURE ? { maxAge: 31_536_000, includeSubDomains: true } : false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(cookieParser());
  app.enableCors({ origin: allowedOrigins(env), credentials: true, allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key', 'X-Request-Id'] });
  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix(API_PREFIX);
  SwaggerModule.setup('api/docs', app, buildOpenApi(app), { jsonDocumentUrl: 'api/docs/openapi.json' });
  app.enableShutdownHooks();
  return app;
}
