import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  CART_POLICY,
  GUEST_CART_COOKIE_NAME,
  GUEST_CART_PROD_COOKIE_NAME,
  type RuntimeConfig,
} from '@arven/config';
import type {
  CartAvailabilityIssueCode,
  CartDto,
  CartItemDto,
  MergeCartResultDto,
} from '@arven/contracts';
import {
  CartStatus,
  Prisma,
  ProductStatus,
  WarehouseStatus,
  type PrismaTransactionClient,
} from '@arven/database';
import type {
  AddCartItemRequest,
  CartItemConfiguration,
  CartStatusInput,
  StockStatus,
  UpdateCartItemRequest,
} from '@arven/validators';
import {
  DomainHttpException,
  canonicalJsonStringify,
} from '../../common/http/index.js';
import {
  SessionScope,
  SessionStoreService,
  TokenCryptoService,
  parseCookiesFromRequest,
  type AuthenticatedActor,
  type HttpRequestLike,
  type HttpResponseLike,
} from '../../common/security/index.js';
import { RUNTIME_CONFIG } from '../../shared/config/config.module.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { AuditLogService } from '../audit-notifications/audit-log.service.js';

const HYDRATED_CART_INCLUDE = {
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: {
      variant: {
        include: {
          product: {
            include: {
              media: {
                orderBy: [
                  { isPrimary: 'desc' as const },
                  { position: 'asc' as const },
                  { createdAt: 'asc' as const },
                ],
              },
            },
          },
          inventoryLevels: {
            where: {
              warehouse: {
                status: WarehouseStatus.ACTIVE,
              },
            },
            include: {
              warehouse: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

type HydratedCartRow = Prisma.CartGetPayload<{
  include: typeof HYDRATED_CART_INCLUDE;
}>;

const VARIANT_AVAILABILITY_INCLUDE = {
  product: {
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      isVisible: true,
      deletedAt: true,
    },
  },
  inventoryLevels: {
    where: {
      warehouse: {
        status: WarehouseStatus.ACTIVE,
      },
    },
    select: {
      quantityOnHand: true,
      quantityReserved: true,
      lowStockThreshold: true,
    },
  },
} satisfies Prisma.ProductVariantInclude;

function isUniqueConstraintError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth += 1) {
    if (visited.has(current)) {
      break;
    }
    visited.add(current);
    const rec = current as Record<string, unknown>;
    if (rec['code'] === 'P2002' || rec['code'] === '23505' || rec['originalCode'] === '23505') {
      return true;
    }
    const meta = rec['meta'];
    if (meta && typeof meta === 'object') {
      const driver = (meta as Record<string, unknown>)['driverAdapterError'];
      if (driver && typeof driver === 'object') {
        const dRec = driver as Record<string, unknown>;
        if (dRec['code'] === '23505' || dRec['originalCode'] === '23505') {
          return true;
        }
        const dCause = dRec['cause'];
        if (dCause && typeof dCause === 'object') {
          const dcRec = dCause as Record<string, unknown>;
          if (dcRec['code'] === '23505' || dcRec['originalCode'] === '23505') {
            return true;
          }
        }
      }
    }
    current = rec['cause'];
  }
  return false;
}

function canonicalizeConfiguration(raw: unknown): CartItemConfiguration {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const source = raw as Record<string, unknown>;
  const sorted: CartItemConfiguration = {};
  for (const key of Object.keys(source).sort()) {
    const val = source[key];
    if (
      typeof val === 'string' ||
      typeof val === 'number' ||
      typeof val === 'boolean' ||
      val === null
    ) {
      sorted[key] = val;
    }
  }
  return sorted;
}

function computeAggregateStock(
  levels: ReadonlyArray<{
    quantityOnHand: number;
    quantityReserved: number;
    lowStockThreshold: number;
  }>,
): {
  availableQty: number;
  lowStockThreshold: number;
  stockStatus: StockStatus;
} {
  let totalOnHand = 0;
  let totalReserved = 0;
  let lowStockThreshold = 5;

  for (const level of levels) {
    totalOnHand += level.quantityOnHand;
    totalReserved += level.quantityReserved;
    lowStockThreshold = Math.max(lowStockThreshold, level.lowStockThreshold);
  }

  const availableQty = Math.max(0, totalOnHand - totalReserved);
  const stockStatus: StockStatus =
    availableQty <= 0
      ? 'OUT_OF_STOCK'
      : availableQty <= lowStockThreshold
        ? 'LOW_STOCK'
        : 'IN_STOCK';

  return {
    availableQty,
    lowStockThreshold,
    stockStatus,
  };
}

function mapCartStatus(status: CartStatus): CartStatusInput {
  if (status === CartStatus.ABANDONED) {
    return 'EXPIRED';
  }
  return status;
}

function emptyCartDto(): CartDto {
  return {
    id: null,
    status: 'ACTIVE',
    ownerType: 'NONE',
    currency: 'IDR',
    itemCount: 0,
    totalQuantity: 0,
    subtotalIdr: 0,
    hasUnavailableItems: false,
    items: [],
    updatedAt: null,
  };
}

function mapHydratedCartDto(cart: HydratedCartRow): CartDto {
  const items: CartItemDto[] = cart.items.map((item) => {
    const variant = item.variant;
    const product = variant.product;
    const unitPriceIdr = Number(variant.priceIdr);
    const compareAtIdr =
      variant.compareAtPriceIdr !== null ? Number(variant.compareAtPriceIdr) : null;
    const lineSubtotalIdr = unitPriceIdr * item.quantity;

    const stock = computeAggregateStock(variant.inventoryLevels);

    const isProductPublishable =
      product.deletedAt === null &&
      product.status === ProductStatus.PUBLISHED &&
      product.isVisible;
    const isVariantActive = variant.deletedAt === null && variant.isActive;

    let isAvailable = true;
    let issueCode: CartAvailabilityIssueCode | null = null;
    let issueMessage: string | null = null;

    if (!isProductPublishable) {
      isAvailable = false;
      issueCode = 'PRODUCT_UNAVAILABLE';
      issueMessage = 'This product is no longer available for purchase';
    } else if (!isVariantActive) {
      isAvailable = false;
      issueCode = 'VARIANT_INACTIVE';
      issueMessage = 'This variant is currently unavailable';
    } else if (stock.availableQty <= 0) {
      isAvailable = false;
      issueCode = 'OUT_OF_STOCK';
      issueMessage = 'This variant is currently out of stock';
    } else if (item.quantity > stock.availableQty) {
      isAvailable = false;
      issueCode = 'INSUFFICIENT_STOCK';
      issueMessage = `Only ${stock.availableQty} unit(s) currently available in stock`;
    }

    const primaryMedia =
      product.media.find((m) => m.variantId === variant.id && m.isPrimary) ??
      product.media.find((m) => m.variantId === variant.id) ??
      product.media.find((m) => m.isPrimary) ??
      product.media[0] ??
      null;

    return {
      id: item.id,
      variantId: item.variantId,
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      sku: variant.sku,
      color: variant.color,
      colorHex: variant.colorHex,
      size: variant.size,
      unitPriceIdr,
      compareAtIdr,
      lineSubtotalIdr,
      quantity: item.quantity,
      availableQty: stock.availableQty,
      isAvailable,
      availabilityStatus: stock.stockStatus,
      issueCode,
      issueMessage,
      configuration: canonicalizeConfiguration(item.configuration),
      configurationHash: item.configurationHash,
      primaryImageUrl: primaryMedia?.url ?? null,
      primaryImageAlt: primaryMedia?.altText ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  });

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalIdr = items.reduce((sum, item) => sum + item.lineSubtotalIdr, 0);
  const hasUnavailableItems = items.some((item) => !item.isAvailable);

  return {
    id: cart.id,
    status: mapCartStatus(cart.status),
    ownerType: cart.userId ? 'USER' : 'GUEST',
    currency: 'IDR',
    itemCount: items.length,
    totalQuantity,
    subtotalIdr,
    hasUnavailableItems,
    items,
    updatedAt: cart.updatedAt.toISOString(),
  };
}

@Injectable()
export class CartService {
  constructor(
    @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionStoreService) private readonly sessionStore: SessionStoreService,
    @Inject(TokenCryptoService) private readonly tokenCrypto: TokenCryptoService,
    @Inject(AuditLogService) private readonly auditLogService: AuditLogService,
  ) {}

  getGuestCartCookieName(): string {
    return this.config.COOKIE_SECURE
      ? GUEST_CART_PROD_COOKIE_NAME
      : GUEST_CART_COOKIE_NAME;
  }

  private readGuestCartCookie(req: HttpRequestLike): string | undefined {
    const cookies = parseCookiesFromRequest(req);
    const raw = cookies[this.getGuestCartCookieName()];
    if (!raw || raw.length < 16 || raw.length > 256) {
      return undefined;
    }
    return raw;
  }

  private hasRawGuestCookie(req: HttpRequestLike): boolean {
    const cookies = parseCookiesFromRequest(req);
    return Object.prototype.hasOwnProperty.call(cookies, this.getGuestCartCookieName());
  }

  private setGuestCartCookie(res: HttpResponseLike, rawToken: string): void {
    res.cookie(this.getGuestCartCookieName(), rawToken, {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: CART_POLICY.GUEST_CART_TTL_DAYS * 24 * 60 * 60 * 1000,
    });
  }

  private clearGuestCartCookie(res: HttpResponseLike): void {
    res.clearCookie(this.getGuestCartCookieName(), {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
    });
  }

  private async resolveOptionalCustomerUserId(
    req: HttpRequestLike,
  ): Promise<string | null> {
    const resolved = await this.sessionStore.resolveFromRequest(req, [
      SessionScope.CUSTOMER,
    ]);
    return resolved?.actor.userId ?? null;
  }

  private async findOrCreateCustomerCart(
    userId: string,
    tx: PrismaTransactionClient,
  ): Promise<{ id: string }> {
    const existing = await tx.cart.findFirst({
      where: { userId, status: CartStatus.ACTIVE },
      select: { id: true },
    });
    if (existing) {
      return existing;
    }

    try {
      return await tx.cart.create({
        data: {
          userId,
          status: CartStatus.ACTIVE,
          currency: 'IDR',
        },
        select: { id: true },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      const raced = await tx.cart.findFirst({
        where: { userId, status: CartStatus.ACTIVE },
        select: { id: true },
      });
      if (!raced) {
        throw error;
      }
      return raced;
    }
  }

  private async loadHydratedCartById(
    cartId: string,
    tx?: PrismaTransactionClient,
  ): Promise<CartDto> {
    const db = tx ?? this.prisma.client;
    const cart = await db.cart.findUnique({
      where: { id: cartId },
      include: HYDRATED_CART_INCLUDE,
    });
    return cart ? mapHydratedCartDto(cart) : emptyCartDto();
  }

  private async loadCustomerCart(
    userId: string,
    tx?: PrismaTransactionClient,
  ): Promise<CartDto> {
    const db = tx ?? this.prisma.client;
    const cart = await db.cart.findFirst({
      where: { userId, status: CartStatus.ACTIVE },
      include: HYDRATED_CART_INCLUDE,
    });
    return cart ? mapHydratedCartDto(cart) : emptyCartDto();
  }

  private async resolveExistingActiveCartId(
    req: HttpRequestLike,
    db: PrismaTransactionClient | PrismaService['client'],
  ): Promise<string | null> {
    const userId = await this.resolveOptionalCustomerUserId(req);
    if (userId) {
      const cart = await db.cart.findFirst({
        where: { userId, status: CartStatus.ACTIVE },
        select: { id: true },
      });
      return cart?.id ?? null;
    }

    const rawGuestToken = this.readGuestCartCookie(req);
    if (!rawGuestToken) {
      return null;
    }

    const guestTokenHash = this.tokenCrypto.sha256Hex(rawGuestToken);
    const cart = await db.cart.findFirst({
      where: { guestTokenHash, status: CartStatus.ACTIVE },
      select: { id: true },
    });
    return cart?.id ?? null;
  }

  async getCart(req: HttpRequestLike): Promise<CartDto> {
    const cartId = await this.resolveExistingActiveCartId(req, this.prisma.client);
    if (!cartId) {
      return emptyCartDto();
    }
    return this.loadHydratedCartById(cartId);
  }

  async addItem(
    req: HttpRequestLike,
    res: HttpResponseLike,
    body: AddCartItemRequest,
  ): Promise<CartDto> {
    const userId = await this.resolveOptionalCustomerUserId(req);
    const rawGuestToken = userId ? undefined : this.readGuestCartCookie(req);
    let mintedGuestToken: string | null = null;

    const cartDto = await this.prisma.withTransaction(async (tx) => {
      let cartId: string;

      if (userId) {
        const customerCart = await this.findOrCreateCustomerCart(userId, tx);
        cartId = customerCart.id;
      } else {
        let existingGuestCart: { id: string } | null = null;
        if (rawGuestToken) {
          const guestTokenHash = this.tokenCrypto.sha256Hex(rawGuestToken);
          existingGuestCart = await tx.cart.findFirst({
            where: { guestTokenHash, status: CartStatus.ACTIVE },
            select: { id: true },
          });
        }

        if (existingGuestCart) {
          cartId = existingGuestCart.id;
        } else {
          const newRawToken = this.tokenCrypto.generateOpaqueToken(
            CART_POLICY.GUEST_TOKEN_BYTES,
          );
          const newTokenHash = this.tokenCrypto.sha256Hex(newRawToken);
          const createdGuestCart = await tx.cart.create({
            data: {
              guestTokenHash: newTokenHash,
              status: CartStatus.ACTIVE,
              currency: 'IDR',
            },
            select: { id: true },
          });
          cartId = createdGuestCart.id;
          mintedGuestToken = newRawToken;
        }
      }

      const variant = await tx.productVariant.findFirst({
        where: {
          id: body.variantId,
          deletedAt: null,
        },
        include: VARIANT_AVAILABILITY_INCLUDE,
      });

      if (!variant || variant.product.deletedAt !== null) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'PRODUCT_UNAVAILABLE',
          'Product variant was not found',
        );
      }

      if (
        variant.product.status !== ProductStatus.PUBLISHED ||
        !variant.product.isVisible
      ) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'PRODUCT_UNAVAILABLE',
          'This product is not available for purchase',
        );
      }

      if (!variant.isActive) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'VARIANT_NOT_ACTIVE',
          'Selected variant is not active',
        );
      }

      const stock = computeAggregateStock(variant.inventoryLevels);
      const normalizedConfig = canonicalizeConfiguration(body.configuration ?? {});
      const configurationHash = this.tokenCrypto.sha256Hex(
        canonicalJsonStringify(normalizedConfig),
      );

      const existingLine = await tx.cartItem.findUnique({
        where: {
          cartId_variantId_configurationHash: {
            cartId,
            variantId: variant.id,
            configurationHash,
          },
        },
        select: {
          id: true,
          quantity: true,
        },
      });

      const nextQuantity = (existingLine?.quantity ?? 0) + body.quantity;

      if (nextQuantity > CART_POLICY.MAX_LINE_QUANTITY) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'QUANTITY_LIMIT_EXCEEDED',
          `Maximum quantity per cart line is ${CART_POLICY.MAX_LINE_QUANTITY}`,
        );
      }

      if (stock.availableQty <= 0) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'OUT_OF_STOCK',
          'Selected variant is currently out of stock',
        );
      }

      if (nextQuantity > stock.availableQty) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'INSUFFICIENT_STOCK',
          `Only ${stock.availableQty} unit(s) currently available in stock`,
        );
      }

      if (existingLine) {
        await tx.cartItem.update({
          where: { id: existingLine.id },
          data: { quantity: nextQuantity },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartId,
            variantId: variant.id,
            quantity: nextQuantity,
            configuration: normalizedConfig as Prisma.InputJsonValue,
            configurationHash,
          },
        });
      }

      await tx.cart.update({
        where: { id: cartId },
        data: { updatedAt: new Date() },
      });

      return this.loadHydratedCartById(cartId, tx);
    });

    if (mintedGuestToken) {
      this.setGuestCartCookie(res, mintedGuestToken);
    }

    return cartDto;
  }

  async updateItem(
    req: HttpRequestLike,
    itemId: string,
    body: UpdateCartItemRequest,
  ): Promise<CartDto> {
    const userId = await this.resolveOptionalCustomerUserId(req);
    const rawGuestToken = userId ? undefined : this.readGuestCartCookie(req);

    return this.prisma.withTransaction(async (tx) => {
      let cartId: string | null = null;
      if (userId) {
        const cart = await tx.cart.findFirst({
          where: { userId, status: CartStatus.ACTIVE },
          select: { id: true },
        });
        cartId = cart?.id ?? null;
      } else if (rawGuestToken) {
        const guestTokenHash = this.tokenCrypto.sha256Hex(rawGuestToken);
        const cart = await tx.cart.findFirst({
          where: { guestTokenHash, status: CartStatus.ACTIVE },
          select: { id: true },
        });
        cartId = cart?.id ?? null;
      }

      if (!cartId) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'CART_ITEM_NOT_FOUND',
          'Cart item was not found',
        );
      }

      const existingItem = await tx.cartItem.findFirst({
        where: {
          id: itemId,
          cartId,
        },
        select: {
          id: true,
          variantId: true,
        },
      });

      if (!existingItem) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'CART_ITEM_NOT_FOUND',
          'Cart item was not found',
        );
      }

      if (body.quantity > CART_POLICY.MAX_LINE_QUANTITY) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'QUANTITY_LIMIT_EXCEEDED',
          `Maximum quantity per cart line is ${CART_POLICY.MAX_LINE_QUANTITY}`,
        );
      }

      const variant = await tx.productVariant.findFirst({
        where: {
          id: existingItem.variantId,
          deletedAt: null,
        },
        include: VARIANT_AVAILABILITY_INCLUDE,
      });

      if (
        !variant ||
        variant.product.deletedAt !== null ||
        variant.product.status !== ProductStatus.PUBLISHED ||
        !variant.product.isVisible
      ) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'PRODUCT_UNAVAILABLE',
          'This product is not available for purchase',
        );
      }

      if (!variant.isActive) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'VARIANT_NOT_ACTIVE',
          'Selected variant is not active',
        );
      }

      const stock = computeAggregateStock(variant.inventoryLevels);
      if (stock.availableQty <= 0) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'OUT_OF_STOCK',
          'Selected variant is currently out of stock',
        );
      }

      if (body.quantity > stock.availableQty) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'INSUFFICIENT_STOCK',
          `Only ${stock.availableQty} unit(s) currently available in stock`,
        );
      }

      await tx.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: body.quantity },
      });

      await tx.cart.update({
        where: { id: cartId },
        data: { updatedAt: new Date() },
      });

      return this.loadHydratedCartById(cartId, tx);
    });
  }

  async deleteItem(req: HttpRequestLike, itemId: string): Promise<void> {
    const userId = await this.resolveOptionalCustomerUserId(req);
    const rawGuestToken = userId ? undefined : this.readGuestCartCookie(req);

    await this.prisma.withTransaction(async (tx) => {
      let cartId: string | null = null;
      if (userId) {
        const cart = await tx.cart.findFirst({
          where: { userId, status: CartStatus.ACTIVE },
          select: { id: true },
        });
        cartId = cart?.id ?? null;
      } else if (rawGuestToken) {
        const guestTokenHash = this.tokenCrypto.sha256Hex(rawGuestToken);
        const cart = await tx.cart.findFirst({
          where: { guestTokenHash, status: CartStatus.ACTIVE },
          select: { id: true },
        });
        cartId = cart?.id ?? null;
      }

      if (!cartId) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'CART_ITEM_NOT_FOUND',
          'Cart item was not found',
        );
      }

      const deleted = await tx.cartItem.deleteMany({
        where: {
          id: itemId,
          cartId,
        },
      });

      if (deleted.count === 0) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'CART_ITEM_NOT_FOUND',
          'Cart item was not found',
        );
      }

      await tx.cart.update({
        where: { id: cartId },
        data: { updatedAt: new Date() },
      });
    });
  }

  async mergeGuestCart(params: {
    req: HttpRequestLike;
    res: HttpResponseLike;
    actor: AuthenticatedActor;
    ipAddress: string | null;
  }): Promise<MergeCartResultDto> {
    const { req, res, actor, ipAddress } = params;
    const rawGuestToken = this.readGuestCartCookie(req);
    const cookiePresent = this.hasRawGuestCookie(req);

    try {
      return await this.prisma.withTransaction(async (tx) => {
        if (!rawGuestToken) {
          return {
            merged: false,
            mergedItemCount: 0,
            adjustedItemCount: 0,
            notices: [],
            cart: await this.loadCustomerCart(actor.userId, tx),
          };
        }

        const guestTokenHash = this.tokenCrypto.sha256Hex(rawGuestToken);
        const guestCart = await tx.cart.findFirst({
          where: {
            guestTokenHash,
            status: CartStatus.ACTIVE,
          },
          select: { id: true },
        });

        if (!guestCart) {
          return {
            merged: false,
            mergedItemCount: 0,
            adjustedItemCount: 0,
            notices: [],
            cart: await this.loadCustomerCart(actor.userId, tx),
          };
        }

        const lockedGuestRows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
          SELECT id, status
          FROM carts
          WHERE id = ${guestCart.id}::uuid
            AND status = 'ACTIVE'
          FOR UPDATE
        `;

        if (lockedGuestRows.length === 0) {
          return {
            merged: false,
            mergedItemCount: 0,
            adjustedItemCount: 0,
            notices: [],
            cart: await this.loadCustomerCart(actor.userId, tx),
          };
        }

        const targetCart = await this.findOrCreateCustomerCart(actor.userId, tx);
        if (targetCart.id === guestCart.id) {
          return {
            merged: false,
            mergedItemCount: 0,
            adjustedItemCount: 0,
            notices: [],
            cart: await this.loadHydratedCartById(targetCart.id, tx),
          };
        }

        const [guestItems, targetItems] = await Promise.all([
          tx.cartItem.findMany({
            where: { cartId: guestCart.id },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            include: {
              variant: {
                include: VARIANT_AVAILABILITY_INCLUDE,
              },
            },
          }),
          tx.cartItem.findMany({
            where: { cartId: targetCart.id },
          }),
        ]);

        const targetByKey = new Map(
          targetItems.map((item) => [
            `${item.variantId}:${item.configurationHash}`,
            item,
          ]),
        );

        let mergedItemCount = 0;
        let adjustedItemCount = 0;
        const notices: string[] = [];

        for (const guestItem of guestItems) {
          const variant = guestItem.variant;
          const product = variant.product;
          const isPublishable =
            product.deletedAt === null &&
            product.status === ProductStatus.PUBLISHED &&
            product.isVisible;
          const isVariantActive = variant.deletedAt === null && variant.isActive;
          const stock = computeAggregateStock(variant.inventoryLevels);

          const key = `${guestItem.variantId}:${guestItem.configurationHash}`;
          const existingTarget = targetByKey.get(key);
          const existingQty = existingTarget?.quantity ?? 0;
          const desiredQty = existingQty + guestItem.quantity;

          if (!isPublishable || !isVariantActive || stock.availableQty <= 0) {
            adjustedItemCount += 1;
            if (!existingTarget) {
              notices.push(
                `SKU ${variant.sku} was skipped during cart merge because it is currently unavailable or out of stock.`,
              );
            } else {
              notices.push(
                `SKU ${variant.sku} could not increase quantity during cart merge because it is currently unavailable or out of stock.`,
              );
            }
            continue;
          }

          const maxAllowed = Math.min(
            stock.availableQty,
            CART_POLICY.MAX_LINE_QUANTITY,
          );
          const nextQty = Math.min(desiredQty, maxAllowed);

          if (nextQty < desiredQty) {
            adjustedItemCount += 1;
            notices.push(
              `SKU ${variant.sku} quantity was adjusted to ${nextQty} (requested ${desiredQty}, ${stock.availableQty} available).`,
            );
          }

          if (nextQty > existingQty) {
            mergedItemCount += 1;
            if (existingTarget) {
              const updated = await tx.cartItem.update({
                where: { id: existingTarget.id },
                data: { quantity: nextQty },
              });
              targetByKey.set(key, updated);
            } else {
              const created = await tx.cartItem.create({
                data: {
                  cartId: targetCart.id,
                  variantId: guestItem.variantId,
                  quantity: nextQty,
                  configuration: guestItem.configuration as Prisma.InputJsonValue,
                  configurationHash: guestItem.configurationHash,
                },
              });
              targetByKey.set(key, created);
            }
          }
        }

        await tx.cartItem.deleteMany({
          where: { cartId: guestCart.id },
        });

        await tx.cart.update({
          where: { id: guestCart.id },
          data: {
            status: CartStatus.MERGED,
            mergedIntoCartId: targetCart.id,
          },
        });

        await tx.cart.update({
          where: { id: targetCart.id },
          data: { updatedAt: new Date() },
        });

        await this.auditLogService.record(
          {
            actorId: actor.userId,
            actorRole: actor.roles[0] ?? 'CUSTOMER',
            action: 'cart.merged',
            resource: 'cart',
            resourceId: targetCart.id,
            ipAddress,
            beforeState: {
              guestCartId: guestCart.id,
              guestItemCount: guestItems.length,
            },
            afterState: {
              targetCartId: targetCart.id,
              mergedItemCount,
              adjustedItemCount,
              noticesCount: notices.length,
            },
          },
          tx,
        );

        const hydratedCart = await this.loadHydratedCartById(targetCart.id, tx);
        return {
          merged: true,
          mergedItemCount,
          adjustedItemCount,
          notices,
          cart: hydratedCart,
        };
      });
    } finally {
      if (cookiePresent) {
        this.clearGuestCartCookie(res);
      }
    }
  }
}
