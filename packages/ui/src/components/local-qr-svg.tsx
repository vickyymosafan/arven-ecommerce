'use client';

import { useMemo } from 'react';
import QRCode from 'qrcode';
import { cn } from '../lib/cn.js';

export interface LocalQrSvgProps {
  value: string;
  size?: number;
  label?: string;
  quietZoneModules?: number;
  className?: string;
}

interface QrMatrixResult {
  totalModules: number;
  quietZone: number;
  darkCells: Array<{ row: number; col: number }>;
}

function buildQrCells(value: string, quietZone: number): QrMatrixResult {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const darkCells: Array<{ row: number; col: number }> = [];

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (qr.modules.get(row, col)) {
        darkCells.push({ row, col });
      }
    }
  }

  return {
    totalModules: size + quietZone * 2,
    quietZone,
    darkCells,
  };
}

/**
 * Pure local SVG QR renderer using `qrcode` matrix modules rendered as JSX `<rect>` elements.
 * Makes zero external network requests and avoids HTML string injection.
 */
export function LocalQrSvg({
  value,
  size = 192,
  label = 'Authenticator QR code',
  quietZoneModules = 4,
  className,
}: LocalQrSvgProps) {
  const matrix = useMemo(() => {
    if (!value.trim()) {
      return null;
    }
    return buildQrCells(value, quietZoneModules);
  }, [value, quietZoneModules]);

  if (!matrix) {
    return null;
  }

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-control-border bg-[var(--color-white)] p-2',
        className,
      )}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${matrix.totalModules} ${matrix.totalModules}`}
        role="img"
        aria-label={label}
        shapeRendering="crispEdges"
      >
        <rect
          x={0}
          y={0}
          width={matrix.totalModules}
          height={matrix.totalModules}
          fill="#FFFFFF"
        />
        {matrix.darkCells.map((cell) => (
          <rect
            key={`${cell.row}-${cell.col}`}
            x={cell.col + matrix.quietZone}
            y={cell.row + matrix.quietZone}
            width={1}
            height={1}
            fill="#17191B"
          />
        ))}
      </svg>
    </div>
  );
}
