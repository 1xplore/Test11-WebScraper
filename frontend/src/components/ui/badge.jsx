import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors leading-none whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-accent-soft text-accent',
        secondary: 'border-transparent bg-surface-sunken text-ink',
        success: 'border-transparent bg-success-soft text-success-fg',
        warning: 'border-transparent bg-warning-soft text-warning-fg',
        danger: 'border-transparent bg-danger-soft text-danger-fg',
        outline: 'border-rule text-ink',
        info: 'border-transparent bg-info-soft text-info',
        muted: 'border-transparent bg-surface-sunken text-ink-muted',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };