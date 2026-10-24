'use client';

import type { ErrorCode } from '@harvestslot/contracts';

/** A failed API call, carrying the server's stable error code and field details. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'NETWORK_ERROR' | string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level validation messages keyed by dotted path. */
  get fieldErrors(): Record<string, string> {
    if (this.code !== 'VALIDATION_FAILED' || !Array.isArray(this.details)) return {};
    return Object.fromEntries((this.details as Array<{ path: string; message: string }>).map((d) => [d.path, d.message]));
  }
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

async function ensureCsrf(force = false): Promise<string | undefined> {
  if (!force) {
    const existing = readCookie('hs_csrf');
    if (existing) return existing;
  }
  await fetch('/api/v1/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
  return readCookie('hs_csrf');
}

export function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** true → a fresh key; string → a caller-held key (e.g. reused across retries of one action). */
  idempotencyKey?: boolean | string;
  signal?: AbortSignal;
}

/**
 * Same-origin JSON API call. The session lives in an HttpOnly cookie (never readable here); state-
 * changing requests send the CSRF token from the readable hs_csrf cookie.
 */
export async function api<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    const token = await ensureCsrf();
    if (token) headers['X-CSRF-Token'] = token;
  }
  if (options.idempotencyKey) headers['Idempotency-Key'] = typeof options.idempotencyKey === 'string' ? options.idempotencyKey : newIdempotencyKey();
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'You appear to be offline or the server is unreachable. Nothing was saved.');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; details?: unknown; requestId?: string } } | undefined)?.error;
    // The CSRF cookie rotates at sign-in/out; refresh it once and retry.
    if (err?.code === 'CSRF_FAILED' && !retried && method !== 'GET') {
      await ensureCsrf(true);
      return api<T>(path, options, true);
    }
    throw new ApiError(res.status, err?.code ?? 'INTERNAL_ERROR', err?.message ?? `Request failed (${res.status})`, err?.details, err?.requestId);
  }
  return json as T;
}

export const get = <T>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const post = <T>(path: string, body?: unknown, idempotencyKey?: boolean | string) => api<T>(path, { method: 'POST', body: body ?? {}, idempotencyKey });
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

export async function uploadFile<T>(file: File, fields: Record<string, string | undefined>): Promise<T> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v) form.append(k, v);
  form.append('file', file);
  return api<T>('/uploads', { method: 'POST', body: form });
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}
