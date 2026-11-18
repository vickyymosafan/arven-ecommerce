import { Injectable } from '@nestjs/common';
import type {
  AppliedCouponDto,
  CheckoutQuoteDto,
  CheckoutQuoteItemDto,
  ShippingRateOptionDto,
} from '@arven/contracts';
import type { DiscountTypeInput } from '@arven/validators';
import type { ShippingRateOption } from '../../../../shared/adapters/shipping.provider.js';
import type {
  CheckoutVariantSnapshot,
  CheckoutWarehouseInfo,
} from '../../domain/ports/checkout.ports.js';
import type {
  AllocatedCheckoutLine,
  CouponPolicySnapshot,
} from '../../domain/value-objects/checkout-pricing.vo.js';

@Injectable()
export class CheckoutMapper {
  toShippingRateOptionDto(rate: ShippingRateOption): ShippingRateOptionDto {
    return {
      provider: rate.provider,
      serviceCode: rate.serviceCode,
      serviceName: rate.serviceName,
      costIdr: rate.costIdr,
      estimatedMinDays: rate.estimatedMinDays,
      estimatedMaxDays: rate.estimatedMaxDays,
    };
  }

  toCheckoutQuoteDto(params: {
    warehouse: CheckoutWarehouseInfo;
    totalWeightGrams: number;
    allocatedLines: ReadonlyArray<AllocatedCheckoutLine>;
    variantsById: ReadonlyMap<string, CheckoutVariantSnapshot>;
    shippingOptions: ReadonlyArray<ShippingRateOption>;
    selectedShipping: ShippingRateOption;
    subtotalIdr: number;
    discountTotalIdr: number;
    shippingTotalIdr: number;
    taxTotalIdr: number;
    grandTotalIdr: number;
    coupon: CouponPolicySnapshot | null;
    couponDiscountAppliedIdr: number;
    quoteExpiresAt: Date;
  }): CheckoutQuoteDto {
    const items: CheckoutQuoteItemDto[] = params.allocatedLines.map((line) => {
      const variant = params.variantsById.get(line.variantId)!;
      return {
        variantId: variant.variantId,
        sku: variant.sku,
        productId: variant.productId,
        productSlug: variant.productSlug,
        productName: variant.productName,
        size: variant.size,
        color: variant.color,
        unitPriceIdr: line.unitPriceIdr,
        quantity: line.quantity,
        discountAllocatedIdr: line.discountAllocatedIdr,
        lineTotalIdr: line.lineTotalIdr,
        availableQuantity: variant.availableQuantity,
        primaryImageUrl: variant.primaryImageUrl,
      };
    });

    const appliedCoupon: AppliedCouponDto | null = params.coupon
      ? {
          code: params.coupon.code,
          name: params.coupon.name,
          discountType: params.coupon.discountType as DiscountTypeInput,
          discountValue: params.coupon.discountValue,
          discountAppliedIdr: params.couponDiscountAppliedIdr,
        }
      : null;

    return {
      currency: 'IDR',
      warehouseCode: params.warehouse.code,
      totalWeightGrams: params.totalWeightGrams,
      items,
      shippingOptions: params.shippingOptions.map((opt) => this.toShippingRateOptionDto(opt)),
      selectedShipping: this.toShippingRateOptionDto(params.selectedShipping),
      subtotalIdr: params.subtotalIdr,
      discountTotalIdr: params.discountTotalIdr,
      shippingTotalIdr: params.shippingTotalIdr,
      taxTotalIdr: params.taxTotalIdr,
      grandTotalIdr: params.grandTotalIdr,
      appliedCoupon,
      quoteExpiresAt: params.quoteExpiresAt.toISOString(),
    };
  }
}
