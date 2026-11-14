import type {
  AdminLoginRequest,
  AdminUserSummaryDto,
  AuditLogEntryDto,
  AuthUserSummary,
  MfaSetupResponse,
  MfaVerifyRequest,
  RoleSummaryDto,
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

async function requestAdminEnvelope<T>(
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
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const envelope = await requestAdminEnvelope<T>(path, options);
  return envelope.data;
}

function toQueryString(params: Record<string, string | number | undefined>): string {
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
  loginAdmin(input: AdminLoginRequest): Promise<AdminLoginResponse> {
    return requestAdminApi<AdminLoginResponse>('/api/v1/auth/admin/login', {
      method: 'POST',
      body: input,
    });
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
