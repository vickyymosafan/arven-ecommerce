'use client';

import { Badge } from './badge.js';
import { Button } from './button.js';
import { EmptyState } from './async-states.js';
import { Modal } from './modal.js';

export interface CatalogSizeGuideData {
  unit?: string;
  notes?: string;
  columns?: string[];
  rows?: Array<Record<string, string>>;
  [key: string]: unknown;
}

export interface SizeGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName?: string;
  categoryName?: string;
  sizeGuide: CatalogSizeGuideData | null | undefined;
}

export function SizeGuideModal({
  isOpen,
  onClose,
  productName,
  categoryName,
  sizeGuide,
}: SizeGuideModalProps) {
  const columns = Array.isArray(sizeGuide?.columns) ? sizeGuide.columns : [];
  const rows = Array.isArray(sizeGuide?.rows) ? sizeGuide.rows : [];
  const hasTable = columns.length > 0 && rows.length > 0;

  const title = categoryName
    ? `${categoryName} Size & Measurement Guide`
    : 'Size & Measurement Guide';

  const description = productName
    ? `Garment measurements and fit architecture for ${productName}.`
    : 'Studio garment measurements recorded flat in centimeters.';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      size="lg"
      closeLabel="Close size guide"
      footer={
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Close Guide
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge tone="info">Unit: {sizeGuide?.unit ?? 'cm'}</Badge>
          {sizeGuide?.notes ? (
            <p className="text-xs leading-relaxed text-ink-secondary">{sizeGuide.notes}</p>
          ) : null}
        </div>

        {hasTable ? (
          <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-hairline">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="border-b border-hairline bg-panel">
                  {columns.map((col, colIndex) => (
                    <th
                      key={col}
                      scope="col"
                      className={
                        colIndex === 0
                          ? 'sticky left-0 z-10 bg-panel px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-ink'
                          : 'px-4 py-3 text-xs font-semibold uppercase tracking-[0.06em] text-ink-secondary'
                      }
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline bg-canvas">
                {rows.map((row, rowIndex) => {
                  const firstColKey = columns[0] ?? 'Size';
                  const rowKey = row[firstColKey] ?? `row-${rowIndex}`;
                  return (
                    <tr key={rowKey} className="hover:bg-subtle">
                      {columns.map((col, colIndex) => {
                        const cellValue = row[col] ?? '-';
                        if (colIndex === 0) {
                          return (
                            <th
                              key={col}
                              scope="row"
                              className="sticky left-0 z-10 bg-panel px-4 py-3 font-mono text-xs font-semibold text-ink"
                            >
                              {cellValue}
                            </th>
                          );
                        }
                        return (
                          <td
                            key={col}
                            className="px-4 py-3 font-mono text-xs tabular-nums text-ink"
                          >
                            {cellValue}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Size guide not yet available"
            description="Detailed flat measurements have not been published for this category yet. Please contact ARVEN Client Services for tailored sizing assistance."
          />
        )}
      </div>
    </Modal>
  );
}
