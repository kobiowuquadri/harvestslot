import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@harvestslot/contracts';
import { DomainError } from '@harvestslot/core';
import { Prisma, sqlState, violatedConstraint } from '@harvestslot/db';
import type { AppRequest, AppResponse } from './http.js';

const CONSTRAINT_CODES: Record<string, { code: ErrorCode; message: string }> = {
  processing_slots_no_overlap: { code: 'SLOT_OVERLAP', message: 'This slot overlaps another slot on the same processing line' },
  trip_reservations_vehicle_no_overlap: { code: 'VEHICLE_CONFLICT', message: 'The vehicle already has a confirmed trip at that time' },
  trip_reservations_driver_no_overlap: { code: 'DRIVER_CONFLICT', message: 'The driver already has a confirmed trip at that time' },
  invoices_paid_range: { code: 'OVERPAYMENT', message: 'Confirmed payments cannot exceed the invoice total' },
  receiving_gross_ge_tare: { code: 'VALIDATION_FAILED', message: 'Gross weight must be at least the tare weight' },
  amendment_one_pending_per_booking: { code: 'DUPLICATE', message: 'Another change to this booking is already awaiting decisions' },
  trip_one_active_per_booking: { code: 'DUPLICATE', message: 'This booking already has an active transport assignment' },
  quote_one_open_per_transporter: { code: 'DUPLICATE', message: 'You already have an open quote for this booking' },
  delegation_one_active_per_pair: { code: 'DUPLICATE', message: 'An active delegation already exists; revoke it before recording a new one' },
};

function body(code: ErrorCode | string, message: string, requestId: string, details?: unknown) {
  return { error: { code, message, ...(details === undefined ? {} : { details }), requestId } };
}

/** Converts every error into the stable `{ error: { code, message, details, requestId } }` shape. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<AppRequest>();
    const res = ctx.getResponse<AppResponse>();
    const requestId = req?.requestId ?? 'unknown';
    if (res.headersSent) return;
    const send = (status: number, code: ErrorCode | string, message: string, details?: unknown) => {
      if (status === 429 && details && typeof details === 'object' && 'retryAfterSeconds' in details) {
        res.setHeader('Retry-After', String((details as { retryAfterSeconds: number }).retryAfterSeconds));
      }
      res.status(status).json(body(code, message, requestId, details));
    };

    if (exception instanceof DomainError) {
      send(exception.status, exception.code, exception.message, exception.details);
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const map: Record<number, ErrorCode> = {
        400: 'BAD_REQUEST',
        401: 'UNAUTHENTICATED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        413: 'PAYLOAD_TOO_LARGE',
        429: 'RATE_LIMITED',
      };
      const code = map[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
      const message = status >= 500 ? 'Something went wrong' : status === 404 ? 'Not found' : exception.message;
      send(status, code, message);
      return;
    }

    const state = sqlState(exception);
    const constraint = violatedConstraint(exception);
    if (constraint && CONSTRAINT_CODES[constraint]) {
      const mapped = CONSTRAINT_CODES[constraint]!;
      send(ERROR_CODES[mapped.code], mapped.code, mapped.message);
      return;
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') return send(409, 'DUPLICATE', 'A record with these details already exists');
      if (exception.code === 'P2025') return send(404, 'NOT_FOUND', 'Not found');
      if (exception.code === 'P2034') return send(409, 'VERSION_CONFLICT', 'Another update happened at the same time. Refresh and try again.');
    }
    if (state === '23505') return send(409, 'DUPLICATE', 'A record with these details already exists');
    if (state === '23514' || state === '23502') return send(422, 'VALIDATION_FAILED', 'A value is outside the allowed range', constraint ? { constraint } : undefined);
    if (state === '55000') return send(409, 'INVALID_STATE_TRANSITION', 'This record is part of the permanent history and cannot be changed');
    if (state === '40001' || state === '40P01') return send(409, 'VERSION_CONFLICT', 'Another update happened at the same time. Refresh and try again.');
    if (state === '23P01') return send(409, 'DUPLICATE', 'This would overlap an existing commitment');

    this.logger.error({ err: exception, requestId }, 'Unhandled error');
    send(500, 'INTERNAL_ERROR', 'Something went wrong. Quote the request ID if you contact support.');
  }
}
