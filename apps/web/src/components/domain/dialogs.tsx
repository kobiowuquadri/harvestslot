'use client';

import type { QueryKey } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { Alert, Dialog, DialogContent, DialogTrigger } from '@/components/ui/primitives';
import { useAction } from '@/lib/mutations';

/**
 * A consequential action that needs a written reason (cancel, decline, withdraw, revoke…).
 * The button only reports success after the server confirms it.
 */
export function ReasonActionDialog<TResult = unknown>({
  trigger,
  title,
  description,
  confirmLabel,
  path,
  body,
  invalidate,
  success,
  onDone,
  tone = 'danger',
  reasonLabel = 'Reason',
  reasonOptional = false,
  triggerVariant = 'outline',
  triggerSize = 'md',
  bodyKey = 'reason',
  minLength = 5,
  children,
}: {
  trigger: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  path: string;
  body?: Record<string, unknown>;
  invalidate?: QueryKey[];
  success: string;
  onDone?: (result: TResult) => void;
  tone?: 'danger' | 'primary';
  reasonLabel?: string;
  reasonOptional?: boolean;
  triggerVariant?: ButtonProps['variant'];
  triggerSize?: ButtonProps['size'];
  /** Body field that carries the text (most endpoints use `reason`). */
  bodyKey?: string;
  minLength?: number;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const action = useAction<void, TResult>({
    request: () => ({ path, body: { ...body, ...(reason.trim() ? { [bodyKey]: reason.trim() } : {}) } }),
    invalidate,
    success,
    toastErrors: false,
    onSuccess: (r) => {
      setOpen(false);
      setReason('');
      onDone?.(r);
    },
  });
  const tooShort = !reasonOptional && reason.trim().length < minLength;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate();
          }}
        >
          {children}
          {action.error ? <Alert tone="danger">{action.error.message}</Alert> : null}
          <Field label={reasonLabel} hint={reasonOptional ? 'Optional.' : `At least ${minLength} characters. Shared with the other parties and kept in the record.`} required={!reasonOptional}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Keep as is
            </Button>
            <Button type="submit" variant={tone === 'danger' ? 'danger' : 'primary'} loading={action.isPending} disabled={tooShort}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A simple confirmation for a non-destructive but binding action. */
export function ConfirmActionButton<TResult = unknown>({
  label,
  path,
  body,
  invalidate,
  success,
  onDone,
  variant = 'primary',
  size = 'md',
  disabled,
  className,
}: {
  label: ReactNode;
  path: string;
  body?: Record<string, unknown>;
  invalidate?: QueryKey[];
  success: string;
  onDone?: (result: TResult) => void;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  disabled?: boolean;
  className?: string;
}) {
  const action = useAction<void, TResult>({ request: () => ({ path, body }), invalidate, success, onSuccess: (r) => onDone?.(r) });
  return (
    <Button variant={variant} size={size} loading={action.isPending} disabled={disabled} onClick={() => action.mutate()} className={className}>
      {label}
    </Button>
  );
}
