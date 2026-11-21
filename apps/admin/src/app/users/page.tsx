'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AdminUserSummaryDto, RoleSummaryDto } from '@arven/contracts';
import { assignUserRolesRequestSchema, updateUserStatusRequestSchema } from '@arven/validators';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  Select,
  StatusBanner,
  Surface,
  formatWIB,
  useToast,
  type DataTableColumn,
} from '@arven/ui';
import { AdminShell } from '@/components/admin-shell';
import { MfaStepUpModal } from '@/components/mfa-step-up-modal';
import {
  AdminApiClientError,
  adminApi,
  type PaginationMeta,
} from '@/lib/api-client';
import { formatRoleLabel } from '@/lib/format';
import { useAdminSession } from '@/lib/use-admin-session';

interface FilterState {
  page: number;
  search: string;
  status: string;
  roleCode: string;
}

export default function AdminUsersPage() {
  const { toast } = useToast();
  const { user, loading: sessionLoading, error: sessionError, permissions, canAccess, reload } =
    useAdminSession();

  const canReadUsers = canAccess(['user.read', 'user.manage.limited', 'user.role.manage']);
  const canAssignRoles = Boolean(user?.roles.includes('OWNER') || permissions.has('user.role.manage'));
  const canToggleStatus = Boolean(
    user?.roles.includes('OWNER') ||
      permissions.has('user.manage.limited') ||
      permissions.has('user.role.manage'),
  );

  const [draftSearch, setDraftSearch] = useState('');
  const [draftStatus, setDraftStatus] = useState('');
  const [draftRoleCode, setDraftRoleCode] = useState('');
  const [filters, setFilters] = useState<FilterState>({
    page: 1,
    search: '',
    status: '',
    roleCode: '',
  });

  const [users, setUsers] = useState<AdminUserSummaryDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    requestId: '',
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [roles, setRoles] = useState<RoleSummaryDto[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );

  // Status modal state
  const [statusTarget, setStatusTarget] = useState<AdminUserSummaryDto | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  // Role assignment modal state
  const [rolesTarget, setRolesTarget] = useState<AdminUserSummaryDto | null>(null);
  const [selectedRoleCodes, setSelectedRoleCodes] = useState<string[]>([]);
  const [rolesReason, setRolesReason] = useState('');
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [rolesSaving, setRolesSaving] = useState(false);

  // Inline MFA step-up retry queue
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingStepUpAction, setPendingStepUpAction] = useState<(() => Promise<void>) | null>(null);

  const refreshDirectory = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const [usersResult, rolesResult] = await Promise.all([
        adminApi.listUsers({
          page: filters.page,
          limit: 20,
          search: filters.search || undefined,
          status: filters.status || undefined,
          roleCode: filters.roleCode || undefined,
        }),
        adminApi.listRoles().catch(() => [] as RoleSummaryDto[]),
      ]);
      setUsers(usersResult.items);
      setMeta(usersResult.meta);
      if (rolesResult.length > 0) {
        setRoles(rolesResult);
      }
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setListError({ message: err.message, requestId: err.requestId });
      } else {
        setListError({ message: 'Unable to load directory records right now.' });
      }
    } finally {
      setListLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (!user || !canReadUsers) {
      return;
    }

    let active = true;
    Promise.all([
      adminApi.listUsers({
        page: filters.page,
        limit: 20,
        search: filters.search || undefined,
        status: filters.status || undefined,
        roleCode: filters.roleCode || undefined,
      }),
      adminApi.listRoles().catch(() => [] as RoleSummaryDto[]),
    ])
      .then(([usersResult, rolesResult]) => {
        if (!active) return;
        setUsers(usersResult.items);
        setMeta(usersResult.meta);
        if (rolesResult.length > 0) {
          setRoles(rolesResult);
        }
        setListError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setListError({ message: err.message, requestId: err.requestId });
        } else {
          setListError({ message: 'Unable to load directory records right now.' });
        }
      })
      .finally(() => {
        if (active) {
          setListLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canReadUsers, filters, user]);

  const handleApplyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setListLoading(true);
    setFilters({
      page: 1,
      search: draftSearch.trim(),
      status: draftStatus,
      roleCode: draftRoleCode,
    });
  };

  const handleResetFilters = () => {
    setDraftSearch('');
    setDraftStatus('');
    setDraftRoleCode('');
    setListLoading(true);
    setFilters({ page: 1, search: '', status: '', roleCode: '' });
  };

  const openStatusModal = (target: AdminUserSummaryDto) => {
    setStatusTarget(target);
    setStatusReason('');
    setStatusError(null);
  };

  const handleSaveStatus = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!statusTarget) return;
    setStatusError(null);

    const nextStatus = statusTarget.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const parsed = updateUserStatusRequestSchema.safeParse({
      status: nextStatus,
      ...(statusReason.trim() ? { reason: statusReason.trim() } : {}),
    });

    if (!parsed.success) {
      setStatusError(parsed.error.issues[0]?.message ?? 'Enter a valid reason (at least 3 characters).');
      return;
    }

    setStatusSaving(true);
    try {
      await adminApi.updateUserStatus(statusTarget.id, parsed.data);
      toast({
        tone: 'success',
        title: `User set to ${nextStatus}`,
        description: `${statusTarget.fullName} status updated.`,
      });
      setStatusTarget(null);
      await refreshDirectory();
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setStatusError(err.message);
      } else {
        setStatusError('Unable to update account status right now.');
      }
    } finally {
      setStatusSaving(false);
    }
  };

  const openRolesModal = (target: AdminUserSummaryDto) => {
    setRolesTarget(target);
    setSelectedRoleCodes(target.roles);
    setRolesReason('');
    setRolesError(null);
  };

  const executeRoleAssignment = async (
    targetId: string,
    targetName: string,
    payload: { roleCodes: string[]; reason?: string },
  ) => {
    setRolesSaving(true);
    setRolesError(null);
    try {
      await adminApi.assignUserRoles(targetId, payload);
      toast({
        tone: 'success',
        title: 'Roles updated',
        description: `Updated roles for ${targetName}.`,
      });
      setRolesTarget(null);
      await refreshDirectory();
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        if (err.isMfaStepUpRequired) {
          setPendingStepUpAction(() => async () => {
            setStepUpOpen(false);
            await executeRoleAssignment(targetId, targetName, payload);
          });
          setStepUpOpen(true);
          return;
        }
        setRolesError(err.message);
      } else {
        setRolesError('Unable to assign user roles right now.');
      }
    } finally {
      setRolesSaving(false);
    }
  };

  const handleSaveRoles = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rolesTarget) return;
    setRolesError(null);

    const parsed = assignUserRolesRequestSchema.safeParse({
      roleCodes: selectedRoleCodes,
      ...(rolesReason.trim() ? { reason: rolesReason.trim() } : {}),
    });

    if (!parsed.success) {
      setRolesError(parsed.error.issues[0]?.message ?? 'Select at least one role.');
      return;
    }

    await executeRoleAssignment(rolesTarget.id, rolesTarget.fullName, parsed.data);
  };

  const columns = useMemo<DataTableColumn<AdminUserSummaryDto>[]>(
    () => [
      {
        key: 'user',
        header: 'Account',
        render: (row) => (
          <div className="space-y-1">
            <p className="font-medium text-ink">{row.fullName}</p>
            <p className="font-mono text-xs text-ink-muted">{row.email}</p>
            {row.phoneMasked ? (
              <p className="font-mono text-xs text-ink-muted">{row.phoneMasked}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => (
          <Badge
            tone={
              row.status === 'ACTIVE'
                ? 'success'
                : row.status === 'SUSPENDED'
                  ? 'danger'
                  : 'warning'
            }
          >
            {row.status}
          </Badge>
        ),
      },
      {
        key: 'mfa',
        header: 'MFA',
        render: (row) => (
          <Badge tone={row.mfaEnabled ? 'info' : 'neutral'}>
            {row.mfaEnabled ? 'Enrolled' : 'Off'}
          </Badge>
        ),
      },
      {
        key: 'roles',
        header: 'Roles',
        render: (row) => (
          <div className="flex flex-wrap gap-1.5">
            {row.roles.map((role) => (
              <Badge key={role} tone="neutral">
                {formatRoleLabel(role)}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        key: 'created',
        header: 'Created (WIB)',
        render: (row) => (
          <span className="font-mono text-xs text-ink-muted">{formatWIB(row.createdAt)}</span>
        ),
      },
      {
        key: 'actions',
        header: 'Controls',
        align: 'right',
        render: (row) => {
          const isSelf = row.id === user?.id;
          return (
            <div className="flex flex-wrap justify-end gap-2">
              {canAssignRoles ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => openRolesModal(row)}
                >
                  Assign Roles
                </Button>
              ) : null}
              {canToggleStatus && (row.status === 'ACTIVE' || row.status === 'SUSPENDED') ? (
                <Button
                  type="button"
                  variant={row.status === 'ACTIVE' ? 'danger' : 'primary'}
                  size="sm"
                  disabled={isSelf && row.status === 'ACTIVE'}
                  onClick={() => openStatusModal(row)}
                >
                  {row.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [canAssignRoles, canToggleStatus, user?.id],
  );

  const toggleRoleCode = (code: string) => {
    setSelectedRoleCodes((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code],
    );
  };

  return (
    <AdminShell
      title="Users Directory"
      description="Search customer and staff accounts, inspect MFA standing, suspend compromised access, or update role assignments."
      user={user}
    >
      {sessionLoading ? (
        <LoadingState label="Checking operator permissions" rows={4} />
      ) : sessionError ? (
        <ErrorState
          title="Unable to verify staff session"
          message={sessionError.message}
          requestId={sessionError.requestId}
          onRetry={() => void reload()}
        />
      ) : !canReadUsers ? (
        <StatusBanner
          tone="warning"
          title="Permission required"
          description="Your assigned role does not include user.read access."
        />
      ) : (
        <div className="space-y-6">
          <Surface variant="subtle" border="hairline" padding="md">
            <form onSubmit={handleApplyFilters} className="grid gap-4 md:grid-cols-12 md:items-end">
              <div className="md:col-span-5">
                <FormField id="users-filter-search" label="Search Name or Email">
                  <Input
                    id="users-filter-search"
                    placeholder="Filter by email or full name"
                    value={draftSearch}
                    onChange={(event) => setDraftSearch(event.target.value)}
                  />
                </FormField>
              </div>
              <div className="md:col-span-3">
                <FormField id="users-filter-status" label="Account Status">
                  <Select
                    id="users-filter-status"
                    value={draftStatus}
                    onChange={(event) => setDraftStatus(event.target.value)}
                  >
                    <option value="">All statuses</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="PENDING_VERIFICATION">PENDING_VERIFICATION</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </Select>
                </FormField>
              </div>
              <div className="md:col-span-2">
                <FormField id="users-filter-role" label="Role">
                  <Select
                    id="users-filter-role"
                    value={draftRoleCode}
                    onChange={(event) => setDraftRoleCode(event.target.value)}
                  >
                    <option value="">All roles</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.code}>
                        {role.code}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-2 md:justify-end">
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
            caption="ARVEN accounts directory"
            columns={columns}
            rows={users}
            getRowKey={(row) => row.id}
            isLoading={listLoading}
            loadingLabel="Loading directory accounts"
            error={listError?.message ?? null}
            errorRequestId={listError?.requestId ?? null}
            onRetry={() => void refreshDirectory()}
            emptyTitle="No matching accounts"
            emptyDescription="Adjust the search or status filters to inspect other accounts."
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4 text-xs text-ink-muted">
            <span className="font-mono">
              Page {meta.page} of {meta.totalPages} ({meta.total} total accounts)
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={meta.page <= 1 || listLoading}
                onClick={() => {
                  setListLoading(true);
                  setFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }));
                }}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={meta.page >= meta.totalPages || listLoading}
                onClick={() => {
                  setListLoading(true);
                  setFilters((prev) => ({ ...prev, page: prev.page + 1 }));
                }}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      <Modal
        isOpen={Boolean(statusTarget)}
        onClose={() => setStatusTarget(null)}
        title={statusTarget?.status === 'ACTIVE' ? 'Suspend Account' : 'Reactivate Account'}
        description={
          statusTarget
            ? `Change status for ${statusTarget.fullName} (${statusTarget.email}).`
            : undefined
        }
        size="sm"
      >
        <form onSubmit={handleSaveStatus} noValidate className="space-y-4">
          {statusError ? <StatusBanner tone="danger" description={statusError} /> : null}

          <FormField
            id="status-change-reason"
            label="Audit Reason (Optional)"
            hint="Recorded in immutable audit logs (minimum 3 characters if provided)."
          >
            <Input
              id="status-change-reason"
              value={statusReason}
              onChange={(event) => setStatusReason(event.target.value)}
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setStatusTarget(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={statusTarget?.status === 'ACTIVE' ? 'danger' : 'primary'}
              size="sm"
              isLoading={statusSaving}
              loadingLabel="Saving"
            >
              {statusTarget?.status === 'ACTIVE' ? 'Confirm Suspension' : 'Confirm Reactivation'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Role Assignment Modal */}
      <Modal
        isOpen={Boolean(rolesTarget)}
        onClose={() => setRolesTarget(null)}
        title="Assign Account Roles"
        description={
          rolesTarget
            ? `Select assigned roles for ${rolesTarget.fullName} (${rolesTarget.email}).`
            : undefined
        }
        size="md"
      >
        <form onSubmit={handleSaveRoles} noValidate className="space-y-4">
          {rolesError ? <StatusBanner tone="danger" description={rolesError} /> : null}

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-ink">
              Available Roles
            </p>
            <div className="grid max-h-64 gap-2 overflow-y-auto rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3 sm:grid-cols-2">
              {roles.map((role) => (
                <Checkbox
                  key={role.id}
                  label={role.code}
                  description={role.name}
                  checked={selectedRoleCodes.includes(role.code)}
                  onChange={() => toggleRoleCode(role.code)}
                />
              ))}
            </div>
          </div>

          <FormField
            id="roles-change-reason"
            label="Governance Reason (Optional)"
            hint="Recorded in audit logs. Protected by 15-minute MFA step-up assurance."
          >
            <Input
              id="roles-change-reason"
              value={rolesReason}
              onChange={(event) => setRolesReason(event.target.value)}
            />
          </FormField>

          <div className="flex justify-end gap-2 border-t border-hairline pt-4">
            <Button type="button" variant="secondary" size="sm" onClick={() => setRolesTarget(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={rolesSaving}
              loadingLabel="Updating roles"
            >
              Save Role Assignments
            </Button>
          </div>
        </form>
      </Modal>

      <MfaStepUpModal
        isOpen={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        redirectPath="/users"
        onVerified={async () => {
          const action = pendingStepUpAction;
          setPendingStepUpAction(null);
          if (action) {
            await action();
          }
        }}
      />
    </AdminShell>
  );
}
