'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  PERMISSION_CODES,
  PERMISSION_DESCRIPTIONS,
  STEP_UP_REQUIRED_PERMISSIONS,
} from '@/lib/permissions';
import {
  Badge,
  Button,
  Divider,
  ErrorState,
  FormField,
  Input,
  LinkButton,
  LoadingState,
  Modal,
  StatusBanner,
  Surface,
  formatWIB,
  useToast,
} from '@arven/ui';
import { AdminShell } from '@/components/admin-shell';
import { AdminApiClientError, adminApi } from '@/lib/api-client';
import { formatRoleLabel } from '@/lib/format';
import { useAdminSession } from '@/lib/use-admin-session';

const stepUpSet = new Set<string>(STEP_UP_REQUIRED_PERMISSIONS);

export default function AdminOverviewPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading, error, permissions, canAccess, reload } = useAdminSession();

  const [permQuery, setPermQuery] = useState('');
  const [logoutAllOpen, setLogoutAllOpen] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  const filteredPermissions = useMemo(() => {
    const q = permQuery.trim().toLowerCase();
    return PERMISSION_CODES.filter((code) => {
      if (!q) return true;
      const meta = PERMISSION_DESCRIPTIONS[code];
      return (
        code.toLowerCase().includes(q) ||
        meta.area.toLowerCase().includes(q) ||
        meta.description.toLowerCase().includes(q)
      );
    });
  }, [permQuery]);

  const handleConfirmLogoutAll = async () => {
    setLoggingOutAll(true);
    try {
      await adminApi.logoutAll();
      toast({
        tone: 'success',
        title: 'All staff sessions terminated',
        description: 'Re-authenticate with password and MFA to enter again.',
      });
      router.replace('/login');
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        toast({ tone: 'danger', title: 'Sign out failed', description: err.message });
      }
    } finally {
      setLoggingOutAll(false);
    }
  };

  const grantedCount = useMemo(() => {
    if (!user) return 0;
    if (user.roles.includes('OWNER')) return PERMISSION_CODES.length;
    return PERMISSION_CODES.filter((code) => permissions.has(code)).length;
  }, [permissions, user]);

  return (
    <AdminShell
      title="Operations Overview"
      description="Inspect your authenticated staff identity, two-factor assurance timestamp, and RBAC permissions."
      user={user}
      actions={
        user ? (
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href="/mfa/verify?reason=step-up&next=/" variant="secondary" size="sm">
              Refresh MFA Step-Up
            </LinkButton>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => setLogoutAllOpen(true)}
            >
              Sign Out All Sessions
            </Button>
          </div>
        ) : undefined
      }
    >
      {loading ? (
        <LoadingState label="Verifying staff session" rows={4} />
      ) : error ? (
        <ErrorState
          title="Unable to verify staff session"
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void reload()}
        />
      ) : user ? (
        <div className="space-y-8">
          <div className="grid gap-6 lg:grid-cols-12">
            <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4 lg:col-span-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-2xl font-normal text-ink">Operator Identity</h2>
                <Badge tone={user.status === 'ACTIVE' ? 'success' : 'warning'}>
                  {user.status}
                </Badge>
              </div>
              <Divider />
              <dl className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-ink-muted">Staff Name</dt>
                  <dd className="font-medium text-ink">{user.fullName}</dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-ink-muted">Email</dt>
                  <dd className="font-mono text-xs text-ink">{user.email}</dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-ink-muted">Assigned Roles</dt>
                  <dd className="flex flex-wrap justify-end gap-1.5">
                    {user.roles.map((role) => (
                      <Badge key={role} tone="info">
                        {formatRoleLabel(role)}
                      </Badge>
                    ))}
                  </dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-ink-muted">Effective Grants</dt>
                  <dd className="font-mono text-xs text-ink">
                    {grantedCount} / {PERMISSION_CODES.length} permissions
                  </dd>
                </div>
              </dl>
            </Surface>

            <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4 lg:col-span-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-2xl font-normal text-ink">MFA Session Assurance</h2>
                <Badge tone={user.mfaVerified ? 'success' : 'warning'}>
                  {user.mfaVerified ? 'TOTP Verified' : 'Pending'}
                </Badge>
              </div>
              <Divider />
              <dl className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-ink-muted">Authenticator Enrollment</dt>
                  <dd className="font-mono text-xs text-ink">
                    {user.mfaEnabled ? 'Enrolled' : 'Not enrolled'}
                  </dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-ink-muted">Last TOTP Verification</dt>
                  <dd className="font-mono text-xs text-ink">
                    {formatWIB(user.mfaVerifiedAt, { includeSeconds: true })}
                  </dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-ink-muted">Step-Up Window</dt>
                  <dd className="font-mono text-xs text-ink-muted">15 minutes for role mutations</dd>
                </div>
              </dl>
              <StatusBanner
                tone="info"
                description="Administrative session listing is isolated from customer storefront endpoints. Use Sign Out All Sessions above to revoke all active operator sessions immediately."
              />
            </Surface>
          </div>

          <section aria-labelledby="modules-heading" className="space-y-4">
            <h2 id="modules-heading" className="font-display text-2xl font-normal text-ink">
              Phase 02 Governance Workspaces
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Surface variant="subtle" border="hairline" padding="md" className="flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-ink">Users Directory</h3>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Search accounts, toggle active or suspended status, and assign staff roles.
                  </p>
                </div>
                <LinkButton
                  href="/users"
                  variant="secondary"
                  size="sm"
                  aria-disabled={!canAccess(['user.read', 'user.manage.limited', 'user.role.manage'])}
                >
                  Open Users
                </LinkButton>
              </Surface>

              <Surface variant="subtle" border="hairline" padding="md" className="flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-ink">Roles &amp; Permissions</h3>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Configure custom roles across the 36-permission operational matrix.
                  </p>
                </div>
                <LinkButton
                  href="/roles"
                  variant="secondary"
                  size="sm"
                  aria-disabled={!canAccess(['user.read', 'user.role.manage'])}
                >
                  Open Roles
                </LinkButton>
              </Surface>

              <Surface variant="subtle" border="hairline" padding="md" className="flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-ink">Audit Logs</h3>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Inspect immutable change diffs, actor roles, masked IPs, and trace IDs.
                  </p>
                </div>
                <LinkButton
                  href="/audit-logs"
                  variant="secondary"
                  size="sm"
                  aria-disabled={!canAccess(['audit.read', 'audit.read.scoped'])}
                >
                  Open Audit Logs
                </LinkButton>
              </Surface>

              <Surface variant="subtle" border="hairline" padding="md" className="flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-ink">Runtime Health</h3>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Inspect live API liveness and PostgreSQL/Redis readiness status.
                  </p>
                </div>
                <LinkButton href="/ops/runtime" variant="secondary" size="sm">
                  Open Runtime Health
                </LinkButton>
              </Surface>
            </div>
          </section>

          <Surface variant="elevated" border="hairline" padding="lg" className="space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <h2 className="font-display text-2xl font-normal text-ink">
                  RBAC Permission Matrix ({PERMISSION_CODES.length} Codes)
                </h2>
                <p className="text-sm text-ink-muted">
                  Review every server-enforced permission and whether your current session holds it.
                </p>
              </div>
              <div className="w-full sm:w-72">
                <FormField id="overview-perm-search" label="Filter Permissions">
                  <Input
                    id="overview-perm-search"
                    placeholder="Search code or area"
                    value={permQuery}
                    onChange={(event) => setPermQuery(event.target.value)}
                  />
                </FormField>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {filteredPermissions.map((code) => {
                const granted = user.roles.includes('OWNER') || permissions.has(code);
                const meta = PERMISSION_DESCRIPTIONS[code];
                const requiresStepUp = stepUpSet.has(code);

                return (
                  <div
                    key={code}
                    className="flex flex-col justify-between gap-2 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <code className="font-mono text-xs font-medium text-ink">{code}</code>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {requiresStepUp ? <Badge tone="warning">Step-Up MFA</Badge> : null}
                        <Badge tone={granted ? 'success' : 'neutral'}>
                          {granted ? 'Granted' : 'Not Granted'}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-ink-muted">
                      <span className="font-medium text-ink-secondary">{meta.area}:</span>{' '}
                      {meta.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </Surface>
        </div>
      ) : null}

      <Modal
        isOpen={logoutAllOpen}
        onClose={() => setLogoutAllOpen(false)}
        title="Sign Out All Staff Sessions"
        description="Invalidates every active staff session for your account immediately."
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
              loadingLabel="Signing out"
              onClick={() => void handleConfirmLogoutAll()}
            >
              Confirm Sign Out All
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-secondary">
          You will be redirected to the staff sign-in page and must re-enter your TOTP authenticator
          code.
        </p>
      </Modal>
    </AdminShell>
  );
}
