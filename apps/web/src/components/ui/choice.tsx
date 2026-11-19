'use client';

import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Choice<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
}

/** Large selectable cards for a short choice (a radio group underneath, so keyboard and screen readers work). */
export function ChoiceCards<T extends string>({
  name,
  legend,
  value,
  onChange,
  options,
  columns = 1,
  size = 'lg',
  error,
  hideLegend = false,
}: {
  name: string;
  legend: ReactNode;
  value: T | undefined | null;
  onChange: (v: T) => void;
  options: Array<Choice<T>>;
  columns?: 1 | 2 | 3;
  size?: 'lg' | 'sm';
  error?: string;
  hideLegend?: boolean;
}) {
  const errorId = useId();
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className={cn('mb-2 text-[15px] font-semibold text-ink', hideLegend && 'sr-only')}>{legend}</legend>
      <div className={cn('grid gap-3', columns === 2 && 'sm:grid-cols-2', columns === 3 && 'grid-cols-3')}>
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                'relative flex cursor-pointer items-start gap-3 rounded-2xl border bg-surface transition-[border-color,box-shadow,background-color] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-forest',
                size === 'lg' ? 'p-4' : 'items-center justify-center px-3 py-2.5 text-center',
                selected ? 'border-forest bg-leaf-50 shadow-[0_0_0_1px_var(--color-forest)]' : 'border-line hover:border-line-strong/60 hover:bg-canvas/50',
              )}
            >
              <input type="radio" name={name} value={o.value} checked={selected} onChange={() => onChange(o.value)} className="sr-only" />
              {o.icon && size === 'lg' ? (
                <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', selected ? 'bg-forest text-white' : 'bg-canvas text-forest ring-1 ring-line')} aria-hidden>
                  {o.icon}
                </span>
              ) : null}
              <span className={cn('min-w-0', size === 'lg' && 'flex-1')}>
                <span className={cn('block font-semibold text-ink', size === 'lg' ? 'text-[15px]' : 'text-sm')}>{o.label}</span>
                {o.description ? <span className="mt-0.5 block text-[13px] leading-snug text-muted">{o.description}</span> : null}
              </span>
              {size === 'lg' ? (
                <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border-2', selected ? 'border-forest bg-forest text-white' : 'border-line-strong')} aria-hidden>
                  {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * A searchable list of suggestions (WAI-ARIA combobox): type to filter, arrow keys to move, Enter to choose.
 * `value` is the chosen option; typing does not change it until an option is picked.
 */
export function SearchSelect({
  id,
  label,
  options,
  value,
  onChange,
  placeholder,
  hint,
  error,
  required,
}: {
  id: string;
  label: ReactNode;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `${id}-list`;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q && q !== value.toLowerCase() ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return list.slice(0, 8);
  }, [options, query, value]);
  const choose = (v: string) => {
    onChange(v);
    setQuery(v);
    setOpen(false);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, matches.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && open && matches[active]) {
              e.preventDefault();
              choose(matches[active]!);
            } else if (e.key === 'Escape') setOpen(false);
          }}
          className={cn(
            'h-12 w-full rounded-lg border bg-surface pl-10 pr-3.5 text-base text-ink shadow-[0_1px_2px_rgb(16_24_40/0.05)] placeholder:text-muted/70 hover:border-ink/60 focus-visible:border-forest',
            error ? 'border-danger' : 'border-line-strong',
          )}
        />
        {open && matches.length > 0 ? (
          <ul id={listId} role="listbox" aria-label={typeof label === 'string' ? label : 'Suggestions'} className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-raised)]">
            {matches.map((m, i) => (
              <li
                key={m}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={m === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(m);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn('flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm', i === active ? 'bg-leaf-100 text-forest-800' : 'text-ink')}
              >
                {m}
                {m === value ? <Check className="size-4" aria-hidden /> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
