import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DEFAULT_WAREHOUSE_CODE, SHIPPING_POLICY } from '@arven/config';
import {
  CartStatus,
  CouponStatus,
  OrderStatus,
  ProductStatus,
  WarehouseStatus,
  type Prisma,
  type PrismaTransactionClient,
} from '@arven/database';
import type { CheckoutGuestAddress } from '@arven/validators';
import { DomainHttpException } from '../../../../common/http/index.js';
import type { AuthenticatedActor } from '../../../../common/security/index.js';
import { PrismaService } from '../../../../shared/prisma/prisma.service.js';
import type {
  CheckoutCatalogAndInventorySnapshot,
  CheckoutCouponLookupResult,
  CheckoutResolvedAddress,
  CheckoutVariantSnapshot,
} from '../../domain/ports/checkout.ports.js';
import type { CheckoutDiscountType } from '../../domain/value-objects/checkout-pricing.vo.js';

export interface CreateOrderPersistenceInput {
  orderNumber: string;
  userId: string | null;
  guestEmail: string | null;
  guestTokenHash: string | null;
  subtotalIdr: number;
  discountTotalIdr: number;
  shippingTotalIdr: number;
  taxTotalIdr: number;
  grandTotalIdr: number;
  shippingProvider: string;
  shippingService: string;
  couponCodeSnapshot: string | null;
  addressSnapshot: CheckoutResolvedAddress;
  paymentExpiresAt: Date;
  actorId: string | null;
  actorType: 'CUSTOMER' | 'GUEST';
  items: ReadonlyArray<{
    variantId: string;
    skuSnapshot: string;
    productNameSnapshot: string;
    sizeSnapshot: string;
    colorSnapshot: string;
    unitPriceIdr: number;
    discountAllocatedIdr: number;
    quantity: number;
    lineTotalIdr: number;
    configurationSnapshot: Record<string, unknown>;
  }>;
}

@Injectable()
export class PrismaCheckoutRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolveAddress(params: {
    addressId?: string;
    guestAddress?: CheckoutGuestAddress;
    customerActor: AuthenticatedActor | null;
    allowDefaultFallback: boolean;
    tx?: PrismaTransactionClient;
  }): Promise<CheckoutResolvedAddress> {
    const db = params.tx ?? this.prisma.client;

    if (params.addressId) {
      if (!params.customerActor) {
        throw new DomainHttpException(
          HttpStatus.UNAUTHORIZED,
          'AUTHENTICATION_REQUIRED',
          'Sign in to use a saved shipping address',
        );
      }

      const saved = await db.address.findFirst({
        where: {
          id: params.addressId,
          userId: params.customerActor.userId,
          deletedAt: null,
        },
      });

      if (!saved) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'ADDRESS_NOT_FOUND',
          'Shipping address not found',
        );
      }

      return {
        recipientName: saved.recipientName,
        phone: saved.phone,
        line1: saved.addressLine1,
        line2: saved.addressLine2,
        subdistrict: saved.subdistrict,
        city: saved.city,
        province: saved.province,
        postalCode: saved.postalCode,
        countryCode: saved.countryCode,
      };
    }

    if (params.guestAddress) {
      return {
        recipientName: params.guestAddress.recipientName,
        phone: params.guestAddress.phone,
        line1: params.guestAddress.line1,
        line2: params.guestAddress.line2 ?? null,
        subdistrict: params.guestAddress.subdistrict ?? null,
        city: params.guestAddress.city,
        province: params.guestAddress.province,
        postalCode: params.guestAddress.postalCode,
        countryCode: params.guestAddress.countryCode ?? 'ID',
      };
    }

    if (params.allowDefaultFallback && params.customerActor) {
      const defaultAddr = await db.address.findFirst({
        where: {
          userId: params.customerActor.userId,
          deletedAt: null,
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });
      if (defaultAddr) {
        return {
          recipientName: defaultAddr.recipientName,
          phone: defaultAddr.phone,
          line1: defaultAddr.addressLine1,
          line2: defaultAddr.addressLine2,
          subdistrict: defaultAddr.subdistrict,
          city: defaultAddr.city,
          province: defaultAddr.province,
          postalCode: defaultAddr.postalCode,
          countryCode: defaultAddr.countryCode,
        };
      }
    }

    if (params.allowDefaultFallback) {
      return {
        recipientName: 'ARVEN Client',
        phone: '+628110000000',
        line1: 'Jl. Senopati No. 1',
        line2: null,
        subdistrict: 'Kebayoran Baru',
        city: 'Jakarta Selatan',
        province: 'DKI Jakarta',
        postalCode: '12190',
        countryCode: 'ID',
      };
    }

    throw new DomainHttpException(
      HttpStatus.BAD_REQUEST,
      'SHIPPING_ADDRESS_REQUIRED',
      'A shipping address is required to complete order placement',
    );
  }

  async loadCatalogAndInventory(
    variantIds: ReadonlyArray<string>,
    tx?: PrismaTransactionClient,
  ): Promise<CheckoutCatalogAndInventorySnapshot> {
    const db = tx ?? this.prisma.client;

    const warehouse =
      (await db.warehouse.findFirst({
        where: {
          code: DEFAULT_WAREHOUSE_CODE,
          status: WarehouseStatus.ACTIVE,
        },
      })) ??
      (await db.warehouse.findFirst({
        where: {
          isDefault: true,
          status: WarehouseStatus.ACTIVE,
        },
      }));

    if (!warehouse) {
      throw new DomainHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'WAREHOUSE_UNAVAILABLE',
        'No active default warehouse is configured',
      );
    }

    const variants = await db.productVariant.findMany({
      where: {
        id: { in: [...variantIds] },
        isActive: true,
        deletedAt: null,
        product: {
          status: ProductStatus.PUBLISHED,
          isVisible: true,
          deletedAt: null,
        },
      },
      include: {
        product: {
          include: {
            media: {
              orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }],
              take: 1,
            },
          },
        },
        inventoryLevels: {
          where: {
            warehouseId: warehouse.id,
          },
          take: 1,
        },
      },
    });

    const variantsById = new Map<string, CheckoutVariantSnapshot>();
    for (const variant of variants) {
      const level = variant.inventoryLevels[0];
      const availableQuantity = level
        ? Math.max(0, level.quantityOnHand - level.quantityReserved)
        : 0;

      variantsById.set(variant.id, {
        variantId: variant.id,
        sku: variant.sku,
        productId: variant.product.id,
        productSlug: variant.product.slug,
        productName: variant.product.name,
        size: variant.size,
        color: variant.color,
        unitPriceIdr: Number(variant.priceIdr),
        weightGrams:
          variant.weightGrams > 0
            ? variant.weightGrams
            : SHIPPING_POLICY.DEFAULT_WEIGHT_GRAMS_FALLBACK,
        availableQuantity,
        primaryImageUrl: variant.product.media[0]?.url ?? null,
      });
    }

    for (const variantId of variantIds) {
      if (!variantsById.has(variantId)) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'VARIANT_NOT_FOUND',
          'One or more requested product variants are unavailable',
          [{ field: 'items.variantId', issue: `Variant ${variantId} is unavailable` }],
        );
      }
    }

    return {
      warehouse: {
        id: warehouse.id,
        code: warehouse.code,
      },
      variantsById,
    };
  }

  async resolveColorPresets(
    items: ReadonlyArray<{ variantId: string; productId: string; colorPresetId?: string }>,
    tx?: PrismaTransactionClient,
  ): Promise<Map<string, Record<string, unknown>>> {
    const db = tx ?? this.prisma.client;
    const presetIds = Array.from(
      new Set(
        items
          .map((item) => item.colorPresetId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );

    const configs = new Map<string, Record<string, unknown>>();
    if (presetIds.length === 0) {
      return configs;
    }

    const presets = await db.customizationPreset.findMany({
      where: {
        id: { in: presetIds },
        isActive: true,
      },
    });
    const byId = new Map(presets.map((p) => [p.id, p]));

    for (const item of items) {
      if (!item.colorPresetId) {
        continue;
      }
      const preset = byId.get(item.colorPresetId);
      if (
        !preset ||
        preset.productId !== item.productId ||
        (preset.variantId !== null && preset.variantId !== item.variantId)
      ) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'INVALID_CUSTOMIZATION_PRESET',
          'Selected customization preset does not apply to this product variant',
          [
            {
              field: 'items.customization.colorPresetId',
              issue: `Preset ${item.colorPresetId} does not apply to variant ${item.variantId}`,
            },
          ],
        );
      }
      configs.set(item.variantId, {
        colorPresetId: preset.id,
        code: preset.code,
        label: preset.label,
        swatchHex: preset.swatchHex,
      });
    }

    return configs;
  }

  async lookupCoupon(
    rawCode: string,
    userId: string | null,
    tx?: PrismaTransactionClient,
  ): Promise<CheckoutCouponLookupResult> {
    const db = tx ?? this.prisma.client;
    const code = rawCode.trim().toUpperCase();

    const coupon = await db.coupon.findUnique({
      where: { code },
    });

    if (!coupon) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'COUPON_NOT_FOUND',
        'Coupon code was not found',
      );
    }

    let userRedemptionCount = 0;
    if (userId) {
      userRedemptionCount = await db.couponRedemption.count({
        where: {
          couponId: coupon.id,
          userId,
          order: {
            status: {
              notIn: [OrderStatus.CANCELLED, OrderStatus.EXPIRED],
            },
          },
        },
      });
    }

    return {
      coupon: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        discountType: coupon.discountType as CheckoutDiscountType,
        discountValue: Number(coupon.discountValue),
        maxDiscountIdr:
          coupon.maxDiscountIdr !== null ? Number(coupon.maxDiscountIdr) : null,
        minOrderSubtotalIdr: Number(coupon.minOrderSubtotalIdr),
        usageLimitTotal: coupon.usageLimitTotal,
        usageLimitPerUser: coupon.usageLimitPerUser,
        usedCount: coupon.usedCount,
        status: coupon.status,
        startsAt: coupon.startsAt,
        endsAt: coupon.endsAt,
      },
      userRedemptionCount,
    };
  }

  async claimCouponRedemption(
    tx: PrismaTransactionClient,
    params: {
      couponId: string;
      orderId: string;
      userId: string | null;
      discountAppliedIdr: number;
    },
  ): Promise<void> {
    const updated = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "coupons"
      SET "used_count" = "used_count" + 1,
          "updated_at" = NOW()
      WHERE "id" = ${params.couponId}::uuid
        AND "status" = CAST(${CouponStatus.ACTIVE} AS "CouponStatus")
        AND ("usage_limit_total" IS NULL OR "used_count" < "usage_limit_total")
        AND "starts_at" <= NOW()
        AND "ends_at" >= NOW()
      RETURNING "id"
    `;

    if (updated.length === 0) {
      throw new DomainHttpException(
        HttpStatus.CONFLICT,
        'COUPON_USAGE_LIMIT_REACHED',
        'Coupon is no longer eligible or usage limit has been reached',
      );
    }

    await tx.couponRedemption.create({
      data: {
        couponId: params.couponId,
        orderId: params.orderId,
        userId: params.userId,
        discountAppliedIdr: BigInt(params.discountAppliedIdr),
      },
    });
  }

  async createOrderRecord(
    tx: PrismaTransactionClient,
    input: CreateOrderPersistenceInput,
  ): Promise<string> {
    const created = await tx.order.create({
      data: {
        orderNumber: input.orderNumber,
        userId: input.userId,
        guestEmail: input.guestEmail,
        guestTokenHash: input.guestTokenHash,
        status: OrderStatus.PENDING_PAYMENT,
        currency: 'IDR',
        subtotalIdr: BigInt(input.subtotalIdr),
        discountTotalIdr: BigInt(input.discountTotalIdr),
        shippingTotalIdr: BigInt(input.shippingTotalIdr),
        taxTotalIdr: BigInt(input.taxTotalIdr),
        grandTotalIdr: BigInt(input.grandTotalIdr),
        shippingProvider: input.shippingProvider,
        shippingService: input.shippingService,
        couponCodeSnapshot: input.couponCodeSnapshot,
        addressSnapshot: input.addressSnapshot as unknown as Prisma.InputJsonValue,
        paymentExpiresAt: input.paymentExpiresAt,
        items: {
          create: input.items.map((item) => ({
            variantId: item.variantId,
            skuSnapshot: item.skuSnapshot,
            productNameSnapshot: item.productNameSnapshot,
            sizeSnapshot: item.sizeSnapshot,
            colorSnapshot: item.colorSnapshot,
            unitPriceIdr: BigInt(item.unitPriceIdr),
            discountAllocatedIdr: BigInt(item.discountAllocatedIdr),
            quantity: item.quantity,
            lineTotalIdr: BigInt(item.lineTotalIdr),
            configurationSnapshot:
              item.configurationSnapshot as unknown as Prisma.InputJsonValue,
          })),
        },
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: OrderStatus.PENDING_PAYMENT,
            reason: 'Order created at checkout',
            actorId: input.actorId,
            actorType: input.actorType,
          },
        },
      },
      select: {
        id: true,
      },
    });

    return created.id;
  }

  async convertActiveCartIfPresent(
    tx: PrismaTransactionClient,
    params: {
      userId: string | null;
      guestCartTokenHash: string | null;
    },
  ): Promise<void> {
    const cart = params.userId
      ? await tx.cart.findFirst({
          where: {
            userId: params.userId,
            status: CartStatus.ACTIVE,
          },
          select: { id: true },
        })
      : params.guestCartTokenHash
        ? await tx.cart.findFirst({
            where: {
              guestTokenHash: params.guestCartTokenHash,
              status: CartStatus.ACTIVE,
            },
            select: { id: true },
          })
        : null;

    if (!cart) {
      return;
    }

    await tx.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    await tx.cart.update({
      where: { id: cart.id },
      data: {
        status: CartStatus.CONVERTED,
      },
    });
  }
}
