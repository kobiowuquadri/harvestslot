import { ERROR_CODES, type ErrorCode } from '@harvestslot/contracts';

/** A business-rule failure with a stable code. The API maps it to `{ error: { code, message, details } }`. */
export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  get status(): number {
    return ERROR_CODES[this.code];
  }
}

export function fail(code: ErrorCode, message: string, details?: unknown): never {
  throw new DomainError(code, message, details);
}

export function assert(condition: unknown, code: ErrorCode, message: string, details?: unknown): asserts condition {
  if (!condition) throw new DomainError(code, message, details);
}

export function notFound(what: string): never {
  throw new DomainError('NOT_FOUND', `${what} was not found`);
}
