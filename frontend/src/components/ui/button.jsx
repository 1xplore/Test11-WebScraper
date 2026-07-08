import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0075de]/40 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-[#0075de] text-white hover:bg-[#0066c4]',
        secondary: 'bg-[#f6f5f4] text-slate-900 border border-[#e6e6e6] hover:bg-[#eeeceb]',
        ghost: 'hover:bg-[#f6f5f4] text-slate-700',
        outline: 'border border-[#e6e6e6] bg-white hover:bg-[#f6f5f4] text-slate-900',
        danger: 'bg-[#dc2626] text-white hover:bg-[#b91c1c]',
        success: 'bg-[#059669] text-white hover:bg-[#047857]',
        warning: 'bg-[#d97706] text-white hover:bg-[#b45309]',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        default: 'h-9 px-4',
        lg: 'h-10 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };