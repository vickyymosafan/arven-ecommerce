'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AuditLogEntryDto } from '@arven/contracts';
import {
  Badge,
  Button,
  DataTable,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  StatusBanner,
  Surface,
  formatWIB,
  type DataTableColumn,
} from '@arven/ui';
import { AdminShell } from '@/components/admin-shell';
import { AdminApiClientError, adminApi, type PaginationMeta } from '@/lib/api-client';
import { useAdminSession } from '@/lib/use-admin-session';

interface AuditFilters {
  page: number;
  action: string;
  resourceType: string;
  actorId: string;
  resourceId: string;
}

export default function AdminAuditLogsPage() {
  const { user, loading: sessionLoading, error: sessionError, canAccess, reload } =
    useAdminSession();

  const canReadAudit = canAccess(['audit.read', 'audit.read.scoped']);

  const [draftAction, setDraftAction] = useState('');
  const [draftResourceType, setDraftResourceType] = useState('');
  const [draftActorId, setDraftActorId] = useState('');
  const [draftResourceId, setDraftResourceId] = useState('');

  const [filters, setFilters] = useState<AuditFilters>({
    page: 1,
    action: '',
    resourceType: '',
    actorId: '',
    resourceId: '',
  });

  const [logs, setLogs] = useState<AuditLogEntryDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    requestId: '',
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );
  const [inspectTarget, setInspectTarget] = useState<AuditLogEntryDto | null>(null);

  const reloadLogs = useCallback(async () => {
    setLoadingLogs(true);
    setLoadError(null);
    try {
      const result = await adminApi.listAuditLogs({
        page: filters.page,
        limit: 20,
        action: filters.action || undefined,
        resourceType: filters.resourceType || undefined,
        actorId: filters.actorId || undefined,
        resourceId: filters.resourceId || undefined,
      });
      setLogs(result.items);
      setMeta(result.meta);
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setLoadError({ message: err.message, requestId: err.requestId });
      } else {
        setLoadError({ message: 'Unable to load audit log entries right now.' });
      }
    } finally {
      setLoadingLogs(false);
    }
  }, [filters]);

  useEffect(() => {
    if (!user || !canReadAudit) {
      return;
    }

    let active = true;
    adminApi
      .listAuditLogs({
        page: filters.page,
        limit: 20,
        action: filters.action || undefined,
        resourceType: filters.resourceType || undefined,
        actorId: filters.actorId || undefined,
        resourceId: filters.resourceId || undefined,
      })
      .then((result) => {
        if (!active) return;
        setLogs(result.items);
        setMeta(result.meta);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({ message: 'Unable to load audit log entries right now.' });
        }
      })
      .finally(() => {
        if (active) {
          setLoadingLogs(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canReadAudit, filters, user]);

  const handleApplyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoadingLogs(true);
    setFilters({
      page: 1,
      action: draftAction.trim(),
      resourceType: draftResourceType.trim(),
      actorId: draftActorId.trim(),
      resourceId: draftResourceId.trim(),
    });
  };

  const handleResetFilters = () => {
    setDraftAction('');
    setDraftResourceType('');
    setDraftActorId('');
    setDraftResourceId('');
    setLoadingLogs(true);
    setFilters({ page: 1, action: '', resourceType: '', actorId: '', resourceId: '' });
  };

  const columns = useMemo<DataTableColumn<AuditLogEntryDto>[]>(
    () => [
      {
        key: 'timestamp',
        header: 'Timestamp (WIB)',
        render: (row) => (
          <span className="font-mono text-xs text-ink">
            {formatWIB(row.createdAt, { includeSeconds: true })}
          </span>
        ),
      },
      {
        key: 'action',
        header: 'Action',
        render: (row) => (
          <code className="rounded-[var(--radius-xs)] border border-hairline bg-subtle px-2 py-0.5 font-mono text-xs text-ink">
            {row.action}
          </code>
        ),
      },
      {
        key: 'actor',
        header: 'Actor',
        render: (row) => (
          <div className="space-y-1">
            {row.actorRole ? <Badge tone="info">{row.actorRole}</Badge> : <Badge>SYSTEM</Badge>}
            {row.actorId ? (
              <p className="font-mono text-xs text-ink-muted">{row.actorId}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'resource',
        header: 'Target Resource',
        render: (row) => (
          <div className="space-y-0.5">
            <p className="font-mono text-xs text-ink">{row.resourceType}</p>
            {row.resourceId ? (
              <p className="font-mono text-xs text-ink-muted">{row.resourceId}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'network',
        header: 'Masked IP & Trace',
        render: (row) => (
          <div className="space-y-0.5 font-mono text-xs text-ink-muted">
            <p>{row.ipMasked ?? '-'}</p>
            {row.requestId ? <p className="truncate max-w-36">{row.requestId}</p> : null}
          </div>
        ),
      },
      {
        key: 'diff',
        header: 'State Diff',
        align: 'right',
        render: (row) => (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setInspectTarget(row)}
          >
            Inspect Diff
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <AdminShell
      title="Audit Logs"
      description="Inspect immutable governance records, scrubbed state snapshots, masked IP addresses, and request correlation IDs."
      user={user}
    >
      {sessionLoading ? (
        <LoadingState label="Checking audit permissions" rows={4} />
      ) : sessionError ? (
        <ErrorState
          title="Unable to verify staff session"
          message={sessionError.message}
          requestId={sessionError.requestId}
          onRetry={() => void reload()}
        />
      ) : !canReadAudit ? (
        <StatusBanner
          tone="warning"
          title="Permission required"
          description="Your assigned role does not include audit.read or audit.read.scoped."
        />
      ) : (
        <div className="space-y-6">
          <Surface variant="subtle" border="hairline" padding="md">
            <form onSubmit={handleApplyFilters} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-3">
                <FormField id="audit-action" label="Action">
                  <Input
                    id="audit-action"
                    placeholder="e.g. ROLE_CREATED"
                    value={draftAction}
                    onChange={(event) => setDraftAction(event.target.value)}
                  />
                </FormField>
              </div>
              <div className="lg:col-span-3">
                <FormField id="audit-resource-type" label="Resource Type">
                  <Input
                    id="audit-resource-type"
                    placeholder="e.g. USER or ROLE"
                    value={draftResourceType}
                    onChange={(event) => setDraftResourceType(event.target.value)}
                  />
                </FormField>
              </div>
              <div className="lg:col-span-2">
                <FormField id="audit-actor-id" label="Actor UUID">
                  <Input
                    id="audit-actor-id"
                    value={draftActorId}
                    onChange={(event) => setDraftActorId(event.target.value)}
                  />
                </FormField>
              </div>
              <div className="lg:col-span-2">
                <FormField id="audit-resource-id" label="Resource ID">
                  <Input
                    id="audit-resource-id"
                    value={draftResourceId}
                    onChange={(event) => setDraftResourceId(event.target.value)}
                  />
                </FormField>
              </div>
              <div className="flex flex-wrap gap-2 lg:col-span-2 lg:justify-end">
                <Button type="submit" variant="primary" size="sm">
                  Filter
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={handleResetFilters}>
                  Reset
                </Button>
              </div>
            </form>
          </Surface>

          <DataTable
            caption="ARVEN immutable audit log"
            columns={columns}
            rows={logs}
            getRowKey={(row) => row.id}
            isLoading={loadingLogs}
            loadingLabel="Loading audit records"
            error={loadError?.message ?? null}
            errorRequestId={loadError?.requestId ?? null}
            onRetry={() => void reloadLogs()}
            emptyTitle="No audit events match the active filters"
            emptyDescription="Clear one or more filter fields to broaden the audit history."
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4 text-xs text-ink-muted">
            <span className="font-mono">
              Page {meta.page} of {meta.totalPages} ({meta.total} total events)
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={meta.page <= 1 || loadingLogs}
                onClick={() => {
                  setLoadingLogs(true);
                  setFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }));
                }}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={meta.page >= meta.totalPages || loadingLogs}
                onClick={() => {
                  setLoadingLogs(true);
                  setFilters((prev) => ({ ...prev, page: prev.page + 1 }));
                }}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={Boolean(inspectTarget)}
        onClose={() => setInspectTarget(null)}
        title={`Audit Snapshot: ${inspectTarget?.action ?? ''}`}
        description={
          inspectTarget
            ? `Recorded ${formatWIB(inspectTarget.createdAt, { includeSeconds: true })} (IP ${inspectTarget.ipMasked ?? 'masked'})`
            : undefined
        }
        size="lg"
        footer={
          <Button type="button" variant="secondary" onClick={() => setInspectTarget(null)}>
            Close
          </Button>
        }
      >
        {inspectTarget ? (
          <div className="space-y-4">
            {inspectTarget.requestId ? (
              <p className="font-mono text-xs text-ink-muted">
                Request ID: <span className="text-ink select-all">{inspectTarget.requestId}</span>
              </p>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
                  Before State
                </h3>
                <pre className="max-h-72 overflow-auto rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3 font-mono text-xs leading-relaxed text-ink whitespace-pre-wrap break-all">
                  {inspectTarget.beforeState
                    ? JSON.stringify(inspectTarget.beforeState, null, 2)
                    : 'null'}
                </pre>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">
                  After State
                </h3>
                <pre className="max-h-72 overflow-auto rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3 font-mono text-xs leading-relaxed text-ink whitespace-pre-wrap break-all">
                  {inspectTarget.afterState
                    ? JSON.stringify(inspectTarget.afterState, null, 2)
                    : 'null'}
                </pre>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </AdminShell>
  );
}
