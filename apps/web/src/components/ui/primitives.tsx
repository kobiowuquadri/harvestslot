'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Dialog as DialogPrimitive, DropdownMenu as DM, Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ───────────── Card ─────────────
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]', className)} {...props} />;
}
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 border-b border-line px-4 py-3 sm:px-5', className)} {...props} />;
}
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-base font-semibold text-forest', className)} {...props} />;
}
export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted', className)} {...props} />;
}
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-4 sm:px-5', className)} {...props} />;
}
export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5', className)} {...props} />;
}

// ───────────── Badge ─────────────
export const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    tone: {
      success: 'bg-leaf-50 text-forest ring-1 ring-leaf-100',
      warning: 'bg-amber-50 text-amber-ink ring-1 ring-amber-100',
      danger: 'bg-danger-50 text-danger ring-1 ring-danger/20',
      info: 'bg-info-50 text-info ring-1 ring-info/20',
      neutral: 'bg-canvas text-muted ring-1 ring-line',
      accent: 'bg-amber text-amber-ink',
    },
  },
  defaultVariants: { tone: 'neutral' },
});
export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

// ───────────── Alert ─────────────
const alertIcons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };
export function Alert({ tone = 'info', title, children, className, action }: { tone?: keyof typeof alertIcons; title?: ReactNode; children?: ReactNode; className?: string; action?: ReactNode }) {
  const Icon = alertIcons[tone];
  const styles = {
    info: 'border-info/30 bg-info-50 text-info',
    success: 'border-leaf-100 bg-leaf-50 text-forest',
    warning: 'border-amber-100 bg-amber-50 text-amber-ink',
    danger: 'border-danger/30 bg-danger-50 text-danger',
  }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border p-3 text-sm', styles, className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="mt-0.5 text-ink/90">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

// ───────────── Dialog ─────────────
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export function DialogContent({ title, description, children, className, wide }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-forest-950/50" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <DialogPrimitive.Title className="text-lg font-semibold text-forest">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close className="rounded-md p-1 text-muted hover:bg-leaf-50" aria-label="Close">
            <X className="size-5" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

// ───────────── Dropdown ─────────────
export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export function DropdownMenuContent({ className, ...props }: ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content sideOffset={6} className={cn('z-50 min-w-48 rounded-lg border border-line bg-surface p-1 shadow-lg', className)} {...props} />
    </DM.Portal>
  );
}
export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof DM.Item>) {
  return <DM.Item className={cn('flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-leaf-50', className)} {...props} />;
}
export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DM.Label>) {
  return <DM.Label className={cn('px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted', className)} {...props} />;
}
export const DropdownMenuSeparator = () => <DM.Separator className="my-1 h-px bg-line" />;

// ───────────── Tabs ─────────────
export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('flex gap-1 overflow-x-auto border-b border-line', className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn('whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted data-[state=active]:border-forest data-[state=active]:text-forest', className)}
      {...props}
    />
  );
}
export const TabsContent = (props: ComponentProps<typeof TabsPrimitive.Content>) => <TabsPrimitive.Content className="pt-4 focus-visible:outline-none" {...props} />;

// ───────────── Misc ─────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-line/60', className)} aria-hidden />;
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cn('border-line', className)} />;
}

export function Table({ className, caption, children }: { className?: string; caption: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface" role="region" aria-label={caption} tabIndex={0}>
      <table className={cn('w-full min-w-[640px] text-left text-sm', className)}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
export const Th = ({ className, ...p }: HTMLAttributes<HTMLTableCellElement>) => <th scope="col" className={cn('border-b border-line bg-canvas px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted', className)} {...p} />;
export const Td = ({ className, ...p }: HTMLAttributes<HTMLTableCellElement>) => <td className={cn('border-b border-line px-3 py-2.5 align-top', className)} {...p} />;

export function DescriptionList({ items, className }: { items: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2', className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
