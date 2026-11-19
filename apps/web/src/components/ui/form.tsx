import { cloneElement, isValidElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const fieldBase =
  'w-full rounded-lg border border-line-strong bg-surface px-3.5 text-base text-ink shadow-[0_1px_2px_rgb(16_24_40/0.05)] transition-[border-color,box-shadow] placeholder:text-muted/70 hover:border-ink/60 focus-visible:border-forest disabled:bg-canvas disabled:text-muted aria-[invalid=true]:border-danger';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, 'h-11', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, 'min-h-24 py-2', className)} {...props} />;
}

/** Native select: fully accessible and familiar on low-end Android phones. */
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, 'h-11 pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ htmlFor, children, className }: { htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('text-sm font-medium text-ink/90', className)}>
      {children}
    </label>
  );
}

/**
 * Label + control + hint + error with proper id wiring (aria-describedby / aria-invalid).
 * Pass a single control element as the child.
 */
export function Field({ label, hint, error, children, required, className }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactElement; required?: boolean; className?: string }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
        'aria-required': required || undefined,
      })
    : children;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-danger" aria-hidden> *</span> : null}
      </Label>
      {control}
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, description, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-3 py-1', className)}>
      <input id={id} type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--color-forest)]" {...props} />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        {description ? <span className="block text-muted">{description}</span> : null}
      </label>
    </div>
  );
}

export function RadioCards<T extends string>({
  name,
  value,
  onChange,
  options,
  legend,
}: {
  name: string;
  value: T | undefined;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode; description?: ReactNode }>;
  legend: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-xl border bg-surface p-3.5 transition-colors',
            value === o.value ? 'border-forest bg-leaf-50/60 ring-1 ring-forest' : 'border-line hover:border-line-strong/70',
          )}
        >
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-1 size-4 accent-[var(--color-forest)]" />
          <span className="text-sm">
            <span className="font-medium">{o.label}</span>
            {o.description ? <span className="block text-muted">{o.description}</span> : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
