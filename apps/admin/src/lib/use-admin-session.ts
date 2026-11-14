'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PermissionCode } from '@arven/config';
import type { AuthUserSummary } from '@arven/contracts';
import { AdminApiClientError, adminApi } from './api-client';

export interface AdminSessionState {
  user: AuthUserSummary | null;
  loading: boolean;
  error: { message: string; requestId?: string | null } | null;
  permissions: Set<string>;
  canAccess: (required: readonly PermissionCode[]) => boolean;
  reload: () => Promise<void>;
}

export function useAdminSession(): AdminSessionState {
  const router = useRouter();
  const [user, setUser] = useState<AuthUserSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string | null } | null>(null);

  const handleSessionResponse = useCallback(
    (data: { user: AuthUserSummary; mfaRequired: boolean }): boolean => {
      if (data.mfaRequired || !data.user.mfaVerified) {
        if (!data.user.mfaEnabled) {
          router.replace('/mfa/setup');
        } else {
          router.replace('/mfa/verify');
        }
        return false;
      }
      setUser(data.user);
      return true;
    },
    [router],
  );

  const handleSessionError = useCallback(
    (err: unknown) => {
      if (err instanceof AdminApiClientError) {
        if (err.status === 401) {
          router.replace('/login');
          return;
        }
        if (err.code === 'MFA_SETUP_REQUIRED') {
          router.replace('/mfa/setup');
          return;
        }
        if (err.code === 'MFA_REQUIRED') {
          router.replace('/mfa/verify');
          return;
        }
        if (err.code === 'MFA_STEP_UP_REQUIRED') {
          router.replace('/mfa/verify?reason=step-up');
          return;
        }
        setError({ message: err.message, requestId: err.requestId });
      } else {
        setError({ message: 'Unable to verify staff session right now.' });
      }
    },
    [router],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getMe();
      handleSessionResponse(data);
    } catch (err) {
      handleSessionError(err);
    } finally {
      setLoading(false);
    }
  }, [handleSessionError, handleSessionResponse]);

  useEffect(() => {
    let active = true;
    adminApi
      .getMe()
      .then((data) => {
        if (!active) return;
        handleSessionResponse(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        handleSessionError(err);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [handleSessionError, handleSessionResponse]);

  const permissions = useMemo(() => new Set(user?.permissions ?? []), [user]);

  const canAccess = useCallback(
    (required: readonly PermissionCode[]) => {
      if (!user) return false;
      if (user.roles.includes('OWNER')) return true;
      return required.some((code) => permissions.has(code));
    },
    [permissions, user],
  );

  return {
    user,
    loading,
    error,
    permissions,
    canAccess,
    reload,
  };
}
