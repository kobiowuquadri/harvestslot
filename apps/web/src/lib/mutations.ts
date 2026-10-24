'use client';

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useInsertionEffect, useRef } from 'react';
import { toast } from 'sonner';
import { ApiError, api, newIdempotencyKey, type RequestOptions } from './api';

interface ActionOptions<TVars, TResult> {
  /** Builds the request from the variables. */
  request: (vars: TVars) => { path: string; method?: RequestOptions['method']; body?: unknown; idempotent?: boolean };
  invalidate?: QueryKey[];
  success?: string | ((result: TResult) => string);
  onSuccess?: (result: TResult, vars: TVars) => void;
  /** Show errors as toasts (forms usually render them inline instead). */
  toastErrors?: boolean;
}

/**
 * Wraps a state-changing API call. Each user attempt gets one idempotency key that is reused if the
 * same attempt is retried after a network failure, and replaced once the attempt settles.
 */
export function useAction<TVars = void, TResult = unknown>(opts: ActionOptions<TVars, TResult>) {
  const qc = useQueryClient();
  const keyRef = useRef<string | null>(null);
  // React Query applies new options in a passive effect; keep the latest request builder (with the
  // current expectedVersion) in a ref updated at commit, so an early click never sends stale data.
  const optsRef = useRef(opts);
  useInsertionEffect(() => {
    optsRef.current = opts;
  });
  return useMutation<TResult, ApiError, TVars>({
    mutationFn: async (vars) => {
      const req = optsRef.current.request(vars);
      keyRef.current ??= newIdempotencyKey();
      return api<TResult>(req.path, { method: req.method ?? 'POST', body: req.body ?? {}, idempotencyKey: req.idempotent === false ? undefined : keyRef.current });
    },
    onSuccess: async (result, vars) => {
      keyRef.current = null;
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(result) : opts.success);
      await Promise.all((opts.invalidate ?? []).map((queryKey) => qc.invalidateQueries({ queryKey })));
      opts.onSuccess?.(result, vars);
    },
    onError: (error) => {
      // Keep the key only for transport failures, where the server may or may not have processed it.
      if (error.code !== 'NETWORK_ERROR') keyRef.current = null;
      if (opts.toastErrors !== false) toast.error(error.message);
    },
  });
}
