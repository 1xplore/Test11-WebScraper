import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[#0075de]/10 text-[#0075de]',
        secondary: 'border-transparent bg-[#f6f5f4] text-slate-700',
        success: 'border-transparent bg-[#d1fae5] text-[#065f46]',
        warning: 'border-transparent bg-[#fef3c7] text-[#92400e]',
        danger: 'border-transparent bg-[#fee2e2] text-[#991b1b]',
        outline: 'border-[#e6e6e6] text-slate-700',
        info: 'border-transparent bg-[#dbeafe] text-[#1e40af]',
        muted: 'border-transparent bg-slate-100 text-slate-600',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };