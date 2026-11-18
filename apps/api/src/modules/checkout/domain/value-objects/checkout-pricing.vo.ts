import { CheckoutDomainError } from '../errors/checkout-domain.error.js';

export type CheckoutDiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';

export interface RequestedCheckoutItem {
  variantId: string;
  quantity: number;
  colorPresetId?: string;
}

export interface PricedCheckoutLineInput {
  variantId: string;
  unitPriceIdr: number;
  quantity: number;
  weightGrams: number;
}

export interface AllocatedCheckoutLine {
  variantId: string;
  unitPriceIdr: number;
  quantity: number;
  weightGrams: number;
  lineGrossIdr: number;
  discountAllocatedIdr: number;
  lineTotalIdr: number;
}

export interface CouponPolicySnapshot {
  id: string;
  code: string;
  name: string;
  discountType: CheckoutDiscountType;
  discountValue: number;
  maxDiscountIdr: number | null;
  minOrderSubtotalIdr: number;
  usageLimitTotal: number | null;
  usageLimitPerUser: number | null;
  usedCount: number;
  status: string;
  startsAt: Date;
  endsAt: Date;
}

export interface CouponComputationResult {
  discountTotalIdr: number;
  shippingDiscountIdr: number;
  discountAppliedIdr: number;
}

export function aggregateRequestedItems(
  items: ReadonlyArray<RequestedCheckoutItem>,
  maxLineItems: number,
): RequestedCheckoutItem[] {
  const byVariant = new Map<string, RequestedCheckoutItem>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new CheckoutDomainError(
        400,
        'VALIDATION_ERROR',
        'Item quantity must be a positive integer',
        [{ field: 'items.quantity', issue: `Invalid quantity for variant ${item.variantId}` }],
      );
    }

    const existing = byVariant.get(item.variantId);
    if (!existing) {
      byVariant.set(item.variantId, {
        variantId: item.variantId,
        quantity: item.quantity,
        colorPresetId: item.colorPresetId,
      });
    } else {
      const mergedQuantity = existing.quantity + item.quantity;
      if (mergedQuantity > 99) {
        throw new CheckoutDomainError(
          400,
          'VALIDATION_ERROR',
          'Merged quantity for variant exceeds maximum of 99',
          [{ field: 'items.quantity', issue: `Merged quantity exceeded 99 for variant ${item.variantId}` }],
        );
      }
      byVariant.set(item.variantId, {
        variantId: item.variantId,
        quantity: mergedQuantity,
        colorPresetId: existing.colorPresetId ?? item.colorPresetId,
      });
    }
  }

  const aggregated = Array.from(byVariant.values());
  if (aggregated.length === 0 || aggregated.length > maxLineItems) {
    throw new CheckoutDomainError(
      400,
      'VALIDATION_ERROR',
      `Checkout must contain between 1 and ${maxLineItems} distinct items`,
    );
  }
  return aggregated;
}

export function computeCouponDiscount(params: {
  coupon: CouponPolicySnapshot;
  subtotalIdr: number;
  shippingCostIdr: number;
  userRedemptionCount: number;
  now: Date;
}): CouponComputationResult {
  const { coupon, subtotalIdr, shippingCostIdr, userRedemptionCount, now } = params;

  if (coupon.status !== 'ACTIVE') {
    throw new CheckoutDomainError(400, 'COUPON_NOT_ACTIVE', 'Coupon is not active');
  }

  if (now.getTime() < coupon.startsAt.getTime() || now.getTime() > coupon.endsAt.getTime()) {
    throw new CheckoutDomainError(
      400,
      'COUPON_EXPIRED',
      'Coupon is outside its valid redemption window',
    );
  }

  if (subtotalIdr < coupon.minOrderSubtotalIdr) {
    throw new CheckoutDomainError(
      400,
      'COUPON_MIN_SUBTOTAL_NOT_MET',
      `Order subtotal must be at least IDR ${coupon.minOrderSubtotalIdr} to apply this coupon`,
      [{ field: 'couponCode', issue: `Minimum subtotal IDR ${coupon.minOrderSubtotalIdr} required` }],
    );
  }

  if (coupon.usageLimitTotal !== null && coupon.usedCount >= coupon.usageLimitTotal) {
    throw new CheckoutDomainError(
      409,
      'COUPON_USAGE_LIMIT_REACHED',
      'Coupon total redemption limit has been reached',
    );
  }

  if (coupon.usageLimitPerUser !== null && userRedemptionCount >= coupon.usageLimitPerUser) {
    throw new CheckoutDomainError(
      409,
      'COUPON_USER_LIMIT_REACHED',
      'Coupon per-user redemption limit has been reached',
    );
  }

  if (coupon.discountType === 'FREE_SHIPPING') {
    return {
      discountTotalIdr: 0,
      shippingDiscountIdr: shippingCostIdr,
      discountAppliedIdr: shippingCostIdr,
    };
  }

  let rawDiscount = 0;
  if (coupon.discountType === 'PERCENTAGE') {
    rawDiscount = Math.floor((subtotalIdr * coupon.discountValue + 50) / 100);
  } else {
    rawDiscount = coupon.discountValue;
  }

  if (coupon.maxDiscountIdr !== null) {
    rawDiscount = Math.min(rawDiscount, coupon.maxDiscountIdr);
  }

  const clampedDiscount = Math.max(0, Math.min(rawDiscount, subtotalIdr));
  return {
    discountTotalIdr: clampedDiscount,
    shippingDiscountIdr: 0,
    discountAppliedIdr: clampedDiscount,
  };
}

export function allocateLineDiscounts(
  lines: ReadonlyArray<PricedCheckoutLineInput>,
  discountTotalIdr: number,
): AllocatedCheckoutLine[] {
  const grossLines = lines.map((line, index) => ({
    ...line,
    index,
    lineGrossIdr: line.unitPriceIdr * line.quantity,
  }));

  const subtotalIdr = grossLines.reduce((acc, line) => acc + line.lineGrossIdr, 0);
  if (discountTotalIdr < 0 || discountTotalIdr > subtotalIdr) {
    throw new CheckoutDomainError(
      400,
      'INVALID_DISCOUNT_AMOUNT',
      'Discount total cannot exceed order subtotal',
    );
  }

  if (discountTotalIdr === 0 || subtotalIdr === 0) {
    return grossLines.map((line) => ({
      variantId: line.variantId,
      unitPriceIdr: line.unitPriceIdr,
      quantity: line.quantity,
      weightGrams: line.weightGrams,
      lineGrossIdr: line.lineGrossIdr,
      discountAllocatedIdr: 0,
      lineTotalIdr: line.lineGrossIdr,
    }));
  }

  const shares = grossLines.map((line) => {
    const numerator = line.lineGrossIdr * discountTotalIdr;
    const base = Math.min(line.lineGrossIdr, Math.floor(numerator / subtotalIdr));
    const remainderNumerator = numerator - base * subtotalIdr;
    return {
      index: line.index,
      base,
      remainderNumerator,
      lineGrossIdr: line.lineGrossIdr,
    };
  });

  let remaining = discountTotalIdr - shares.reduce((acc, item) => acc + item.base, 0);
  const byRemainderDesc = [...shares].sort((a, b) => {
    if (b.remainderNumerator !== a.remainderNumerator) {
      return b.remainderNumerator - a.remainderNumerator;
    }
    return a.index - b.index;
  });

  let cursor = 0;
  while (remaining > 0 && byRemainderDesc.length > 0) {
    const target = byRemainderDesc[cursor % byRemainderDesc.length]!;
    if (target.base < target.lineGrossIdr) {
      target.base += 1;
      remaining -= 1;
    }
    cursor += 1;
    if (cursor > byRemainderDesc.length * 4 && remaining > 0) {
      break;
    }
  }

  const allocatedByIndex = new Map<number, number>(shares.map((s) => [s.index, s.base]));

  return grossLines.map((line) => {
    const discountAllocatedIdr = allocatedByIndex.get(line.index) ?? 0;
    return {
      variantId: line.variantId,
      unitPriceIdr: line.unitPriceIdr,
      quantity: line.quantity,
      weightGrams: line.weightGrams,
      lineGrossIdr: line.lineGrossIdr,
      discountAllocatedIdr,
      lineTotalIdr: line.lineGrossIdr - discountAllocatedIdr,
    };
  });
}

export function buildOrderNumber(now: Date, randomHex: string): string {
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const suffix = randomHex.slice(0, 6).toUpperCase();
  return `ARV-${yyyy}${mm}${dd}-${suffix}`;
}
