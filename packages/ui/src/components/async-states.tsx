import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { Button } from './button.js';
import { IconAlertOctagon, IconRefresh } from './icons.js';

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-start justify-center gap-3 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-6 sm:p-8',
        className,
      )}
    >
      <div className="space-y-1.5 max-w-[var(--container-prose)]">
        <h3 className="font-display text-xl font-normal text-ink">{title}</h3>
        <p className="text-sm leading-relaxed text-ink-muted">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export interface LoadingStateProps {
  label?: string;
  rows?: number;
  className?: string;
}

export function LoadingState({
  label = 'Loading data',
  rows = 3,
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        'space-y-3 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-6',
        className,
      )}
    >
      <div className="flex items-center gap-2.5 text-sm font-medium text-ink">
        <span
          aria-hidden="true"
          className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-ink border-t-transparent motion-safe:animate-spin"
        />
        <span>{label}</span>
      </div>
      <div className="space-y-2.5 pt-1">
        {Array.from({ length: Math.max(1, rows) }).map((_, index) => (
          <div
            key={index}
            className="h-10 w-full rounded-[var(--radius-xs)] border border-hairline bg-panel motion-safe:animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  message: string;
  requestId?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = 'Unable to load this section',
  message,
  requestId,
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-4 rounded-[var(--radius-sm)] border border-danger-fg/40 bg-danger-bg p-6',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 shrink-0 text-danger-fg">
          <IconAlertOctagon size={20} />
        </span>
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <p className="text-sm leading-relaxed text-ink">{message}</p>
          {requestId ? (
            <p className="font-mono text-xs text-ink-muted">
              Request ID: <span className="text-ink select-all">{requestId}</span>
            </p>
          ) : null}
        </div>
      </div>
      {onRetry ? (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          <IconRefresh size={16} />
          <span>{retryLabel}</span>
        </Button>
      ) : null}
    </div>
  );
}
