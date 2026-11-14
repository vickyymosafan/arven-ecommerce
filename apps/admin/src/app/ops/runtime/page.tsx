'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Divider,
  ErrorState,
  IconRefresh,
  LoadingState,
  StatusBanner,
  Surface,
  formatWIB,
} from '@arven/ui';
import { AdminShell } from '@/components/admin-shell';
import {
  AdminApiClientError,
  adminApi,
  type LiveHealthResponse,
  type ReadyHealthCheckResult,
} from '@/lib/api-client';
import { useAdminSession } from '@/lib/use-admin-session';

export default function AdminRuntimeHealthPage() {
  const { user, loading: sessionLoading, error: sessionError, reload } = useAdminSession();

  const [live, setLive] = useState<LiveHealthResponse | null>(null);
  const [ready, setReady] = useState<ReadyHealthCheckResult | null>(null);
  const [probing, setProbing] = useState(true);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const runProbes = useCallback(async () => {
    setProbing(true);
    setProbeError(null);
    try {
      const [liveResult, readyResult] = await Promise.all([
        adminApi.getHealthLive(),
        adminApi.getHealthReady(),
      ]);
      setLive(liveResult);
      setReady(readyResult);
      setCheckedAt(new Date().toISOString());
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setProbeError(err.message);
      } else {
        setProbeError('Unable to reach backend health endpoints.');
      }
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    let active = true;
    Promise.all([adminApi.getHealthLive(), adminApi.getHealthReady()])
      .then(([liveResult, readyResult]) => {
        if (!active) return;
        setLive(liveResult);
        setReady(readyResult);
        setCheckedAt(new Date().toISOString());
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setProbeError(err.message);
        } else {
          setProbeError('Unable to reach backend health endpoints.');
        }
      })
      .finally(() => {
        if (active) {
          setProbing(false);
        }
      });

    return () => {
      active = false;
    };
  }, [user]);

  const pgStatus = ready?.data?.checks?.postgres ?? (ready?.ok ? 'up' : 'down');
  const redisStatus = ready?.data?.checks?.redis ?? (ready?.ok ? 'up' : 'down');

  return (
    <AdminShell
      title="Runtime Health"
      description="Inspect live API process liveness and PostgreSQL/Redis readiness status through the BFF proxy."
      user={user}
      actions={
        user ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            isLoading={probing}
            loadingLabel="Probing runtime"
            onClick={() => void runProbes()}
          >
            <IconRefresh size={16} />
            <span>Run Health Probes</span>
          </Button>
        ) : undefined
      }
    >
      {sessionLoading ? (
        <LoadingState label="Verifying operator session" rows={3} />
      ) : sessionError ? (
        <ErrorState
          title="Unable to verify staff session"
          message={sessionError.message}
          requestId={sessionError.requestId}
          onRetry={() => void reload()}
        />
      ) : probing && !live && !ready ? (
        <LoadingState label="Querying backend health probes" rows={3} />
      ) : probeError ? (
        <ErrorState
          title="Health probe failed"
          message={probeError}
          onRetry={() => void runProbes()}
        />
      ) : (
        <div className="space-y-6">
          {checkedAt ? (
            <p className="font-mono text-xs text-ink-muted">
              Last probe: <span className="text-ink">{formatWIB(checkedAt, { includeSeconds: true })}</span>
            </p>
          ) : null}

          {ready && !ready.ok ? (
            <StatusBanner
              tone="danger"
              title={`Readiness probe degraded (HTTP ${ready.httpStatus})`}
              description={ready.errorMessage ?? 'One or more infrastructure dependencies are unavailable.'}
              requestId={ready.requestId}
            />
          ) : null}

          <div className="grid gap-6 md:grid-cols-2">
            <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-2xl font-normal text-ink">API Liveness</h2>
                <Badge tone={live?.status === 'ok' ? 'success' : 'danger'}>
                  {live?.status ?? 'Unknown'}
                </Badge>
              </div>
              <Divider />
              <dl className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Endpoint</dt>
                  <dd className="font-mono text-xs text-ink">/api/v1/health/live</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Service</dt>
                  <dd className="font-mono text-xs text-ink">{live?.service ?? '-'}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Server Timestamp (WIB)</dt>
                  <dd className="font-mono text-xs text-ink">
                    {formatWIB(live?.timestampUtc, { includeSeconds: true })}
                  </dd>
                </div>
              </dl>
            </Surface>

            <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-2xl font-normal text-ink">Dependency Readiness</h2>
                <Badge tone={ready?.ok ? 'success' : 'danger'}>
                  {ready?.ok ? 'Ready' : 'Degraded'}
                </Badge>
              </div>
              <Divider />
              <dl className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Endpoint</dt>
                  <dd className="font-mono text-xs text-ink">/api/v1/health/ready</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">PostgreSQL 18</dt>
                  <dd>
                    <Badge tone={pgStatus === 'up' ? 'success' : 'danger'}>{pgStatus}</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Redis 8</dt>
                  <dd>
                    <Badge tone={redisStatus === 'up' ? 'success' : 'danger'}>{redisStatus}</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Checked Timestamp (WIB)</dt>
                  <dd className="font-mono text-xs text-ink">
                    {formatWIB(ready?.data?.timestampUtc ?? checkedAt, { includeSeconds: true })}
                  </dd>
                </div>
              </dl>
            </Surface>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
