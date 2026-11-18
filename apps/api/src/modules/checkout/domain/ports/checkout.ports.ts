import type { CouponPolicySnapshot } from '../value-objects/checkout-pricing.vo.js';

export interface CheckoutResolvedAddress {
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  subdistrict: string | null;
  city: string;
  province: string;
  postalCode: string;
  countryCode: string;
}

export interface CheckoutVariantSnapshot {
  variantId: string;
  sku: string;
  productId: string;
  productSlug: string;
  productName: string;
  size: string;
  color: string;
  unitPriceIdr: number;
  weightGrams: number;
  availableQuantity: number;
  primaryImageUrl: string | null;
}

export interface CheckoutWarehouseInfo {
  id: string;
  code: string;
}

export interface CheckoutCatalogAndInventorySnapshot {
  warehouse: CheckoutWarehouseInfo;
  variantsById: ReadonlyMap<string, CheckoutVariantSnapshot>;
}

export interface CheckoutCouponLookupResult {
  coupon: CouponPolicySnapshot;
  userRedemptionCount: number;
}
