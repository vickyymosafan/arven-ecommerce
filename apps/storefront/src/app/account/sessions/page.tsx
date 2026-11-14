'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UserSessionSummary } from '@arven/contracts';
import {
  Badge,
  Button,
  DataTable,
  Modal,
  StatusBanner,
  formatWIB,
  useToast,
  type DataTableColumn,
} from '@arven/ui';
import { AccountShell } from '@/components/account-shell';
import { ApiClientError, storefrontApi } from '@/lib/api-client';

export default function CustomerSessionsPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [sessions, setSessions] = useState<UserSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );

  const [revokeTarget, setRevokeTarget] = useState<UserSessionSummary | null>(null);
  const [revoking, setRevoking] = useState(false);

  const [logoutAllOpen, setLogoutAllOpen] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const items = await storefrontApi.listSessions();
      setSessions(items);
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
        router.replace('/auth/login?next=/account/sessions');
        return;
      }
      if (err instanceof ApiClientError) {
        setLoadError({ message: err.message, requestId: err.requestId });
      } else {
        setLoadError({ message: 'Unable to load active sessions right now.' });
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    storefrontApi
      .listSessions()
      .then((items) => {
        if (active) {
          setSessions(items);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          router.replace('/auth/login?next=/account/sessions');
          return;
        }
        if (err instanceof ApiClientError) {
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({ message: 'Unable to load active sessions right now.' });
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) {
      return;
    }
    setRevoking(true);
    try {
      await storefrontApi.revokeSession(revokeTarget.id);
      toast({
        tone: 'success',
        title: 'Session revoked',
        description: 'The selected browser session is no longer valid.',
      });
      setRevokeTarget(null);
      await loadSessions();
    } catch (err) {
      if (err instanceof ApiClientError) {
        toast({ tone: 'danger', title: 'Revocation failed', description: err.message });
      }
    } finally {
      setRevoking(false);
    }
  };

  const handleConfirmLogoutAll = async () => {
    setLoggingOutAll(true);
    try {
      await storefrontApi.logoutAll();
      toast({
        tone: 'success',
        title: 'All sessions signed out',
        description: 'Sign in again to start a fresh customer session.',
      });
      router.replace('/auth/login');
    } catch (err) {
      if (err instanceof ApiClientError) {
        toast({ tone: 'danger', title: 'Sign out failed', description: err.message });
      }
    } finally {
      setLoggingOutAll(false);
    }
  };

  const columns = useMemo<DataTableColumn<UserSessionSummary>[]>(
    () => [
      {
        key: 'device',
        header: 'Browser / Client',
        render: (session) => (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">
                {session.userAgentSummary || 'Browser Session'}
              </span>
              {session.isCurrent ? <Badge tone="success">Current</Badge> : null}
            </div>
            <p className="font-mono text-xs text-ink-muted">{session.scope}</p>
          </div>
        ),
      },
      {
        key: 'ip',
        header: 'Network IP',
        render: (session) => (
          <span className="font-mono text-xs text-ink">{session.ipMasked}</span>
        ),
      },
      {
        key: 'lastActive',
        header: 'Last Active (WIB)',
        render: (session) => (
          <span className="font-mono text-xs text-ink">{formatWIB(session.lastActiveAt)}</span>
        ),
      },
      {
        key: 'expires',
        header: 'Expires (WIB)',
        render: (session) => (
          <span className="font-mono text-xs text-ink-muted">{formatWIB(session.expiresAt)}</span>
        ),
      },
      {
        key: 'actions',
        header: 'Control',
        align: 'right',
        render: (session) =>
          session.isCurrent ? (
            <span className="text-xs font-medium text-ink-muted">This device</span>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRevokeTarget(session)}
            >
              Revoke
            </Button>
          ),
      },
    ],
    [],
  );

  return (
    <AccountShell
      title="Active Sessions"
      description="Inspect signed-in storefront browsers and revoke unrecognized sessions immediately."
    >
      <div className="space-y-6">
        <StatusBanner
          tone="info"
          title="Session Privacy & Security"
          description="Only your customer storefront sessions appear here. Network addresses are masked for privacy and all timestamps display in Asia/Jakarta (WIB)."
          action={
            sessions.length > 0 ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setLogoutAllOpen(true)}
              >
                Sign Out All Devices
              </Button>
            ) : undefined
          }
        />

        <DataTable
          caption="Customer active browser sessions"
          columns={columns}
          rows={sessions}
          getRowKey={(row) => row.id}
          isLoading={loading}
          loadingLabel="Loading active sessions"
          error={loadError?.message ?? null}
          errorRequestId={loadError?.requestId ?? null}
          onRetry={() => void loadSessions()}
          emptyTitle="No active sessions found"
          emptyDescription="No active customer sessions are currently recorded for your account."
        />
      </div>

      <Modal
        isOpen={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        title="Revoke Browser Session"
        description="That browser will immediately lose access and must sign in again."
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={revoking}
              loadingLabel="Revoking"
              onClick={() => void handleConfirmRevoke()}
            >
              Revoke Session
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-ink-secondary">
          <p className="font-medium text-ink">{revokeTarget?.userAgentSummary}</p>
          <p className="font-mono text-xs text-ink-muted">IP: {revokeTarget?.ipMasked}</p>
        </div>
      </Modal>

      <Modal
        isOpen={logoutAllOpen}
        onClose={() => setLogoutAllOpen(false)}
        title="Sign Out All Devices"
        description="Closes every customer storefront session including this browser."
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setLogoutAllOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={loggingOutAll}
              loadingLabel="Signing out all"
              onClick={() => void handleConfirmLogoutAll()}
            >
              Confirm Sign Out All
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-secondary">
          All active sessions on phones, tablets, and desktops will be invalidated immediately.
        </p>
      </Modal>
    </AccountShell>
  );
}
