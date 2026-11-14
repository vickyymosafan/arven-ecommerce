import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: ReactNode;
  children?: ReactNode;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-panel text-ink border-control-border',
  info: 'bg-info-bg text-info-fg border-info-fg/35',
  success: 'bg-success-bg text-success-fg border-success-fg/35',
  warning: 'bg-warning-bg text-warning-fg border-warning-fg/35',
  danger: 'bg-danger-bg text-danger-fg border-danger-fg/35',
};

export function Badge({ tone = 'neutral', icon, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] border px-2.5 py-1',
        'text-xs font-medium uppercase tracking-[0.06em] leading-none',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}

export type StatusChipProps = BadgeProps;
export const StatusChip = Badge;
