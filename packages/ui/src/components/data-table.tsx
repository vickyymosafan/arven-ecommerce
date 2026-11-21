import type { ReactNode } from 'react';
import { cn } from '../lib/cn.js';
import { EmptyState, ErrorState, LoadingState } from './async-states.js';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  hideOnMobile?: boolean;
  headerClassName?: string;
  cellClassName?: string;
}

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T, index: number) => string;
  caption?: string;
  tableBreakpoint?: 'md' | 'lg' | 'xl';
  isLoading?: boolean;
  loadingLabel?: string;
  error?: string | null;
  errorRequestId?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  className?: string;
}

const TABLE_BREAKPOINT_CLASSES = {
  md: { table: 'md:block', cards: 'md:hidden' },
  lg: { table: 'lg:block', cards: 'lg:hidden' },
  xl: { table: 'xl:block', cards: 'xl:hidden' },
} as const;

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  caption,
  tableBreakpoint = 'md',
  isLoading = false,
  loadingLabel = 'Loading records',
  error,
  errorRequestId,
  onRetry,
  emptyTitle = 'No records found',
  emptyDescription = 'There are no items matching the current filters.',
  emptyAction,
  className,
}: DataTableProps<T>) {
  if (isLoading) {
    return <LoadingState label={loadingLabel} rows={4} className={className} />;
  }

  if (error) {
    return (
      <ErrorState
        message={error}
        requestId={errorRequestId}
        onRetry={onRetry}
        className={className}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        className={className}
      />
    );
  }

  const breakpointClasses = TABLE_BREAKPOINT_CLASSES[tableBreakpoint];

  return (
    <div className={cn('w-full', className)}>
      {/* Desktop semantic table */}
      <div
        className={cn(
          'hidden overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--table-border)] bg-[var(--table-row-bg)]',
          breakpointClasses.table,
        )}
      >
        <table className="w-full border-collapse text-left text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-[var(--table-border)] bg-[var(--table-header-bg)]">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-ink-secondary',
                    column.align === 'right' ? 'text-right' : 'text-left',
                    column.headerClassName,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--table-border)]">
            {rows.map((row, index) => (
              <tr
                key={getRowKey(row, index)}
                className="transition-colors duration-[var(--duration-fast)] hover:bg-[var(--table-row-hover-bg)]"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-4 py-3.5 align-top text-ink',
                      column.align === 'right' ? 'text-right' : 'text-left',
                      column.cellClassName,
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Responsive stacked card layout (zero horizontal overflow on narrow/sidebar viewports) */}
      <div className={cn('flex flex-col gap-3', breakpointClasses.cards)}>
        {rows.map((row, index) => (
          <article
            key={getRowKey(row, index)}
            className="rounded-[var(--radius-sm)] border border-[var(--table-border)] bg-elevated p-4"
          >
            <dl className="space-y-3">
              {columns
                .filter((col) => !col.hideOnMobile)
                .map((column) => (
                  <div
                    key={column.key}
                    className="flex flex-col gap-1 border-b border-hairline pb-2.5 last:border-b-0 last:pb-0"
                  >
                    <dt className="text-xs font-semibold uppercase tracking-[0.05em] text-ink-muted">
                      {column.header}
                    </dt>
                    <dd className="min-w-0 break-words text-sm text-ink">{column.render(row)}</dd>
                  </div>
                ))}
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
