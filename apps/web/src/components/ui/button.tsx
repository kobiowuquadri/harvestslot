import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-forest text-white shadow-[0_1px_2px_rgb(16_24_40/0.08),inset_0_-1px_0_rgb(0_0_0/0.08)] hover:bg-forest-800',
        secondary: 'bg-leaf-50 text-forest hover:bg-leaf-100 hover:text-forest-800',
        outline: 'border border-line bg-surface text-ink shadow-[0_1px_2px_rgb(16_24_40/0.05)] hover:border-line-strong/60 hover:bg-canvas',
        ghost: 'text-ink hover:bg-ink/5',
        danger: 'bg-danger text-white shadow-[0_1px_2px_rgb(16_24_40/0.08)] hover:opacity-90',
        accent: 'bg-amber text-amber-ink hover:bg-amber-100',
        link: 'px-0 text-leaf underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-3 text-[13px]',
        md: 'h-11 px-4 text-sm',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({ className, variant, size, asChild, loading, children, disabled, ...props }: ButtonProps) {
  // Slot needs exactly one child, so links rendered asChild never get the spinner.
  if (asChild) {
    return (
      <Slot.Root className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
