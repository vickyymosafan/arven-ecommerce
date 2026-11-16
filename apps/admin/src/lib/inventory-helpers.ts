import type { AdminManualMovementTypeInput, CreateAdminStockMovementRequest } from '@arven/contracts';
import { createAdminStockMovementSchema } from '@arven/validators';
import type { BadgeTone } from '@arven/ui';

export interface StockMovementDraftInput {
  warehouseCode: string;
  variantId: string;
  type: AdminManualMovementTypeInput;
  quantityDeltaRaw: string;
  reason: string;
}

export type StockMovementValidationResult =
  | {
      ok: true;
      data: CreateAdminStockMovementRequest;
    }
  | {
      ok: false;
      fieldErrors: Record<string, string>;
    };

export function movementTypeTone(type: string): BadgeTone {
  switch (type) {
    case 'RECEIPT':
    case 'RETURN_TO_STOCK':
      return 'success';
    case 'ADJUSTMENT':
      return 'warning';
    case 'RESERVATION':
      return 'info';
    case 'SALE':
    case 'RELEASE':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function reservationStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'ACTIVE':
      return 'info';
    case 'COMMITTED':
      return 'success';
    case 'RELEASED':
      return 'neutral';
    case 'EXPIRED':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function parseIntegerDelta(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^[+-]?\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed)) {
    return null;
  }
  return parsed;
}

export function computeProjectedOnHand(currentOnHand: number, rawDelta: string): number | null {
  const delta = parseIntegerDelta(rawDelta);
  if (delta === null) {
    return null;
  }
  return currentOnHand + delta;
}

export function validateStockMovementDraft(
  draft: StockMovementDraftInput,
): StockMovementValidationResult {
  const parsedDelta = parseIntegerDelta(draft.quantityDeltaRaw);
  if (parsedDelta === null) {
    return {
      ok: false,
      fieldErrors: {
        quantityDelta: 'Quantity delta must be a whole integer (for example 10 or -2).',
      },
    };
  }

  const trimmedReason = draft.reason.trim();
  const parsed = createAdminStockMovementSchema.safeParse({
    warehouseCode: draft.warehouseCode.trim() || 'JKT-MAIN-01',
    variantId: draft.variantId,
    type: draft.type,
    quantityDelta: parsedDelta,
    referenceType: 'MANUAL_ADMIN',
    reason: trimmedReason ? trimmedReason : null,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] ? String(issue.path[0]) : 'form';
      if (!fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, fieldErrors };
  }

  return { ok: true, data: parsed.data };
}
