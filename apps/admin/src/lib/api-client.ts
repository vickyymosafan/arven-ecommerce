import type {
  AdminCategoryDto,
  AdminCmsListQuery,
  AdminCollectionDto,
  AdminCouponDto,
  AdminCouponsQuery,
  AdminCreateShipmentRequest,
  AdminInventoryLevelDto,
  AdminInventoryLevelsQuery,
  AdminInventoryMovementDto,
  AdminInventoryMovementsQuery,
  AdminLoginRequest,
  AdminOrderDetailDto,
  AdminOrderSummaryDto,
  AdminOrdersQuery,
  AdminProductDetailDto,
  AdminProductSummaryDto,
  AdminProductVariantDto,
  AdminProductsQuery,
  AdminRefundsQuery,
  AdminReturnsQuery,
  AdminSalesAnalyticsDto,
  AdminStockMovementResultDto,
  AdminStockReservationDto,
  AdminStockReservationsQuery,
  AdminTransitionOrderRequest,
  AdminUserSummaryDto,
  AnalyticsSalesQuery,
  ApproveRefundInput,
  ApproveReturnRequest,
  AuditLogEntryDto,
  AuthUserSummary,
  CmsJournalArticleDto,
  CmsLookbookDto,
  CmsPageDto,
  CreateAdminStockMovementRequest,
  CreateCategoryRequest,
  CreateCmsJournalRequest,
  CreateCmsLookbookRequest,
  CreateCmsPageRequest,
  CreateCollectionRequest,
  CreateCouponRequest,
  CreateProductMediaRequest,
  CreateProductRequest,
  CreateProductVariantRequest,
  MfaSetupResponse,
  MfaVerifyRequest,
  ProductMediaDto,
  ReceiveReturnRequest,
  RefundDto,
  RequestRefundInput,
  ReturnDetailDto,
  ReviewReturnRequest,
  RoleSummaryDto,
  ShipmentDto,
  TransitionCmsStatusRequest,
  TransitionProductStatusRequest,
  UpdateCategoryRequest,
  UpdateCmsJournalRequest,
  UpdateCmsLookbookRequest,
  UpdateCmsPageRequest,
  UpdateCollectionRequest,
  UpdateCouponRequest,
  UpdateProductMediaRequest,
  UpdateProductRequest,
  UpdateProductVariantRequest,
} from '@arven/contracts';
import type {
  AssignUserRolesRequest,
  CreateRoleRequest,
  UpdateRoleRequest,
  UpdateUserStatusRequest,
} from '@arven/validators';

export interface ApiErrorDetail {
  field: string;
  issue: string;
}

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

export class AdminApiClientError extends Error {
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
    this.name = 'AdminApiClientError';
    this.status = params.status;
    this.code = params.code;
    this.requestId = params.requestId;
    this.details = params.details ?? [];
  }

  get isMfaStepUpRequired(): boolean {
    return this.status === 403 && this.code === 'MFA_STEP_UP_REQUIRED';
  }
}

export type { MfaSetupResponse };

export interface AdminLoginResponse {
  user: AuthUserSummary;
  mfaRequired: boolean;
  mfaSetupRequired?: boolean;
  sessionExpiresAt: string;
}

export interface AdminAuthMeResponse {
  user: AuthUserSummary;
  mfaRequired: boolean;
}

export interface MfaVerifyResponse {
  verified: boolean;
  mfaVerifiedAt: string;
  user: AuthUserSummary;
  recoveryCodes?: string[];
}

export interface LiveHealthResponse {
  status: string;
  service: string;
  timestampUtc: string;
}

export interface ReadyHealthCheckResult {
  httpStatus: number;
  ok: boolean;
  data?: {
    status: string;
    checks?: {
      postgres?: string;
      redis?: string;
    };
    timestampUtc?: string;
  };
  errorMessage?: string;
  requestId: string | null;
}

let cachedCsrfToken: string | null = null;

export function clearAdminCsrfTokenCache(): void {
  cachedCsrfToken = null;
}

export async function fetchAdminCsrfToken(forceRefresh = false): Promise<string> {
  if (cachedCsrfToken && !forceRefresh) {
    return cachedCsrfToken;
  }

  const response = await fetch('/api/v1/csrf-token', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new AdminApiClientError({
      status: response.status,
      code: 'CSRF_FETCH_FAILED',
      message: 'Unable to obtain CSRF security token.',
      requestId: response.headers.get('x-request-id'),
    });
  }

  const payload = (await response.json()) as RawSuccessEnvelope<{ csrfToken: string }>;
  cachedCsrfToken = payload.data.csrfToken;
  return cachedCsrfToken;
}

function isMutatingMethod(method: string): boolean {
  const upper = method.toUpperCase();
  return upper === 'POST' || upper === 'PATCH' || upper === 'PUT' || upper === 'DELETE';
}

function isCsrfFailure(status: number, code: string): boolean {
  return status === 403 && code.toUpperCase().includes('CSRF');
}

async function parseErrorResponse(response: Response): Promise<AdminApiClientError> {
  const headerRequestId = response.headers.get('x-request-id');
  try {
    const parsed = (await response.json()) as Partial<RawErrorEnvelope>;
    if (parsed && parsed.error && typeof parsed.error.message === 'string') {
      return new AdminApiClientError({
        status: response.status,
        code: parsed.error.code ?? 'REQUEST_FAILED',
        message: parsed.error.message,
        requestId: parsed.meta?.requestId ?? headerRequestId,
        details: Array.isArray(parsed.error.details) ? parsed.error.details : [],
      });
    }
  } catch {
    // Non-JSON upstream failure
  }

  return new AdminApiClientError({
    status: response.status,
    code: 'HTTP_ERROR',
    message: `Request failed with status ${response.status}.`,
    requestId: headerRequestId,
  });
}

export function generateIdempotencyKey(prefix = 'admin-inv'): string {
  const sanitizedPrefix = prefix.replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 32) || 'admin-inv';
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  return `${sanitizedPrefix}:${uuid}`;
}

async function requestAdminEnvelope<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    extraHeaders?: Record<string, string>;
  } = {},
): Promise<RawSuccessEnvelope<T>> {
  const method = (options.method ?? 'GET').toUpperCase();
  const mutating = isMutatingMethod(method);

  const execute = async (forceRefreshCsrf: boolean): Promise<Response> => {
    const headers = new Headers();
    headers.set('Accept', 'application/json');

    if (options.extraHeaders) {
      for (const [key, value] of Object.entries(options.extraHeaders)) {
        headers.set(key, value);
      }
    }

    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

    if (mutating) {
      const csrfToken = await fetchAdminCsrfToken(forceRefreshCsrf);
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
      clearAdminCsrfTokenCache();
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

async function requestAdminApi<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    extraHeaders?: Record<string, string>;
  } = {},
): Promise<T> {
  const envelope = await requestAdminEnvelope<T>(path, options);
  return envelope.data;
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

export function extractAdminFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof AdminApiClientError)) {
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

export const adminApi = {
  getMe(): Promise<AdminAuthMeResponse> {
    return requestAdminApi<AdminAuthMeResponse>('/api/v1/auth/me');
  },
  async loginAdmin(input: AdminLoginRequest): Promise<AdminLoginResponse> {
    const result = await requestAdminApi<AdminLoginResponse>('/api/v1/auth/admin/login', {
      method: 'POST',
      body: input,
    });
    clearAdminCsrfTokenCache();
    return result;
  },
  setupMfa(): Promise<MfaSetupResponse> {
    return requestAdminApi<MfaSetupResponse>('/api/v1/auth/mfa/setup', {
      method: 'POST',
    });
  },
  verifyMfa(input: MfaVerifyRequest): Promise<MfaVerifyResponse> {
    return requestAdminApi<MfaVerifyResponse>('/api/v1/auth/mfa/verify', {
      method: 'POST',
      body: input,
    });
  },
  async logout(): Promise<{ loggedOut: boolean }> {
    const result = await requestAdminApi<{ loggedOut: boolean }>('/api/v1/auth/logout', {
      method: 'POST',
    });
    clearAdminCsrfTokenCache();
    return result;
  },
  async logoutAll(): Promise<{ loggedOutAll: boolean }> {
    const result = await requestAdminApi<{ loggedOutAll: boolean }>('/api/v1/auth/logout-all', {
      method: 'POST',
    });
    clearAdminCsrfTokenCache();
    return result;
  },
  listRoles(): Promise<RoleSummaryDto[]> {
    return requestAdminApi<RoleSummaryDto[]>('/api/v1/admin/roles');
  },
  createRole(input: CreateRoleRequest): Promise<RoleSummaryDto> {
    return requestAdminApi<RoleSummaryDto>('/api/v1/admin/roles', {
      method: 'POST',
      body: input,
    });
  },
  updateRole(id: string, input: UpdateRoleRequest): Promise<RoleSummaryDto> {
    return requestAdminApi<RoleSummaryDto>(`/api/v1/admin/roles/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: input,
    });
  },
  deleteRole(id: string): Promise<void> {
    return requestAdminApi<void>(`/api/v1/admin/roles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  async listUsers(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    roleCode?: string;
  } = {}): Promise<PaginatedResult<AdminUserSummaryDto>> {
    const qs = toQueryString(query);
    const envelope = await requestAdminEnvelope<AdminUserSummaryDto[]>(`/api/v1/admin/users${qs}`);
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
  assignUserRoles(id: string, input: AssignUserRolesRequest): Promise<AdminUserSummaryDto> {
    return requestAdminApi<AdminUserSummaryDto>(
      `/api/v1/admin/users/${encodeURIComponent(id)}/roles`,
      {
        method: 'PATCH',
        body: input,
      },
    );
  },
  updateUserStatus(id: string, input: UpdateUserStatusRequest): Promise<AdminUserSummaryDto> {
    return requestAdminApi<AdminUserSummaryDto>(
      `/api/v1/admin/users/${encodeURIComponent(id)}/status`,
      {
        method: 'PATCH',
        body: input,
      },
    );
  },
  async listAuditLogs(query: {
    page?: number;
    limit?: number;
    actorId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    from?: string;
    to?: string;
  } = {}): Promise<PaginatedResult<AuditLogEntryDto>> {
    const qs = toQueryString(query);
    const envelope = await requestAdminEnvelope<AuditLogEntryDto[]>(
      `/api/v1/admin/audit-logs${qs}`,
    );
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
  async listProducts(
    query: Partial<AdminProductsQuery> = {},
  ): Promise<PaginatedResult<AdminProductSummaryDto>> {
    const qs = toQueryString({
      page: query.page,
      limit: query.limit,
      status: query.status,
      category: query.category,
      collection: query.collection,
      q: query.q,
    });
    const envelope = await requestAdminEnvelope<AdminProductSummaryDto[]>(
      `/api/v1/admin/products${qs}`,
    );
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
  getProductById(id: string): Promise<AdminProductDetailDto> {
    return requestAdminApi<AdminProductDetailDto>(
      `/api/v1/admin/products/${encodeURIComponent(id)}`,
    );
  },
  createProduct(input: CreateProductRequest): Promise<AdminProductDetailDto> {
    return requestAdminApi<AdminProductDetailDto>('/api/v1/admin/products', {
      method: 'POST',
      body: input,
    });
  },
  updateProduct(id: string, input: UpdateProductRequest): Promise<AdminProductDetailDto> {
    return requestAdminApi<AdminProductDetailDto>(
      `/api/v1/admin/products/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: input,
      },
    );
  },
  deleteProduct(id: string): Promise<void> {
    return requestAdminApi<void>(`/api/v1/admin/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  transitionProductStatus(
    id: string,
    input: TransitionProductStatusRequest,
  ): Promise<AdminProductDetailDto> {
    return requestAdminApi<AdminProductDetailDto>(
      `/api/v1/admin/products/${encodeURIComponent(id)}/transition`,
      {
        method: 'POST',
        body: input,
      },
    );
  },
  createVariant(
    productId: string,
    input: CreateProductVariantRequest,
  ): Promise<AdminProductVariantDto> {
    return requestAdminApi<AdminProductVariantDto>(
      `/api/v1/admin/products/${encodeURIComponent(productId)}/variants`,
      {
        method: 'POST',
        body: input,
      },
    );
  },
  updateVariant(
    productId: string,
    variantId: string,
    input: UpdateProductVariantRequest,
  ): Promise<AdminProductVariantDto> {
    return requestAdminApi<AdminProductVariantDto>(
      `/api/v1/admin/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
      {
        method: 'PATCH',
        body: input,
      },
    );
  },
  deleteVariant(productId: string, variantId: string): Promise<void> {
    return requestAdminApi<void>(
      `/api/v1/admin/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`,
      {
        method: 'DELETE',
      },
    );
  },
  createMedia(
    productId: string,
    input: CreateProductMediaRequest,
  ): Promise<ProductMediaDto> {
    return requestAdminApi<ProductMediaDto>(
      `/api/v1/admin/products/${encodeURIComponent(productId)}/media`,
      {
        method: 'POST',
        body: input,
      },
    );
  },
  updateMedia(
    productId: string,
    mediaId: string,
    input: UpdateProductMediaRequest,
  ): Promise<ProductMediaDto> {
    return requestAdminApi<ProductMediaDto>(
      `/api/v1/admin/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(mediaId)}`,
      {
        method: 'PATCH',
        body: input,
      },
    );
  },
  deleteMedia(productId: string, mediaId: string): Promise<void> {
    return requestAdminApi<void>(
      `/api/v1/admin/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(mediaId)}`,
      {
        method: 'DELETE',
      },
    );
  },
  listCategories(): Promise<AdminCategoryDto[]> {
    return requestAdminApi<AdminCategoryDto[]>('/api/v1/admin/categories');
  },
  createCategory(input: CreateCategoryRequest): Promise<AdminCategoryDto> {
    return requestAdminApi<AdminCategoryDto>('/api/v1/admin/categories', {
      method: 'POST',
      body: input,
    });
  },
  updateCategory(id: string, input: UpdateCategoryRequest): Promise<AdminCategoryDto> {
    return requestAdminApi<AdminCategoryDto>(
      `/api/v1/admin/categories/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: input,
      },
    );
  },
  deleteCategory(id: string): Promise<void> {
    return requestAdminApi<void>(`/api/v1/admin/categories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  listCollections(): Promise<AdminCollectionDto[]> {
    return requestAdminApi<AdminCollectionDto[]>('/api/v1/admin/collections');
  },
  createCollection(input: CreateCollectionRequest): Promise<AdminCollectionDto> {
    return requestAdminApi<AdminCollectionDto>('/api/v1/admin/collections', {
      method: 'POST',
      body: input,
    });
  },
  updateCollection(id: string, input: UpdateCollectionRequest): Promise<AdminCollectionDto> {
    return requestAdminApi<AdminCollectionDto>(
      `/api/v1/admin/collections/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: input,
      },
    );
  },
  deleteCollection(id: string): Promise<void> {
    return requestAdminApi<void>(`/api/v1/admin/collections/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  async listInventoryLevels(
    query: Partial<AdminInventoryLevelsQuery> = {},
  ): Promise<PaginatedResult<AdminInventoryLevelDto>> {
    const qs = toQueryString({
      page: query.page,
      limit: query.limit,
      q: query.q,
      warehouseCode: query.warehouseCode,
      lowStockOnly: query.lowStockOnly,
    });
    const envelope = await requestAdminEnvelope<AdminInventoryLevelDto[]>(
      `/api/v1/admin/inventory/levels${qs}`,
    );
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
  async listInventoryMovements(
    query: Partial<AdminInventoryMovementsQuery> = {},
  ): Promise<PaginatedResult<AdminInventoryMovementDto>> {
    const qs = toQueryString({
      page: query.page,
      limit: query.limit,
      variantId: query.variantId,
      warehouseCode: query.warehouseCode,
      type: query.type,
      referenceType: query.referenceType,
      from: query.from,
      to: query.to,
    });
    const envelope = await requestAdminEnvelope<AdminInventoryMovementDto[]>(
      `/api/v1/admin/inventory/movements${qs}`,
    );
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
  async listStockReservations(
    query: Partial<AdminStockReservationsQuery> = {},
  ): Promise<PaginatedResult<AdminStockReservationDto>> {
    const qs = toQueryString({
      page: query.page,
      limit: query.limit,
      status: query.status,
      variantId: query.variantId,
      warehouseCode: query.warehouseCode,
    });
    const envelope = await requestAdminEnvelope<AdminStockReservationDto[]>(
      `/api/v1/admin/inventory/reservations${qs}`,
    );
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
  createStockMovement(
    input: CreateAdminStockMovementRequest,
    idempotencyKey = generateIdempotencyKey('admin-inv'),
  ): Promise<AdminStockMovementResultDto> {
    return requestAdminApi<AdminStockMovementResultDto>('/api/v1/admin/stock-movements', {
      method: 'POST',
      body: input,
      extraHeaders: {
        'Idempotency-Key': idempotencyKey,
      },
    });
  },
  getSalesAnalytics(query: Partial<AnalyticsSalesQuery> = {}): Promise<AdminSalesAnalyticsDto> {
    const qs = toQueryString({ days: query.days });
    return requestAdminApi<AdminSalesAnalyticsDto>(`/api/v1/admin/analytics/sales${qs}`);
  },
  async listOrders(
    query: Partial<AdminOrdersQuery> = {},
  ): Promise<PaginatedResult<AdminOrderSummaryDto>> {
    const qs = toQueryString({
      page: query.page,
      limit: query.limit,
      status: query.status,
      q: query.q,
    });
    const envelope = await requestAdminEnvelope<AdminOrderSummaryDto[]>(
      `/api/v1/admin/orders${qs}`,
    );
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
  getOrderById(id: string): Promise<AdminOrderDetailDto> {
    return requestAdminApi<AdminOrderDetailDto>(
      `/api/v1/admin/orders/${encodeURIComponent(id)}`,
    );
  },
  transitionOrder(
    id: string,
    input: AdminTransitionOrderRequest,
    idempotencyKey = generateIdempotencyKey('admin-ord'),
  ): Promise<AdminOrderDetailDto> {
    return requestAdminApi<AdminOrderDetailDto>(
      `/api/v1/admin/orders/${encodeURIComponent(id)}/transition`,
      {
        method: 'POST',
        body: input,
        extraHeaders: {
          'Idempotency-Key': idempotencyKey,
        },
      },
    );
  },
  createShipment(
    orderId: string,
    input: AdminCreateShipmentRequest,
    idempotencyKey = generateIdempotencyKey('admin-shp'),
  ): Promise<ShipmentDto> {
    return requestAdminApi<ShipmentDto>(
      `/api/v1/admin/orders/${encodeURIComponent(orderId)}/shipments`,
      {
        method: 'POST',
        body: input,
        extraHeaders: {
          'Idempotency-Key': idempotencyKey,
        },
      },
    );
  },
  syncShipmentTracking(shipmentId: string): Promise<ShipmentDto> {
    return requestAdminApi<ShipmentDto>(
      `/api/v1/admin/shipments/${encodeURIComponent(shipmentId)}/sync-tracking`,
      {
        method: 'POST',
      },
    );
  },
  async listReturns(
    query: Partial<AdminReturnsQuery> = {},
  ): Promise<PaginatedResult<ReturnDetailDto>> {
    const qs = toQueryString({
      page: query.page,
      limit: query.limit,
      status: query.status,
    });
    const envelope = await requestAdminEnvelope<ReturnDetailDto[]>(
      `/api/v1/admin/returns${qs}`,
    );
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
  getReturnById(id: string): Promise<ReturnDetailDto> {
    return requestAdminApi<ReturnDetailDto>(
      `/api/v1/admin/returns/${encodeURIComponent(id)}`,
    );
  },
  reviewReturn(id: string, input: ReviewReturnRequest = {}): Promise<ReturnDetailDto> {
    return requestAdminApi<ReturnDetailDto>(
      `/api/v1/admin/returns/${encodeURIComponent(id)}/review`,
      {
        method: 'POST',
        body: input,
      },
    );
  },
  approveReturn(id: string, input: ApproveReturnRequest): Promise<ReturnDetailDto> {
    return requestAdminApi<ReturnDetailDto>(
      `/api/v1/admin/returns/${encodeURIComponent(id)}/approve`,
      {
        method: 'POST',
        body: input,
      },
    );
  },
  receiveReturn(
    id: string,
    input: ReceiveReturnRequest,
    idempotencyKey = generateIdempotencyKey('admin-ret'),
  ): Promise<ReturnDetailDto> {
    return requestAdminApi<ReturnDetailDto>(
      `/api/v1/admin/returns/${encodeURIComponent(id)}/receive`,
      {
        method: 'POST',
        body: input,
        extraHeaders: {
          'Idempotency-Key': idempotencyKey,
        },
      },
    );
  },
  async listRefunds(
    query: Partial<AdminRefundsQuery> = {},
  ): Promise<PaginatedResult<RefundDto>> {
    const qs = toQueryString({
      page: query.page,
      limit: query.limit,
      status: query.status,
    });
    const envelope = await requestAdminEnvelope<RefundDto[]>(
      `/api/v1/admin/refunds${qs}`,
    );
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
  requestRefund(
    orderId: string,
    input: RequestRefundInput,
    idempotencyKey = generateIdempotencyKey('admin-rfd'),
  ): Promise<RefundDto> {
    return requestAdminApi<RefundDto>(
      `/api/v1/admin/orders/${encodeURIComponent(orderId)}/refunds/request`,
      {
        method: 'POST',
        body: input,
        extraHeaders: {
          'Idempotency-Key': idempotencyKey,
        },
      },
    );
  },
  approveRefund(
    refundId: string,
    input: ApproveRefundInput,
    idempotencyKey = generateIdempotencyKey('admin-rfd-app'),
  ): Promise<RefundDto> {
    return requestAdminApi<RefundDto>(
      `/api/v1/admin/refunds/${encodeURIComponent(refundId)}/approve`,
      {
        method: 'POST',
        body: input,
        extraHeaders: {
          'Idempotency-Key': idempotencyKey,
        },
      },
    );
  },
  async listCoupons(
    query: Partial<AdminCouponsQuery> = {},
  ): Promise<PaginatedResult<AdminCouponDto>> {
    const qs = toQueryString({
      page: query.page,
      limit: query.limit,
      status: query.status,
      q: query.q,
    });
    const envelope = await requestAdminEnvelope<AdminCouponDto[]>(
      `/api/v1/admin/coupons${qs}`,
    );
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
  createCoupon(input: CreateCouponRequest): Promise<AdminCouponDto> {
    return requestAdminApi<AdminCouponDto>('/api/v1/admin/coupons', {
      method: 'POST',
      body: input,
    });
  },
  updateCoupon(id: string, input: UpdateCouponRequest): Promise<AdminCouponDto> {
    return requestAdminApi<AdminCouponDto>(
      `/api/v1/admin/coupons/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: input,
      },
    );
  },
  deleteCoupon(id: string): Promise<void> {
    return requestAdminApi<void>(`/api/v1/admin/coupons/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  async listCmsPages(
    query: Partial<AdminCmsListQuery> = {},
  ): Promise<PaginatedResult<CmsPageDto>> {
    const qs = toQueryString({
      page: query.page,
      limit: query.limit,
      status: query.status,
      q: query.q,
    });
    const envelope = await requestAdminEnvelope<CmsPageDto[]>(
      `/api/v1/admin/cms/pages${qs}`,
    );
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
  createCmsPage(input: CreateCmsPageRequest): Promise<CmsPageDto> {
    return requestAdminApi<CmsPageDto>('/api/v1/admin/cms/pages', {
      method: 'POST',
      body: input,
    });
  },
  updateCmsPage(id: string, input: UpdateCmsPageRequest): Promise<CmsPageDto> {
    return requestAdminApi<CmsPageDto>(
      `/api/v1/admin/cms/pages/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: input,
      },
    );
  },
  deleteCmsPage(id: string): Promise<void> {
    return requestAdminApi<void>(`/api/v1/admin/cms/pages/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  transitionCmsPage(id: string, input: TransitionCmsStatusRequest): Promise<CmsPageDto> {
    return requestAdminApi<CmsPageDto>(
      `/api/v1/admin/cms/pages/${encodeURIComponent(id)}/transition`,
      {
        method: 'POST',
        body: input,
      },
    );
  },
  async listCmsLookbooks(
    query: Partial<AdminCmsListQuery> = {},
  ): Promise<PaginatedResult<CmsLookbookDto>> {
    const qs = toQueryString({
      page: query.page,
      limit: query.limit,
      status: query.status,
      q: query.q,
    });
    const envelope = await requestAdminEnvelope<CmsLookbookDto[]>(
      `/api/v1/admin/cms/lookbooks${qs}`,
    );
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
  createCmsLookbook(input: CreateCmsLookbookRequest): Promise<CmsLookbookDto> {
    return requestAdminApi<CmsLookbookDto>('/api/v1/admin/cms/lookbooks', {
      method: 'POST',
      body: input,
    });
  },
  updateCmsLookbook(id: string, input: UpdateCmsLookbookRequest): Promise<CmsLookbookDto> {
    return requestAdminApi<CmsLookbookDto>(
      `/api/v1/admin/cms/lookbooks/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: input,
      },
    );
  },
  deleteCmsLookbook(id: string): Promise<void> {
    return requestAdminApi<void>(`/api/v1/admin/cms/lookbooks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  transitionCmsLookbook(
    id: string,
    input: TransitionCmsStatusRequest,
  ): Promise<CmsLookbookDto> {
    return requestAdminApi<CmsLookbookDto>(
      `/api/v1/admin/cms/lookbooks/${encodeURIComponent(id)}/transition`,
      {
        method: 'POST',
        body: input,
      },
    );
  },
  async listCmsJournal(
    query: Partial<AdminCmsListQuery> = {},
  ): Promise<PaginatedResult<CmsJournalArticleDto>> {
    const qs = toQueryString({
      page: query.page,
      limit: query.limit,
      status: query.status,
      q: query.q,
    });
    const envelope = await requestAdminEnvelope<CmsJournalArticleDto[]>(
      `/api/v1/admin/cms/journal${qs}`,
    );
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
  createCmsJournal(input: CreateCmsJournalRequest): Promise<CmsJournalArticleDto> {
    return requestAdminApi<CmsJournalArticleDto>('/api/v1/admin/cms/journal', {
      method: 'POST',
      body: input,
    });
  },
  updateCmsJournal(id: string, input: UpdateCmsJournalRequest): Promise<CmsJournalArticleDto> {
    return requestAdminApi<CmsJournalArticleDto>(
      `/api/v1/admin/cms/journal/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: input,
      },
    );
  },
  deleteCmsJournal(id: string): Promise<void> {
    return requestAdminApi<void>(`/api/v1/admin/cms/journal/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
  transitionCmsJournal(
    id: string,
    input: TransitionCmsStatusRequest,
  ): Promise<CmsJournalArticleDto> {
    return requestAdminApi<CmsJournalArticleDto>(
      `/api/v1/admin/cms/journal/${encodeURIComponent(id)}/transition`,
      {
        method: 'POST',
        body: input,
      },
    );
  },
  getHealthLive(): Promise<LiveHealthResponse> {
    return requestAdminApi<LiveHealthResponse>('/api/v1/health/live');
  },
  async getHealthReady(): Promise<ReadyHealthCheckResult> {
    const response = await fetch('/api/v1/health/ready', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    const headerRequestId = response.headers.get('x-request-id');
    try {
      const payload = (await response.json()) as
        | RawSuccessEnvelope<{
            status: string;
            checks?: { postgres?: string; redis?: string };
            timestampUtc?: string;
          }>
        | RawErrorEnvelope;

      if (payload.success) {
        return {
          httpStatus: response.status,
          ok: true,
          data: payload.data,
          requestId: payload.meta.requestId ?? headerRequestId,
        };
      }
      return {
        httpStatus: response.status,
        ok: false,
        errorMessage: payload.error.message,
        requestId: payload.meta?.requestId ?? headerRequestId,
      };
    } catch {
      return {
        httpStatus: response.status,
        ok: false,
        errorMessage: `Readiness check returned HTTP ${response.status}.`,
        requestId: headerRequestId,
      };
    }
  },
};
