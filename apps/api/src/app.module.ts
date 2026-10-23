import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { loadConfig } from '@harvestslot/config';
import { CommonModule } from './common/common.module.js';
import { AllExceptionsFilter } from './common/errors.filter.js';
import { CsrfGuard, RateLimitGuard, RequestIdMiddleware, SessionGuard } from './common/guards.js';
import { IdempotencyInterceptor, NoStoreInterceptor } from './common/interceptors.js';
import type { AppRequest } from './common/http.js';
import { FEATURE_MODULES } from './modules/index.js';

const env = loadConfig();

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.LOG_LEVEL,
        genReqId: (req) => (req as AppRequest).requestId,
        // Secrets never reach the logs.
        redact: {
          paths: [
            'req.headers.cookie',
            'req.headers.authorization',
            'req.headers["x-csrf-token"]',
            'req.headers["x-paystack-signature"]',
            'res.headers["set-cookie"]',
            '*.password',
            '*.newPassword',
            '*.currentPassword',
            '*.token',
            '*.code',
            '*.otp',
          ],
          censor: '[redacted]',
        },
        serializers: {
          req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url.replace(/token=[^&]+/g, 'token=[redacted]') }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
        customProps: (req) => ({ userId: (req as AppRequest).actor?.userId }),
        autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/api/v1/health') },
        transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } } : undefined,
      },
    }),
    CommonModule,
    ...FEATURE_MODULES,
  ],
  providers: [
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
