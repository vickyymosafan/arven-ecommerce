import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdminApiClientError,
  adminApi,
  clearAdminCsrfTokenCache,
} from '../src/lib/api-client';

describe('adminApi client behavior', () => {
  afterEach(() => {
    clearAdminCsrfTokenCache();
    vi.restoreAllMocks();
  });

  it('attaches x-csrf-token on admin mutations and parses MFA_STEP_UP_REQUIRED', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'admin-csrf-1' },
            meta: { requestId: 'req-csrf' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'MFA_STEP_UP_REQUIRED',
              message: 'Recent TOTP verification is required for role changes.',
            },
            meta: { requestId: 'req-stepup' },
          }),
          { status: 403 },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    let caught: unknown;
    try {
      await adminApi.assignUserRoles('user-1', { roleCodes: ['MANAGER'] });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AdminApiClientError);
    const apiErr = caught as AdminApiClientError;
    expect(apiErr.isMfaStepUpRequired).toBe(true);
    expect(apiErr.requestId).toBe('req-stepup');

    const headers = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(headers.get('x-csrf-token')).toBe('admin-csrf-1');
  });

  it('handles degraded 503 readiness responses cleanly for /ops/runtime', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Redis ping timed out',
          },
          meta: { requestId: 'req-ready-503' },
        }),
        { status: 503 },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);

    const ready = await adminApi.getHealthReady();
    expect(ready.ok).toBe(false);
    expect(ready.httpStatus).toBe(503);
    expect(ready.errorMessage).toBe('Redis ping timed out');
    expect(ready.requestId).toBe('req-ready-503');
  });
});
