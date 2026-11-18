import { randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  CHECKOUT_POLICY,
  GUEST_CART_COOKIE_NAME,
  GUEST_CART_PROD_COOKIE_NAME,
  HTTP_HEADERS,
} from '@arven/config';
import type { CheckoutQuoteDto, CreateOrderResultDto } from '@arven/contracts';
import type { PrismaTransactionClient } from '@arven/database';
import type {
  CheckoutQuoteRequest,
  CheckoutShippingSelection,
  CreateOrderRequest,
} from '@arven/validators';
import {
  DomainHttpException,
  IdempotencyService,
  type IdempotencyResponseLike,
} from '../../../../common/http/index.js';
import {
  TokenCryptoService,
  extractClientIp,
  parseCookiesFromRequest,
  type AuthenticatedActor,
  type HttpRequestLike,
} from '../../../../common/security/index.js';
import {
  SHIPPING_PROVIDER,
  type ShippingProvider,
  type ShippingRateOption,
} from '../../../../shared/adapters/shipping.provider.js';
import { AuditLogService } from '../../../audit-notifications/audit-log.service.js';
import { OutboxWriterService } from '../../../audit-notifications/outbox-writer.service.js';
import { InventoryReservationService } from '../../../inventory/inventory-reservation.service.js';
import {
  OrderAccessService,
  OrdersMapper,
  PrismaOrdersRepository,
} from '../../../orders/index.js';
import { CheckoutDomainError } from '../../domain/errors/checkout-domain.error.js';
import { CHECKOUT_EVENT_TYPES } from '../../domain/events/checkout.events.js';
import type {
  CheckoutResolvedAddress,
  CheckoutVariantSnapshot,
  CheckoutWarehouseInfo,
} from '../../domain/ports/checkout.ports.js';
import {
  aggregateRequestedItems,
  allocateLineDiscounts,
  buildOrderNumber,
  computeCouponDiscount,
  type AllocatedCheckoutLine,
  type CouponPolicySnapshot,
} from '../../domain/value-objects/checkout-pricing.vo.js';
import { CheckoutMapper } from '../../infrastructure/mappers/checkout.mapper.js';
import { PrismaCheckoutRepository } from '../../infrastructure/repositories/prisma-checkout.repository.js';

interface ComputedCheckoutSummary {
  warehouse: CheckoutWarehouseInfo;
  address: CheckoutResolvedAddress;
  variantsById: ReadonlyMap<string, CheckoutVariantSnapshot>;
  colorConfigsByVariantId: Map<string, Record<string, unknown>>;
  allocatedLines: AllocatedCheckoutLine[];
  totalWeightGrams: number;
  shippingOptions: ReadonlyArray<ShippingRateOption>;
  selectedShipping: ShippingRateOption;
  subtotalIdr: number;
  discountTotalIdr: number;
  shippingTotalIdr: number;
  taxTotalIdr: number;
  grandTotalIdr: number;
  coupon: CouponPolicySnapshot | null;
  couponDiscountAppliedIdr: number;
}

function readIdempotencyKeyHeader(req: HttpRequestLike): string {
  const raw = req.headers[HTTP_HEADERS.IDEMPOTENCY_KEY];
  const value =
    typeof raw === 'string'
      ? raw.trim()
      : Array.isArray(raw) && typeof raw[0] === 'string'
        ? raw[0].trim()
        : '';

  if (value.length < 8 || value.length > 128) {
    throw new DomainHttpException(
      HttpStatus.BAD_REQUEST,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key header (8..128 characters) is required for order creation',
    );
  }
  return value;
}

@Injectable()
export class CheckoutService {
  constructor(
    @Inject(PrismaCheckoutRepository)
    private readonly checkoutRepo: PrismaCheckoutRepository,
    @Inject(CheckoutMapper)
    private readonly checkoutMapper: CheckoutMapper,
    @Inject(OrderAccessService)
    private readonly orderAccess: OrderAccessService,
    @Inject(OrdersMapper)
    private readonly ordersMapper: OrdersMapper,
    @Inject(PrismaOrdersRepository)
    private readonly ordersRepo: PrismaOrdersRepository,
    @Inject(InventoryReservationService)
    private readonly inventoryReservation: InventoryReservationService,
    @Inject(SHIPPING_PROVIDER)
    private readonly shippingProvider: ShippingProvider,
    @Inject(IdempotencyService)
    private readonly idempotencyService: IdempotencyService,
    @Inject(TokenCryptoService)
    private readonly tokenCrypto: TokenCryptoService,
    @Inject(OutboxWriterService)
    private readonly outboxWriter: OutboxWriterService,
    @Inject(AuditLogService)
    private readonly auditLog: AuditLogService,
  ) {}

  private rethrowDomainError(error: unknown): never {
    if (error instanceof CheckoutDomainError) {
      throw new DomainHttpException(error.statusCode, error.code, error.message, error.details);
    }
    throw error;
  }

  private async computeAuthoritativeCheckout(params: {
    customerActor: AuthenticatedActor | null;
    addressId?: string;
    guestAddress?: CheckoutQuoteRequest['guestAddress'];
    shippingSelection?: CheckoutShippingSelection;
    couponCode?: string;
    items: CheckoutQuoteRequest['items'];
    allowDefaultAddressFallback: boolean;
    tx?: PrismaTransactionClient;
  }): Promise<ComputedCheckoutSummary> {
    let requestedItems;
    try {
      requestedItems = aggregateRequestedItems(
        params.items.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
          colorPresetId: item.customization?.colorPresetId,
        })),
        CHECKOUT_POLICY.MAX_LINE_ITEMS,
      );
    } catch (error) {
      this.rethrowDomainError(error);
    }

    const address = await this.checkoutRepo.resolveAddress({
      addressId: params.addressId,
      guestAddress: params.guestAddress,
      customerActor: params.customerActor,
      allowDefaultFallback: params.allowDefaultAddressFallback,
      tx: params.tx,
    });

    const variantIds = requestedItems.map((item) => item.variantId);
    const catalog = await this.checkoutRepo.loadCatalogAndInventory(variantIds, params.tx);

    const colorConfigsByVariantId = await this.checkoutRepo.resolveColorPresets(
      requestedItems.map((item) => ({
        variantId: item.variantId,
        productId: catalog.variantsById.get(item.variantId)!.productId,
        colorPresetId: item.colorPresetId,
      })),
      params.tx,
    );

    const pricedLines = requestedItems.map((item) => {
      const variant = catalog.variantsById.get(item.variantId)!;
      return {
        variantId: item.variantId,
        unitPriceIdr: variant.unitPriceIdr,
        quantity: item.quantity,
        weightGrams: variant.weightGrams,
      };
    });

    const subtotalIdr = pricedLines.reduce(
      (acc, line) => acc + line.unitPriceIdr * line.quantity,
      0,
    );
    const totalWeightGrams = pricedLines.reduce(
      (acc, line) => acc + line.weightGrams * line.quantity,
      0,
    );

    const shippingOptions = await this.shippingProvider.getRates({
      originWarehouseCode: catalog.warehouse.code,
      destination: {
        recipientName: address.recipientName,
        phone: address.phone,
        addressLine1: address.line1,
        addressLine2: address.line2 ?? undefined,
        city: address.city,
        province: address.province,
        postalCode: address.postalCode,
        countryCode: address.countryCode,
      },
      totalWeightGrams,
      declaredValueIdr: subtotalIdr,
    });

    let selectedShipping: ShippingRateOption | undefined;
    if (params.shippingSelection) {
      selectedShipping = shippingOptions.find(
        (opt) =>
          opt.provider === params.shippingSelection!.provider &&
          opt.serviceCode === params.shippingSelection!.service,
      );
      if (!selectedShipping) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'INVALID_SHIPPING_OPTION',
          'Selected shipping provider and service option is unavailable',
        );
      }
    } else {
      selectedShipping = [...shippingOptions].sort((a, b) => a.costIdr - b.costIdr)[0];
    }

    if (!selectedShipping) {
      throw new DomainHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'SHIPPING_RATES_UNAVAILABLE',
        'No shipping rates available for destination',
      );
    }

    let coupon: CouponPolicySnapshot | null = null;
    let discountTotalIdr = 0;
    let shippingDiscountIdr = 0;
    let couponDiscountAppliedIdr = 0;

    if (params.couponCode) {
      const lookup = await this.checkoutRepo.lookupCoupon(
        params.couponCode,
        params.customerActor?.userId ?? null,
        params.tx,
      );
      coupon = lookup.coupon;

      try {
        const computedCoupon = computeCouponDiscount({
          coupon: lookup.coupon,
          subtotalIdr,
          shippingCostIdr: selectedShipping.costIdr,
          userRedemptionCount: lookup.userRedemptionCount,
          now: new Date(),
        });
        discountTotalIdr = computedCoupon.discountTotalIdr;
        shippingDiscountIdr = computedCoupon.shippingDiscountIdr;
        couponDiscountAppliedIdr = computedCoupon.discountAppliedIdr;
      } catch (error) {
        this.rethrowDomainError(error);
      }
    }

    let allocatedLines: AllocatedCheckoutLine[];
    try {
      allocatedLines = allocateLineDiscounts(pricedLines, discountTotalIdr);
    } catch (error) {
      this.rethrowDomainError(error);
    }

    const shippingTotalIdr = Math.max(0, selectedShipping.costIdr - shippingDiscountIdr);
    const taxTotalIdr = 0;
    const grandTotalIdr = subtotalIdr - discountTotalIdr + shippingTotalIdr + taxTotalIdr;

    return {
      warehouse: catalog.warehouse,
      address,
      variantsById: catalog.variantsById,
      colorConfigsByVariantId,
      allocatedLines,
      totalWeightGrams,
      shippingOptions,
      selectedShipping,
      subtotalIdr,
      discountTotalIdr,
      shippingTotalIdr,
      taxTotalIdr,
      grandTotalIdr,
      coupon,
      couponDiscountAppliedIdr,
    };
  }

  async quote(
    req: HttpRequestLike,
    body: CheckoutQuoteRequest,
  ): Promise<CheckoutQuoteDto> {
    const customerActor = await this.orderAccess.resolveOptionalCustomer(req);
    const computed = await this.computeAuthoritativeCheckout({
      customerActor,
      addressId: body.addressId,
      guestAddress: body.guestAddress,
      shippingSelection: body.shipping,
      couponCode: body.couponCode,
      items: body.items,
      allowDefaultAddressFallback: true,
    });

    const quoteExpiresAt = new Date(
      Date.now() + CHECKOUT_POLICY.QUOTE_TTL_MINUTES * 60_000,
    );

    return this.checkoutMapper.toCheckoutQuoteDto({
      warehouse: computed.warehouse,
      totalWeightGrams: computed.totalWeightGrams,
      allocatedLines: computed.allocatedLines,
      variantsById: computed.variantsById,
      shippingOptions: computed.shippingOptions,
      selectedShipping: computed.selectedShipping,
      subtotalIdr: computed.subtotalIdr,
      discountTotalIdr: computed.discountTotalIdr,
      shippingTotalIdr: computed.shippingTotalIdr,
      taxTotalIdr: computed.taxTotalIdr,
      grandTotalIdr: computed.grandTotalIdr,
      coupon: computed.coupon,
      couponDiscountAppliedIdr: computed.couponDiscountAppliedIdr,
      quoteExpiresAt,
    });
  }

  private resolveGuestCartTokenHash(req: HttpRequestLike): string | null {
    const cookies = parseCookiesFromRequest(req);
    const rawCookie =
      cookies[GUEST_CART_PROD_COOKIE_NAME] ?? cookies[GUEST_CART_COOKIE_NAME];
    if (!rawCookie || rawCookie.trim().length === 0) {
      return null;
    }
    return this.tokenCrypto.sha256Hex(rawCookie.trim());
  }

  async createOrder(
    req: HttpRequestLike,
    res: IdempotencyResponseLike,
    body: CreateOrderRequest,
  ): Promise<CreateOrderResultDto> {
    const idempotencyKey = readIdempotencyKeyHeader(req);
    const customerActor = await this.orderAccess.resolveOptionalCustomer(req);

    if (body.addressId && !customerActor) {
      throw new DomainHttpException(
        HttpStatus.UNAUTHORIZED,
        'AUTHENTICATION_REQUIRED',
        'Sign in to place an order using a saved address',
      );
    }

    if (!customerActor && (!body.guestEmail || !body.guestAddress)) {
      throw new DomainHttpException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Guest orders require guestEmail and guestAddress',
      );
    }

    const actorScope = customerActor
      ? `user:${customerActor.userId}`
      : `guest:${this.tokenCrypto
          .sha256Hex(body.guestEmail!.trim().toLowerCase())
          .slice(0, 24)}`;

    const guestCartTokenHash = customerActor ? null : this.resolveGuestCartTokenHash(req);

    return this.idempotencyService.execute<CreateOrderResultDto>({
      idempotencyKey,
      actorScope,
      route: 'POST:/api/v1/checkout/orders',
      requestPayload: body,
      res,
      successStatus: HttpStatus.CREATED,
      run: async (tx) => {
        const computed = await this.computeAuthoritativeCheckout({
          customerActor,
          addressId: body.addressId,
          guestAddress: body.guestAddress,
          shippingSelection: body.shipping,
          couponCode: body.couponCode,
          items: body.items,
          allowDefaultAddressFallback: false,
          tx,
        });

        const now = new Date();
        const paymentExpiresAt = new Date(
          now.getTime() + CHECKOUT_POLICY.RESERVATION_TTL_MINUTES * 60_000,
        );
        const orderNumber = buildOrderNumber(now, randomBytes(4).toString('hex'));

        const plaintextGuestToken = customerActor
          ? null
          : this.tokenCrypto.generateOpaqueToken(CHECKOUT_POLICY.MAX_GUEST_TOKEN_BYTES);
        const guestTokenHash = plaintextGuestToken
          ? this.tokenCrypto.sha256Hex(plaintextGuestToken)
          : null;
        const normalizedGuestEmail = customerActor
          ? null
          : body.guestEmail!.trim().toLowerCase();

        const actorId = customerActor ? customerActor.userId : null;
        const actorType: 'CUSTOMER' | 'GUEST' = customerActor ? 'CUSTOMER' : 'GUEST';

        const orderId = await this.checkoutRepo.createOrderRecord(tx, {
          orderNumber,
          userId: customerActor ? customerActor.userId : null,
          guestEmail: normalizedGuestEmail,
          guestTokenHash,
          subtotalIdr: computed.subtotalIdr,
          discountTotalIdr: computed.discountTotalIdr,
          shippingTotalIdr: computed.shippingTotalIdr,
          taxTotalIdr: computed.taxTotalIdr,
          grandTotalIdr: computed.grandTotalIdr,
          shippingProvider: computed.selectedShipping.provider,
          shippingService: computed.selectedShipping.serviceCode,
          couponCodeSnapshot: computed.coupon ? computed.coupon.code : null,
          addressSnapshot: computed.address,
          paymentExpiresAt,
          actorId,
          actorType,
          items: computed.allocatedLines.map((line) => {
            const variant = computed.variantsById.get(line.variantId)!;
            return {
              variantId: variant.variantId,
              skuSnapshot: variant.sku,
              productNameSnapshot: variant.productName,
              sizeSnapshot: variant.size,
              colorSnapshot: variant.color,
              unitPriceIdr: line.unitPriceIdr,
              discountAllocatedIdr: line.discountAllocatedIdr,
              quantity: line.quantity,
              lineTotalIdr: line.lineTotalIdr,
              configurationSnapshot:
                computed.colorConfigsByVariantId.get(variant.variantId) ?? {},
            };
          }),
        });

        await this.inventoryReservation.reserveStockForOrder(tx, {
          orderId,
          warehouseId: computed.warehouse.id,
          items: computed.allocatedLines.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
          })),
          expiresAt: paymentExpiresAt,
          actorId,
        });

        if (computed.coupon) {
          await this.checkoutRepo.claimCouponRedemption(tx, {
            couponId: computed.coupon.id,
            orderId,
            userId: customerActor ? customerActor.userId : null,
            discountAppliedIdr: computed.couponDiscountAppliedIdr,
          });
        }

        await this.checkoutRepo.convertActiveCartIfPresent(tx, {
          userId: customerActor ? customerActor.userId : null,
          guestCartTokenHash,
        });

        await this.outboxWriter.enqueue(
          {
            aggregateType: 'order',
            aggregateId: orderId,
            eventType: CHECKOUT_EVENT_TYPES.INVENTORY_RESERVED,
            payload: {
              orderId,
              orderNumber,
              warehouseId: computed.warehouse.id,
              expiresAt: paymentExpiresAt.toISOString(),
              items: computed.allocatedLines.map((line) => ({
                variantId: line.variantId,
                quantity: line.quantity,
              })),
            },
          },
          tx,
        );

        await this.outboxWriter.enqueue(
          {
            aggregateType: 'order',
            aggregateId: orderId,
            eventType: CHECKOUT_EVENT_TYPES.ORDER_CREATED,
            payload: {
              orderId,
              orderNumber,
              isGuest: !customerActor,
              grandTotalIdr: computed.grandTotalIdr,
              currency: 'IDR',
              shippingProvider: computed.selectedShipping.provider,
              shippingService: computed.selectedShipping.serviceCode,
              paymentExpiresAt: paymentExpiresAt.toISOString(),
            },
          },
          tx,
        );

        await this.auditLog.record(
          {
            actorId,
            actorRole: actorType,
            action: 'order.created',
            resource: 'order',
            resourceId: orderId,
            ipAddress: extractClientIp(req),
            afterState: {
              orderNumber,
              grandTotalIdr: computed.grandTotalIdr,
              itemCount: computed.allocatedLines.length,
              isGuest: !customerActor,
            },
          },
          tx,
        );

        const createdOrder = await this.ordersRepo.findDetailById(orderId, tx);
        return {
          order: this.ordersMapper.toOrderDetailDto(createdOrder!),
          guestToken: plaintextGuestToken,
        };
      },
    });
  }
}
