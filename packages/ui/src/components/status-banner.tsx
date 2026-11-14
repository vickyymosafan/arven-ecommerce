import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconCheckCircle,
  IconClose,
  IconInfo,
} from './icons.js';

export type StatusTone = 'info' | 'success' | 'warning' | 'danger';

export interface StatusBannerProps {
  tone?: StatusTone;
  title?: string;
  description: string;
  requestId?: string | null;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const toneClasses: Record<StatusTone, string> = {
  info: 'bg-info-bg text-info-fg border-info-fg/40',
  success: 'bg-success-bg text-success-fg border-success-fg/40',
  warning: 'bg-warning-bg text-warning-fg border-warning-fg/40',
  danger: 'bg-danger-bg text-danger-fg border-danger-fg/40',
};

function renderToneIcon(tone: StatusTone) {
  switch (tone) {
    case 'success':
      return <IconCheckCircle size={18} />;
    case 'warning':
      return <IconAlertTriangle size={18} />;
    case 'danger':
      return <IconAlertOctagon size={18} />;
    case 'info':
    default:
      return <IconInfo size={18} />;
  }
}

export function StatusBanner({
  tone = 'info',
  title,
  description,
  requestId,
  action,
  onDismiss,
  className,
}: StatusBannerProps) {
  const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status';

  return (
    <div
      role={role}
      className={cn(
        'flex flex-col gap-3 rounded-[var(--radius-sm)] border p-4 sm:flex-row sm:items-start sm:justify-between',
        toneClasses[tone],
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 shrink-0">{renderToneIcon(tone)}</span>
        <div className="min-w-0 space-y-1">
          {title ? <p className="text-sm font-semibold text-ink">{title}</p> : null}
          <p className="text-sm leading-relaxed text-ink">{description}</p>
          {requestId ? (
            <p className="font-mono text-xs text-ink-muted">
              Request ID: <span className="text-ink select-all">{requestId}</span>
            </p>
          ) : null}
        </div>
      </div>

      {(action || onDismiss) ? (
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-start">
          {action}
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss notification"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] border border-transparent text-ink hover:border-control-border hover:bg-panel cursor-pointer"
            >
              <IconClose size={16} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type AlertBannerProps = StatusBannerProps;
export const AlertBanner = StatusBanner;
