'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { PermissionCode } from '@arven/config';
import type { RoleSummaryDto } from '@arven/contracts';
import { createRoleRequestSchema, updateRoleRequestSchema } from '@arven/validators';
import {
  PERMISSION_CODES,
  PERMISSION_DESCRIPTIONS,
} from '@/lib/permissions';
import {
  Badge,
  Button,
  Checkbox,
  Divider,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  StatusBanner,
  Surface,
  useToast,
} from '@arven/ui';
import { AdminShell } from '@/components/admin-shell';
import { MfaStepUpModal } from '@/components/mfa-step-up-modal';
import { AdminApiClientError, adminApi } from '@/lib/api-client';
import { useAdminSession } from '@/lib/use-admin-session';

interface GroupedPermissions {
  area: string;
  items: PermissionCode[];
}

function groupPermissionsByArea(): GroupedPermissions[] {
  const groups = new Map<string, PermissionCode[]>();
  for (const code of PERMISSION_CODES) {
    const area = PERMISSION_DESCRIPTIONS[code].area;
    const list = groups.get(area) ?? [];
    list.push(code);
    groups.set(area, list);
  }
  return Array.from(groups.entries()).map(([area, items]) => ({ area, items }));
}

export default function AdminRolesPage() {
  const { toast } = useToast();
  const { user, loading: sessionLoading, error: sessionError, permissions, canAccess, reload } =
    useAdminSession();

  const canReadRoles = canAccess(['user.read', 'user.role.manage']);
  const canManageRoles = Boolean(user?.roles.includes('OWNER') || permissions.has('user.role.manage'));

  const permissionGroups = useMemo(() => groupPermissionsByArea(), []);

  const [roles, setRoles] = useState<RoleSummaryDto[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );

  // Create / Edit Modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleSummaryDto | null>(null);
  const [roleCode, setRoleCode] = useState('');
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<PermissionCode[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete Modal
  const [deleteTarget, setDeleteTarget] = useState<RoleSummaryDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Step-up MFA Modal
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingRetry, setPendingRetry] = useState<(() => Promise<void>) | null>(null);

  const reloadRoles = useCallback(async () => {
    setLoadingRoles(true);
    setLoadError(null);
    try {
      const items = await adminApi.listRoles();
      setRoles(items);
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setLoadError({ message: err.message, requestId: err.requestId });
      } else {
        setLoadError({ message: 'Unable to load roles right now.' });
      }
    } finally {
      setLoadingRoles(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !canReadRoles) {
      return;
    }

    let active = true;
    adminApi
      .listRoles()
      .then((items) => {
        if (active) {
          setRoles(items);
          setLoadError(null);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({ message: 'Unable to load roles right now.' });
        }
      })
      .finally(() => {
        if (active) {
          setLoadingRoles(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canReadRoles, user]);

  const openCreateModal = () => {
    setEditingRole(null);
    setRoleCode('');
    setRoleName('');
    setRoleDescription('');
    setSelectedPermissions([]);
    setFormError(null);
    setEditorOpen(true);
  };

  const openEditModal = (role: RoleSummaryDto) => {
    setEditingRole(role);
    setRoleCode(role.code);
    setRoleName(role.name);
    setRoleDescription(role.description ?? '');
    setSelectedPermissions(
      role.permissions.filter((item): item is PermissionCode =>
        (PERMISSION_CODES as readonly string[]).includes(item),
      ),
    );
    setFormError(null);
    setEditorOpen(true);
  };

  const togglePermission = (code: PermissionCode) => {
    setSelectedPermissions((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code],
    );
  };

  const toggleAreaPermissions = (codes: readonly PermissionCode[]) => {
    const allSelected = codes.every((code) => selectedPermissions.includes(code));
    if (allSelected) {
      setSelectedPermissions((prev) => prev.filter((code) => !codes.includes(code)));
    } else {
      setSelectedPermissions((prev) => Array.from(new Set([...prev, ...codes])));
    }
  };

  const submitRoleMutation = async () => {
    setFormError(null);

    if (editingRole) {
      const parsed = updateRoleRequestSchema.safeParse({
        name: roleName.trim(),
        description: roleDescription.trim() ? roleDescription.trim() : null,
        permissions: selectedPermissions,
      });

      if (!parsed.success) {
        setFormError(parsed.error.issues[0]?.message ?? 'Review role fields before saving.');
        return;
      }

      setSaving(true);
      try {
        await adminApi.updateRole(editingRole.id, parsed.data);
        toast({
          tone: 'success',
          title: 'Role updated',
          description: `${editingRole.code} permissions updated.`,
        });
        setEditorOpen(false);
        await reloadRoles();
      } catch (err) {
        if (err instanceof AdminApiClientError) {
          if (err.isMfaStepUpRequired) {
            setPendingRetry(() => async () => {
              setStepUpOpen(false);
              await submitRoleMutation();
            });
            setStepUpOpen(true);
            return;
          }
          setFormError(err.message);
        } else {
          setFormError('Unable to update role right now.');
        }
      } finally {
        setSaving(false);
      }
      return;
    }

    const parsed = createRoleRequestSchema.safeParse({
      code: roleCode.trim().toUpperCase(),
      name: roleName.trim(),
      description: roleDescription.trim() ? roleDescription.trim() : null,
      permissions: selectedPermissions,
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Review role code and name before saving.');
      return;
    }

    setSaving(true);
    try {
      await adminApi.createRole(parsed.data);
      toast({
        tone: 'success',
        title: 'Custom role created',
        description: `${parsed.data.code} is ready for user assignment.`,
      });
      setEditorOpen(false);
      await reloadRoles();
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        if (err.isMfaStepUpRequired) {
          setPendingRetry(() => async () => {
            setStepUpOpen(false);
            await submitRoleMutation();
          });
          setStepUpOpen(true);
          return;
        }
        setFormError(err.message);
      } else {
        setFormError('Unable to create custom role right now.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitRoleMutation();
  };

  const executeDeleteRole = async (target: RoleSummaryDto) => {
    setDeleting(true);
    try {
      await adminApi.deleteRole(target.id);
      toast({
        tone: 'success',
        title: 'Custom role deleted',
        description: `${target.code} has been removed.`,
      });
      setDeleteTarget(null);
      await reloadRoles();
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        if (err.isMfaStepUpRequired) {
          setPendingRetry(() => async () => {
            setStepUpOpen(false);
            await executeDeleteRole(target);
          });
          setStepUpOpen(true);
          return;
        }
        toast({ tone: 'danger', title: 'Delete failed', description: err.message });
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AdminShell
      title="Roles & Permissions"
      description="Inspect system roles and configure custom operator roles across the 36-permission domain matrix."
      user={user}
      actions={
        canManageRoles ? (
          <Button type="button" variant="primary" size="sm" onClick={openCreateModal}>
            Create Custom Role
          </Button>
        ) : undefined
      }
    >
      {sessionLoading ? (
        <LoadingState label="Verifying operator access" rows={4} />
      ) : sessionError ? (
        <ErrorState
          title="Unable to verify staff session"
          message={sessionError.message}
          requestId={sessionError.requestId}
          onRetry={() => void reload()}
        />
      ) : !canReadRoles ? (
        <StatusBanner
          tone="warning"
          title="Permission required"
          description="Your assigned role does not include user.read or user.role.manage."
        />
      ) : loadingRoles ? (
        <LoadingState label="Loading role definitions" rows={4} />
      ) : loadError ? (
        <ErrorState
          title="Could not load roles"
          message={loadError.message}
          requestId={loadError.requestId}
          onRetry={() => void reloadRoles()}
        />
      ) : roles.length === 0 ? (
        <EmptyState
          title="No roles returned"
          description="No role definitions were returned by the API."
        />
      ) : (
        <div className="space-y-5">
          {!canManageRoles ? (
            <StatusBanner
              tone="info"
              description="Read-only view. Creating, editing, or deleting roles requires the OWNER role with user.role.manage permission."
            />
          ) : null}

          <div className="grid gap-5 lg:grid-cols-2">
            {roles.map((role) => (
              <Surface
                key={role.id}
                variant="elevated"
                border="hairline"
                padding="lg"
                className="flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-display text-2xl font-normal text-ink">{role.name}</h2>
                      <p className="font-mono text-xs text-ink-muted">{role.code}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={role.isSystem ? 'info' : 'neutral'}>
                        {role.isSystem ? 'System' : 'Custom'}
                      </Badge>
                      <Badge tone="neutral">{role.permissions.length} perms</Badge>
                    </div>
                  </div>

                  {role.description ? (
                    <p className="text-sm leading-relaxed text-ink-muted">{role.description}</p>
                  ) : null}

                  <Divider />

                  <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-1">
                    {role.permissions.length === 0 ? (
                      <span className="text-xs text-ink-muted">No permissions assigned</span>
                    ) : (
                      role.permissions.map((perm) => (
                        <code
                          key={perm}
                          className="rounded-[var(--radius-xs)] border border-hairline bg-subtle px-2 py-0.5 font-mono text-[11px] text-ink-secondary"
                        >
                          {perm}
                        </code>
                      ))
                    )}
                  </div>
                </div>

                {canManageRoles ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => openEditModal(role)}
                    >
                      Edit Permissions
                    </Button>
                    {!role.isSystem ? (
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => setDeleteTarget(role)}
                      >
                        Delete Role
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </Surface>
            ))}
          </div>
        </div>
      )}

      {/* Role Editor Modal */}
      <Modal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingRole ? `Edit Role: ${editingRole.code}` : 'Create Custom Role'}
        description="Role updates require OWNER permission and MFA step-up verification within 15 minutes."
        size="lg"
      >
        <form onSubmit={handleFormSubmit} noValidate className="space-y-5">
          {formError ? <StatusBanner tone="danger" description={formError} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="role-code-input"
              label="Role Code"
              hint="Uppercase ASCII letters, numbers, underscores (e.g. QUALITY_AUDITOR)."
              required={!editingRole}
            >
              <Input
                id="role-code-input"
                value={roleCode}
                disabled={Boolean(editingRole)}
                onChange={(event) => setRoleCode(event.target.value.toUpperCase())}
                className="font-mono"
              />
            </FormField>

            <FormField id="role-name-input" label="Display Name" required>
              <Input
                id="role-name-input"
                value={roleName}
                onChange={(event) => setRoleName(event.target.value)}
              />
            </FormField>
          </div>

          <FormField id="role-description-input" label="Description (Optional)">
            <Input
              id="role-description-input"
              value={roleDescription}
              onChange={(event) => setRoleDescription(event.target.value)}
            />
          </FormField>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-[0.06em] text-ink">
                Permission Matrix ({selectedPermissions.length} / {PERMISSION_CODES.length} selected)
              </p>
            </div>

            <div className="max-h-72 space-y-4 overflow-y-auto rounded-[var(--radius-sm)] border border-hairline bg-subtle p-4">
              {permissionGroups.map((group) => {
                const allChecked = group.items.every((code) => selectedPermissions.includes(code));
                return (
                  <div key={group.area} className="space-y-2 border-b border-hairline pb-3 last:border-b-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink">
                        {group.area}
                      </h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleAreaPermissions(group.items)}
                      >
                        {allChecked ? 'Clear Group' : 'Select Group'}
                      </Button>
                    </div>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {group.items.map((code) => (
                        <Checkbox
                          key={code}
                          label={code}
                          description={PERMISSION_DESCRIPTIONS[code].description}
                          checked={selectedPermissions.includes(code)}
                          onChange={() => togglePermission(code)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-hairline pt-4">
            <Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={saving} loadingLabel="Saving role">
              {editingRole ? 'Save Role Changes' : 'Create Role'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Role Modal */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Custom Role"
        description="Custom roles cannot be deleted if still assigned to user accounts."
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={deleting}
              loadingLabel="Deleting"
              onClick={() => {
                if (deleteTarget) {
                  void executeDeleteRole(deleteTarget);
                }
              }}
            >
              Confirm Delete
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-secondary">
          Delete custom role <code className="font-mono text-ink">{deleteTarget?.code}</code>?
        </p>
      </Modal>

      <MfaStepUpModal
        isOpen={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        redirectPath="/roles"
        onVerified={async () => {
          const action = pendingRetry;
          setPendingRetry(null);
          if (action) {
            await action();
          }
        }}
      />
    </AdminShell>
  );
}
