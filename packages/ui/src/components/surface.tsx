import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export type SurfaceVariant = 'canvas' | 'subtle' | 'panel' | 'elevated';
export type SurfacePadding = 'none' | 'sm' | 'md' | 'lg';
export type SurfaceBorder = 'none' | 'hairline' | 'control' | 'strong';

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
  padding?: SurfacePadding;
  border?: SurfaceBorder;
  children?: ReactNode;
}

const variantMap: Record<SurfaceVariant, string> = {
  canvas: 'bg-canvas text-ink',
  subtle: 'bg-subtle text-ink',
  panel: 'bg-panel text-ink',
  elevated: 'bg-elevated text-ink shadow-[var(--shadow-raised)]',
};

const paddingMap: Record<SurfacePadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
};

const borderMap: Record<SurfaceBorder, string> = {
  none: 'border-0',
  hairline: 'border border-hairline',
  control: 'border border-control-border',
  strong: 'border border-strong-border',
};

export function Surface({
  variant = 'elevated',
  padding = 'md',
  border = 'hairline',
  className,
  children,
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-sm)]',
        variantMap[variant],
        paddingMap[padding],
        borderMap[border],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Divider({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn('border-0 border-t border-hairline', className)} {...props} />;
}
