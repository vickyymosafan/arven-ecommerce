import type {
  AddCartItemRequest,
  AddOutfitToCartRequest,
  AddOutfitToCartResultDto,
  AddressResponse,
  AuthUserSummary,
  CancelOrderRequest,
  CartDto,
  CategoryNodeDto,
  CheckoutQuoteDto,
  CheckoutQuoteRequest,
  CmsJournalArticleDto,
  CmsLookbookDto,
  CmsPageDto,
  CollectionDetailDto,
  CollectionSummaryDto,
  CreateAddressRequest,
  CreateCustomerReturnRequest,
  CreateOrderRequest,
  CreateOrderResultDto,
  CreateOutfitSceneRequest,
  CreatePaymentSessionRequest,
  ForgotPasswordRequest,
  ListOrdersQuery,
  LoginRequest,
  MergeCartResultDto,
  OrderDetailDto,
  OrderSummaryDto,
  OutfitSceneDto,
  OutfitStudioCatalogDto,
  PaymentSessionDto,
  PaymentSummaryDto,
  Product3DAssetMetadataDto,
  Product3DAssetPublicDto,
  ProductCardDto,
  ProductDetailDto,
  PublicProductsQuery,
  Record3DTelemetryRequest,
  RegisterRequest,
  ResetPasswordRequest,
  ReturnDetailDto,
  ShowroomScenesResponseDto,
  Telemetry3DReceiptDto,
  UpdateAddressRequest,
  UpdateCartItemRequest,
  UpdateOutfitSceneRequest,
  UpdateProfileRequest,
  UserProfileResponse,
  UserSessionSummary,
  ValidateOutfitRequest,
  ValidateOutfitResultDto,
  VerifyEmailRequest,
} from '@arven/contracts';

export interface PaginationMeta {
  requestId: string;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

export type PaginatedResponse<T> = PaginatedResult<T>;

export interface AuthSessionResponse {
  user: AuthUserSummary;
  mfaRequired: boolean;
  sessionExpiresAt: string;
}

export interface ApiErrorDetail {
  field: string;
  issue: string;
}

interface RawSuccessEnvelope<T> {
  success: true;
  data: T;
  meta: {
    requestId: string;
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

interface RawErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
  meta?: {
    requestId?: string;
  };
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: ApiErrorDetail[];

  constructor(params: {
    status: number;
    code: string;
    message: string;
    requestId: string | null;
    details?: ApiErrorDetail[];
  }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.status = params.status;
    this.code = params.code;
    this.requestId = params.requestId;
    this.details = params.details ?? [];
  }
}

export interface AuthMeResponse {
  user: AuthUserSummary;
  mfaRequired: boolean;
}

export interface RegisterCustomerResponse {
  user: AuthUserSummary;
  verificationEmailSent: boolean;
}

let cachedCsrfToken: string | null = null;
let inflightCsrfPromise: Promise<string> | null = null;

export function clearCsrfTokenCache(): void {
  cachedCsrfToken = null;
  inflightCsrfPromise = null;
}

export async function fetchCsrfToken(forceRefresh = false): Promise<string> {
  if (cachedCsrfToken && !forceRefresh) {
    return cachedCsrfToken;
  }
  if (inflightCsrfPromise && !forceRefresh) {
    return inflightCsrfPromise;
  }

  const request = (async () => {
    const response = await fetch('/api/v1/csrf-token', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new ApiClientError({
        status: response.status,
        code: 'CSRF_FETCH_FAILED',
        message: 'Unable to initialize request security token. Please try again.',
        requestId: response.headers.get('x-request-id'),
      });
    }

    const payload = (await response.json()) as RawSuccessEnvelope<{ csrfToken: string }>;
    cachedCsrfToken = payload.data.csrfToken;
    return cachedCsrfToken;
  })();

  inflightCsrfPromise = request;
  try {
    return await request;
  } finally {
    if (inflightCsrfPromise === request) {
      inflightCsrfPromise = null;
    }
  }
}

function isMutatingMethod(method: string): boolean {
  const upper = method.toUpperCase();
  return upper === 'POST' || upper === 'PATCH' || upper === 'PUT' || upper === 'DELETE';
}

function isCsrfFailure(status: number, code: string): boolean {
  return status === 403 && code.toUpperCase().includes('CSRF');
}

async function parseErrorResponse(response: Response): Promise<ApiClientError> {
  const headerRequestId = response.headers.get('x-request-id');
  try {
    const parsed = (await response.json()) as Partial<RawErrorEnvelope>;
    if (parsed && parsed.error && typeof parsed.error.message === 'string') {
      return new ApiClientError({
        status: response.status,
        code: parsed.error.code ?? 'REQUEST_FAILED',
        message: parsed.error.message,
        requestId: parsed.meta?.requestId ?? headerRequestId,
        details: Array.isArray(parsed.error.details) ? parsed.error.details : [],
      });
    }
  } catch {
    // Non-JSON upstream/proxy failure falls through to standard HTTP error
  }

  return new ApiClientError({
    status: response.status,
    code: 'HTTP_ERROR',
    message: `Request failed with status ${response.status}.`,
    requestId: headerRequestId,
  });
}

interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
  guestOrderToken?: string;
}

async function requestEnvelope<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<RawSuccessEnvelope<T>> {
  const method = (options.method ?? 'GET').toUpperCase();
  const mutating = isMutatingMethod(method);

  const execute = async (forceRefreshCsrf: boolean): Promise<Response> => {
    const headers = new Headers();
    headers.set('Accept', 'application/json');

    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

    if (options.idempotencyKey && options.idempotencyKey.trim().length > 0) {
      headers.set('Idempotency-Key', options.idempotencyKey.trim());
    }

    if (options.guestOrderToken && options.guestOrderToken.trim().length > 0) {
      headers.set('X-Guest-Order-Token', options.guestOrderToken.trim());
    }

    if (mutating) {
      const csrfToken = await fetchCsrfToken(forceRefreshCsrf);
      headers.set('x-csrf-token', csrfToken);
    }

    return fetch(path, {
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  };

  let response = await execute(false);

  if (!response.ok && mutating && response.status === 403) {
    const err = await parseErrorResponse(response);
    if (isCsrfFailure(err.status, err.code)) {
      clearCsrfTokenCache();
      response = await execute(true);
      if (!response.ok) {
        throw await parseErrorResponse(response);
      }
    } else {
      throw err;
    }
  } else if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  if (response.status === 204) {
    return {
      success: true,
      data: undefined as T,
      meta: { requestId: response.headers.get('x-request-id') ?? '' },
    };
  }

  return (await response.json()) as RawSuccessEnvelope<T>;
}

async function requestApi<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const envelope = await requestEnvelope<T>(path, options);
  return envelope.data;
}

async function requestVoid(
  path: string,
  options: ApiRequestOptions = {},
): Promise<void> {
  await requestEnvelope<void>(path, options);
}

export function createIdempotencyKey(): string {
  if (typeof globalThis.crypto !== 'undefined') {
    if (typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    if (typeof globalThis.crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
  }
  const timestamp = Date.now().toString(36);
  const randomA = Math.random().toString(36).slice(2, 12);
  const randomB = Math.random().toString(36).slice(2, 12);
  return `arven-${timestamp}-${randomA}${randomB}`.slice(0, 64);
}

const GUEST_ORDER_TOKEN_STORAGE_PREFIX = 'arven:guest-order:';

export function saveGuestOrderToken(orderNumber: string, token: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  const normalizedOrder = orderNumber.trim();
  const normalizedToken = token.trim();
  if (!normalizedOrder || !normalizedToken) {
    return;
  }
  try {
    window.sessionStorage.setItem(
      `${GUEST_ORDER_TOKEN_STORAGE_PREFIX}${normalizedOrder}`,
      normalizedToken,
    );
  } catch {
    // Ignore storage unavailability
  }
}

export function readGuestOrderToken(orderNumber: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const normalizedOrder = orderNumber.trim();
  if (!normalizedOrder) {
    return null;
  }
  try {
    const value = window.sessionStorage.getItem(
      `${GUEST_ORDER_TOKEN_STORAGE_PREFIX}${normalizedOrder}`,
    );
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export const CART_UPDATED_EVENT = 'arven:cart-updated';

export function notifyCartUpdated(cart?: CartDto): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<CartDto | undefined>(CART_UPDATED_EVENT, {
      detail: cart,
    }),
  );
}

export function refreshBagBadge(cart?: CartDto): void {
  notifyCartUpdated(cart);
}

function toQueryString(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && String(value).trim() !== '') {
      search.set(key, String(value).trim());
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export function extractFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiClientError)) {
    return {};
  }
  const map: Record<string, string> = {};
  for (const detail of error.details) {
    if (detail.field && !map[detail.field]) {
      map[detail.field] = detail.issue;
    }
  }
  return map;
}

export const storefrontApi = {
  getCurrentUser(): Promise<AuthMeResponse> {
    return requestApi<AuthMeResponse>('/api/v1/auth/me');
  },
  registerCustomer(input: RegisterRequest): Promise<RegisterCustomerResponse> {
    return requestApi<RegisterCustomerResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: input,
    });
  },
  verifyEmail(input: VerifyEmailRequest): Promise<{ verified: boolean }> {
    return requestApi<{ verified: boolean }>('/api/v1/auth/verify-email', {
      method: 'POST',
      body: input,
    });
  },
  async loginCustomer(input: LoginRequest): Promise<AuthSessionResponse> {
    const result = await requestApi<AuthSessionResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: input,
    });
    clearCsrfTokenCache();
    return result;
  },
  async logout(): Promise<{ loggedOut: boolean }> {
    const result = await requestApi<{ loggedOut: boolean }>('/api/v1/auth/logout', {
      method: 'POST',
    });
    clearCsrfTokenCache();
    return result;
  },
  async logoutAll(): Promise<{ loggedOutAll: boolean }> {
    const result = await requestApi<{ loggedOutAll: boolean }>('/api/v1/auth/logout-all', {
      method: 'POST',
    });
    clearCsrfTokenCache();
    return result;
  },
  forgotPassword(input: ForgotPasswordRequest): Promise<{ accepted: boolean }> {
    return requestApi<{ accepted: boolean }>('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: input,
    });
  },
  resetPassword(input: ResetPasswordRequest): Promise<{ reset: boolean }> {
    return requestApi<{ reset: boolean }>('/api/v1/auth/reset-password', {
      method: 'POST',
      body: input,
    });
  },
  getProfile(): Promise<UserProfileResponse> {
    return requestApi<UserProfileResponse>('/api/v1/users/me');
  },
  updateProfile(input: UpdateProfileRequest): Promise<UserProfileResponse> {
    return requestApi<UserProfileResponse>('/api/v1/users/me', {
      method: 'PATCH',
      body: input,
    });
  },
  listAddresses(): Promise<AddressResponse[]> {
    return requestApi<AddressResponse[]>('/api/v1/users/me/addresses');
  },
  createAddress(input: CreateAddressRequest): Promise<AddressResponse> {
    return requestApi<AddressResponse>('/api/v1/users/me/addresses', {
      method: 'POST',
      body: input,
    });
  },
  updateAddress(id: string, input: UpdateAddressRequest): Promise<AddressResponse> {
    return requestApi<AddressResponse>(`/api/v1/users/me/addresses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
    });
  },
  deleteAddress(id: string): Promise<void> {
    return requestApi<void>(`/api/v1/users/me/addresses/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  listSessions(): Promise<UserSessionSummary[]> {
    return requestApi<UserSessionSummary[]>('/api/v1/users/me/sessions');
  },
  revokeSession(id: string): Promise<void> {
    return requestApi<void>(`/api/v1/users/me/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  getCategories(): Promise<CategoryNodeDto[]> {
    return requestApi<CategoryNodeDto[]>('/api/v1/categories');
  },
  getCollections(): Promise<CollectionSummaryDto[]> {
    return requestApi<CollectionSummaryDto[]>('/api/v1/collections');
  },
  getCollectionBySlug(slug: string): Promise<CollectionDetailDto> {
    return requestApi<CollectionDetailDto>(`/api/v1/collections/${encodeURIComponent(slug)}`);
  },
  async getProducts(
    query: Partial<PublicProductsQuery> = {},
  ): Promise<PaginatedResult<ProductCardDto>> {
    const qs = toQueryString({
      page: query.page,
      limit: query.limit,
      category: query.category,
      collection: query.collection,
      size: query.size,
      color: query.color,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      inStock: query.inStock,
      featured: query.featured,
      q: query.q,
      sort: query.sort,
    });
    const envelope = await requestEnvelope<ProductCardDto[]>(`/api/v1/products${qs}`);
    return {
      items: envelope.data,
      meta: {
        requestId: envelope.meta.requestId,
        page: envelope.meta.page ?? 1,
        limit: envelope.meta.limit ?? 12,
        total: envelope.meta.total ?? envelope.data.length,
        totalPages: envelope.meta.totalPages ?? 1,
      },
    };
  },
  getProductBySlug(slug: string): Promise<ProductDetailDto> {
    return requestApi<ProductDetailDto>(`/api/v1/products/${encodeURIComponent(slug)}`);
  },
  async getProduct3DAssets(idOrSlug: string): Promise<Product3DAssetPublicDto | null> {
    try {
      return await requestApi<Product3DAssetPublicDto>(
        `/api/v1/products/${encodeURIComponent(idOrSlug)}/3d-assets`,
      );
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        return null;
      }
      throw err;
    }
  },
  get3DAssetMetadata(assetId: string): Promise<Product3DAssetMetadataDto> {
    return requestApi<Product3DAssetMetadataDto>(
      `/api/v1/3d-assets/${encodeURIComponent(assetId)}/metadata`,
    );
  },
  record3DTelemetry(input: Record3DTelemetryRequest): Promise<Telemetry3DReceiptDto> {
    return requestApi<Telemetry3DReceiptDto>('/api/v1/3d-assets/telemetry', {
      method: 'POST',
      body: input,
    });
  },
  getCart(): Promise<CartDto> {
    return requestApi<CartDto>('/api/v1/cart');
  },
  addCartItem(input: AddCartItemRequest): Promise<CartDto> {
    return requestApi<CartDto>('/api/v1/cart/items', {
      method: 'POST',
      body: input,
    });
  },
  updateCartItem(itemId: string, input: UpdateCartItemRequest): Promise<CartDto> {
    return requestApi<CartDto>(`/api/v1/cart/items/${encodeURIComponent(itemId)}`, {
      method: 'PATCH',
      body: input,
    });
  },
  removeCartItem(itemId: string): Promise<void> {
    return requestVoid(`/api/v1/cart/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
    });
  },
  mergeGuestCart(): Promise<MergeCartResultDto> {
    return requestApi<MergeCartResultDto>('/api/v1/cart/merge', {
      method: 'POST',
    });
  },
  quoteCheckout(input: CheckoutQuoteRequest): Promise<CheckoutQuoteDto> {
    return requestApi<CheckoutQuoteDto>('/api/v1/checkout/quote', {
      method: 'POST',
      body: input,
    });
  },
  async createOrder(
    input: CreateOrderRequest,
    idempotencyKey: string,
  ): Promise<CreateOrderResultDto> {
    const result = await requestApi<CreateOrderResultDto>('/api/v1/checkout/orders', {
      method: 'POST',
      body: input,
      idempotencyKey,
    });
    notifyCartUpdated();
    return result;
  },
  async listMyOrders(
    query: Partial<ListOrdersQuery> = {},
  ): Promise<PaginatedResponse<OrderSummaryDto>> {
    const qs = toQueryString({
      page: query.page,
      limit: query.limit,
      status: query.status,
    });
    const envelope = await requestEnvelope<OrderSummaryDto[]>(`/api/v1/orders${qs}`);
    return {
      items: envelope.data,
      meta: {
        requestId: envelope.meta.requestId,
        page: envelope.meta.page ?? 1,
        limit: envelope.meta.limit ?? 20,
        total: envelope.meta.total ?? envelope.data.length,
        totalPages: envelope.meta.totalPages ?? 1,
      },
    };
  },
  getOrderDetail(orderNumber: string, guestToken?: string): Promise<OrderDetailDto> {
    return requestApi<OrderDetailDto>(`/api/v1/orders/${encodeURIComponent(orderNumber)}`, {
      guestOrderToken: guestToken,
    });
  },
  cancelOrder(
    orderId: string,
    idempotencyKey: string,
    input: CancelOrderRequest = {},
    guestToken?: string,
  ): Promise<OrderDetailDto> {
    return requestApi<OrderDetailDto>(`/api/v1/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: 'POST',
      body: input,
      idempotencyKey,
      guestOrderToken: guestToken,
    });
  },
  createPaymentSession(
    orderId: string,
    idempotencyKey: string,
    input: CreatePaymentSessionRequest = {},
    guestToken?: string,
  ): Promise<PaymentSessionDto> {
    return requestApi<PaymentSessionDto>(
      `/api/v1/payments/${encodeURIComponent(orderId)}/session`,
      {
        method: 'POST',
        body: input,
        idempotencyKey,
        guestOrderToken: guestToken,
      },
    );
  },
  getPaymentSummary(paymentId: string, guestToken?: string): Promise<PaymentSummaryDto> {
    return requestApi<PaymentSummaryDto>(`/api/v1/payments/${encodeURIComponent(paymentId)}`, {
      guestOrderToken: guestToken,
    });
  },
  async getCmsLookbooks(
    query: { page?: number; limit?: number } = {},
  ): Promise<PaginatedResult<CmsLookbookDto>> {
    const qs = toQueryString({ page: query.page, limit: query.limit });
    const envelope = await requestEnvelope<CmsLookbookDto[]>(`/api/v1/cms/lookbooks${qs}`);
    return {
      items: envelope.data,
      meta: {
        requestId: envelope.meta.requestId,
        page: envelope.meta.page ?? 1,
        limit: envelope.meta.limit ?? 20,
        total: envelope.meta.total ?? envelope.data.length,
        totalPages: envelope.meta.totalPages ?? 1,
      },
    };
  },
  getCmsLookbookBySlug(slug: string): Promise<CmsLookbookDto> {
    return requestApi<CmsLookbookDto>(`/api/v1/cms/lookbooks/${encodeURIComponent(slug)}`);
  },
  async getCmsJournal(
    query: { page?: number; limit?: number } = {},
  ): Promise<PaginatedResult<CmsJournalArticleDto>> {
    const qs = toQueryString({ page: query.page, limit: query.limit });
    const envelope = await requestEnvelope<CmsJournalArticleDto[]>(`/api/v1/cms/journal${qs}`);
    return {
      items: envelope.data,
      meta: {
        requestId: envelope.meta.requestId,
        page: envelope.meta.page ?? 1,
        limit: envelope.meta.limit ?? 20,
        total: envelope.meta.total ?? envelope.data.length,
        totalPages: envelope.meta.totalPages ?? 1,
      },
    };
  },
  getCmsJournalBySlug(slug: string): Promise<CmsJournalArticleDto> {
    return requestApi<CmsJournalArticleDto>(`/api/v1/cms/journal/${encodeURIComponent(slug)}`);
  },
  getCmsPageBySlug(slug: string): Promise<CmsPageDto> {
    return requestApi<CmsPageDto>(`/api/v1/cms/pages/${encodeURIComponent(slug)}`);
  },
  createCustomerReturn(
    orderId: string,
    input: CreateCustomerReturnRequest,
    idempotencyKey: string,
    guestToken?: string,
  ): Promise<ReturnDetailDto> {
    return requestApi<ReturnDetailDto>(
      `/api/v1/orders/${encodeURIComponent(orderId)}/returns`,
      {
        method: 'POST',
        body: input,
        idempotencyKey,
        guestOrderToken: guestToken,
      },
    );
  },
  async listMyReturns(
    query: { page?: number; limit?: number } = {},
  ): Promise<PaginatedResult<ReturnDetailDto>> {
    const qs = toQueryString({ page: query.page, limit: query.limit });
    const envelope = await requestEnvelope<ReturnDetailDto[]>(`/api/v1/returns${qs}`);
    return {
      items: envelope.data,
      meta: {
        requestId: envelope.meta.requestId,
        page: envelope.meta.page ?? 1,
        limit: envelope.meta.limit ?? 20,
        total: envelope.meta.total ?? envelope.data.length,
        totalPages: envelope.meta.totalPages ?? 1,
      },
    };
  },
  getReturnById(returnId: string, guestToken?: string): Promise<ReturnDetailDto> {
    return requestApi<ReturnDetailDto>(`/api/v1/returns/${encodeURIComponent(returnId)}`, {
      guestOrderToken: guestToken,
    });
  },
  showroom: {
    getScenes(): Promise<ShowroomScenesResponseDto> {
      return requestApi<ShowroomScenesResponseDto>('/api/v1/showroom/scenes');
    },
  },
  outfitStudio: {
    getCatalog(): Promise<OutfitStudioCatalogDto> {
      return requestApi<OutfitStudioCatalogDto>('/api/v1/outfit-studio/catalog');
    },
    validate(input: ValidateOutfitRequest): Promise<ValidateOutfitResultDto> {
      return requestApi<ValidateOutfitResultDto>('/api/v1/outfit-studio/validate', {
        method: 'POST',
        body: input,
      });
    },
    async addToCart(input: AddOutfitToCartRequest): Promise<AddOutfitToCartResultDto> {
      const result = await requestApi<AddOutfitToCartResultDto>(
        '/api/v1/outfit-studio/cart-items',
        {
          method: 'POST',
          body: input,
        },
      );
      refreshBagBadge(result.cart);
      return result;
    },
  },
  outfitScenes: {
    list(): Promise<OutfitSceneDto[]> {
      return requestApi<OutfitSceneDto[]>('/api/v1/outfit-scenes');
    },
    get(id: string): Promise<OutfitSceneDto> {
      return requestApi<OutfitSceneDto>(`/api/v1/outfit-scenes/${encodeURIComponent(id)}`);
    },
    create(input: CreateOutfitSceneRequest): Promise<OutfitSceneDto> {
      return requestApi<OutfitSceneDto>('/api/v1/outfit-scenes', {
        method: 'POST',
        body: input,
      });
    },
    update(id: string, input: UpdateOutfitSceneRequest): Promise<OutfitSceneDto> {
      return requestApi<OutfitSceneDto>(`/api/v1/outfit-scenes/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: input,
      });
    },
    remove(id: string): Promise<void> {
      return requestVoid(`/api/v1/outfit-scenes/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    },
  },
};
