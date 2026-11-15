import type {
  AddressResponse,
  AuthUserSummary,
  CategoryNodeDto,
  CollectionDetailDto,
  CollectionSummaryDto,
  CreateAddressRequest,
  ForgotPasswordRequest,
  LoginRequest,
  ProductCardDto,
  ProductDetailDto,
  PublicProductsQuery,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateAddressRequest,
  UpdateProfileRequest,
  UserProfileResponse,
  UserSessionSummary,
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

export function clearCsrfTokenCache(): void {
  cachedCsrfToken = null;
}

export async function fetchCsrfToken(forceRefresh = false): Promise<string> {
  if (cachedCsrfToken && !forceRefresh) {
    return cachedCsrfToken;
  }

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

async function requestEnvelope<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
  } = {},
): Promise<RawSuccessEnvelope<T>> {
  const method = (options.method ?? 'GET').toUpperCase();
  const mutating = isMutatingMethod(method);

  const execute = async (forceRefreshCsrf: boolean): Promise<Response> => {
    const headers = new Headers();
    headers.set('Accept', 'application/json');

    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
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
  options: {
    method?: string;
    body?: unknown;
  } = {},
): Promise<T> {
  const envelope = await requestEnvelope<T>(path, options);
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
  loginCustomer(input: LoginRequest): Promise<AuthSessionResponse> {
    return requestApi<AuthSessionResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: input,
    });
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
};
