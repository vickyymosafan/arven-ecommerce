import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClientError,
  clearCsrfTokenCache,
  storefrontApi,
} from '../src/lib/api-client.js';

describe('storefrontApi CSRF and envelope handling', () => {
  afterEach(() => {
    clearCsrfTokenCache();
    vi.restoreAllMocks();
  });

  it('fetches CSRF token before mutating requests and attaches x-csrf-token header', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'csrf-token-1' },
            meta: { requestId: 'req-csrf' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              user: {
                id: 'user-1',
                email: 'client@arven.id',
                fullName: 'Siti Rahmawati',
                status: 'ACTIVE',
                emailVerified: true,
                mfaEnabled: false,
                roles: ['CUSTOMER'],
              },
              mfaRequired: false,
              sessionExpiresAt: '2026-11-15T10:00:00.000Z',
            },
            meta: { requestId: 'req-login' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    const session = await storefrontApi.loginCustomer({
      email: 'client@arven.id',
      password: 'CorrectHorseBattery123!',
    });

    expect(session.user.email).toBe('client@arven.id');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/csrf-token');

    const loginInit = fetchMock.mock.calls[1]?.[1];
    const headers = new Headers(loginInit?.headers);
    expect(headers.get('x-csrf-token')).toBe('csrf-token-1');
  });

  it('refreshes CSRF token and retries once after 403 CSRF rejection', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'stale-token' },
            meta: { requestId: 'req-1' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'CSRF_TOKEN_INVALID', message: 'Invalid CSRF token' },
            meta: { requestId: 'req-2' },
          }),
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { csrfToken: 'fresh-token' },
            meta: { requestId: 'req-3' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    vi.stubGlobal('fetch', fetchMock);

    await storefrontApi.revokeSession('sess-2');

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const retryHeaders = new Headers(fetchMock.mock.calls[3]?.[1]?.headers);
    expect(retryHeaders.get('x-csrf-token')).toBe('fresh-token');
  });

  it('raises ApiClientError with requestId and details on error envelopes', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Session missing or expired',
            details: [{ field: 'session', issue: 'Expired' }],
          },
          meta: { requestId: 'req-err-401' },
        }),
        { status: 401 },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);

    await expect(storefrontApi.getProfile()).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 401,
      code: 'UNAUTHORIZED',
      requestId: 'req-err-401',
    });

    try {
      await storefrontApi.getProfile();
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err instanceof ApiClientError || err instanceof Error).toBe(true);
    }
  });
});
