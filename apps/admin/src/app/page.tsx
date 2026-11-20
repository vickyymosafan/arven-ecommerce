'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminSalesAnalyticsDto } from '@arven/contracts';
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
  formatIDR,
  formatWIB,
  useToast,
} from '@arven/ui';
import { AdminShell } from '@/components/admin-shell';
import { AdminApiClientError, adminApi } from '@/lib/api-client';
import { formatRoleLabel } from '@/lib/format';
import { getAnalyticsVisibility } from '@/lib/ops-helpers';
import { useAdminSession } from '@/lib/use-admin-session';

const stepUpSet = new Set<string>(STEP_UP_REQUIRED_PERMISSIONS);

export default function AdminOverviewPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading, error, permissions, canAccess, reload } = useAdminSession();

  const [permQuery, setPermQuery] = useState('');
  const [logoutAllOpen, setLogoutAllOpen] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  const [analytics, setAnalytics] = useState<AdminSalesAnalyticsDto | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);
  const [analyticsNonce, setAnalyticsNonce] = useState(0);

  const analyticsVisibility = useMemo(
    () =>
      getAnalyticsVisibility({
        roles: user?.roles,
        permissions,
      }),
    [permissions, user?.roles],
  );

  const loadAnalytics = useCallback(() => {
    if (!user || analyticsVisibility === 'none') {
      return;
    }
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    setAnalyticsNonce((n) => n + 1);
  }, [analyticsVisibility, user]);

  useEffect(() => {
    if (!user || analyticsVisibility === 'none') {
      return;
    }

    let active = true;
    adminApi
      .getSalesAnalytics({ days: 30 })
      .then((data) => {
        if (!active) return;
        setAnalytics(data);
        setAnalyticsError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setAnalyticsError({ message: err.message, requestId: err.requestId });
        } else {
          setAnalyticsError({ message: 'Unable to load live sales and operations totals.' });
        }
      })
      .finally(() => {
        if (active) {
          setAnalyticsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [analyticsNonce, analyticsVisibility, user]);

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
          <section aria-labelledby="live-kpi-heading" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <h2 id="live-kpi-heading" className="font-display text-2xl font-normal text-ink">
                  Live Sales &amp; Operations Summary
                </h2>
                {analytics ? (
                  <p className="font-mono text-xs tabular-nums text-ink-muted">
                    Live server totals as of {formatWIB(analytics.generatedAt, { includeSeconds: true })} (last {analytics.days} days)
                  </p>
                ) : (
                  <p className="text-xs text-ink-muted">
                    Server-computed totals across orders, settled payments, and open returns.
                  </p>
                )}
              </div>
              {analytics && analyticsVisibility !== 'none' ? (
                <div className="flex flex-wrap items-center gap-2">
                  {analytics.limitedView || analyticsVisibility === 'limited' ? (
                    <Badge tone="info">Volume &amp; SLA View</Badge>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void loadAnalytics()}
                    isLoading={analyticsLoading}
                    loadingLabel="Refreshing"
                  >
                    Refresh Totals
                  </Button>
                </div>
              ) : null}
            </div>

            {analyticsVisibility === 'none' ? (
              <StatusBanner
                tone="info"
                description="Sales KPI summary requires analytics.read or analytics.read.limited permission."
              />
            ) : !analytics && !analyticsError ? (
              <LoadingState label="Loading live sales and operations KPIs" rows={3} />
            ) : analyticsError ? (
              <ErrorState
                title="Unable to load live KPIs"
                message={analyticsError.message}
                requestId={analyticsError.requestId}
                onRetry={() => void loadAnalytics()}
              />
            ) : analytics ? (
              <div className="space-y-4">
                {analytics.limitedView || analyticsVisibility === 'limited' ? (
                  <StatusBanner
                    tone="info"
                    title="Limited Support Analytics View"
                    description="Monetary totals (Gross Sales and AOV) are suppressed under analytics.read.limited."
                  />
                ) : null}

                {analytics.limitedView || analyticsVisibility === 'limited' ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Surface variant="elevated" border="hairline" padding="md" className="space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted">
                        Paid Orders
                      </p>
                      <p className="font-mono text-2xl font-medium tabular-nums text-ink">
                        {analytics.paidOrders}
                      </p>
                    </Surface>
                    <Surface variant="elevated" border="hairline" padding="md" className="space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted">
                        Pending Payment
                      </p>
                      <p className="font-mono text-2xl font-medium tabular-nums text-ink">
                        {analytics.pendingPaymentOrders}
                      </p>
                    </Surface>
                    <Surface variant="elevated" border="hairline" padding="md" className="space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted">
                        Open Returns
                      </p>
                      <p className="font-mono text-2xl font-medium tabular-nums text-ink">
                        {analytics.openReturnsCount}
                      </p>
                    </Surface>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <Surface variant="elevated" border="hairline" padding="md" className="space-y-1.5 transition-all duration-[var(--duration-fast)] hover:border-gold/50 hover:shadow-sm">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted">
                          Gross Sales
                        </p>
                        <span className="font-mono text-[10px] text-gold uppercase tracking-[0.04em]">IDR</span>
                      </div>
                      <p className="font-mono text-2xl font-medium tabular-nums text-ink">
                        {formatIDR(analytics.grossSalesIdr ?? 0)}
                      </p>
                    </Surface>
                    <Surface variant="elevated" border="hairline" padding="md" className="space-y-1.5 transition-all duration-[var(--duration-fast)] hover:border-strong-border hover:shadow-sm">
                      <p className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted">
                        Paid Orders
                      </p>
                      <p className="font-mono text-2xl font-medium tabular-nums text-ink">
                        {analytics.paidOrders}
                      </p>
                    </Surface>
                    <Surface variant="elevated" border="hairline" padding="md" className="space-y-1.5 transition-all duration-[var(--duration-fast)] hover:border-gold/50 hover:shadow-sm">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted">
                          AOV
                        </p>
                        <span className="font-mono text-[10px] text-gold uppercase tracking-[0.04em]">IDR</span>
                      </div>
                      <p className="font-mono text-2xl font-medium tabular-nums text-ink">
                        {formatIDR(analytics.averageOrderValueIdr ?? 0)}
                      </p>
                    </Surface>
                    <Surface variant="elevated" border="hairline" padding="md" className="space-y-1.5 transition-all duration-[var(--duration-fast)] hover:border-strong-border hover:shadow-sm">
                      <p className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted">
                        Pending Payment
                      </p>
                      <p className="font-mono text-2xl font-medium tabular-nums text-ink">
                        {analytics.pendingPaymentOrders}
                      </p>
                    </Surface>
                    <Surface variant="elevated" border="hairline" padding="md" className="space-y-1.5 transition-all duration-[var(--duration-fast)] hover:border-strong-border hover:shadow-sm">
                      <p className="text-xs font-medium uppercase tracking-[0.06em] text-ink-muted">
                        Open Returns
                      </p>
                      <p className="font-mono text-2xl font-medium tabular-nums text-ink">
                        {analytics.openReturnsCount}
                      </p>
                    </Surface>
                  </div>
                )}

                {analytics.totalOrders === 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-hairline bg-subtle px-4 py-3">
                    <p className="text-xs text-ink-muted">
                      No orders recorded in the current 30-day window.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {canAccess(['order.read', 'order.read.limited', 'order.fulfill', 'order.cancel']) ? (
                        <LinkButton href="/orders" variant="secondary" size="sm">
                          Open Orders Queue
                        </LinkButton>
                      ) : null}
                      {canAccess(['return.read', 'return.review', 'return.inspect', 'return.approve']) ? (
                        <LinkButton href="/returns" variant="secondary" size="sm">
                          Open Returns Queue
                        </LinkButton>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

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
                  <dd className="font-mono text-xs tabular-nums text-ink">
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

          <section aria-labelledby="ops-modules-heading" className="space-y-4">
            <h2 id="ops-modules-heading" className="font-display text-2xl font-normal text-ink">
              Phase 06 Commerce Operations
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Surface variant="subtle" border="hairline" padding="md" className="flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-ink">Orders &amp; Shipments</h3>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Advance fulfillment stages, create carrier shipments, sync tracking events, and initiate refunds.
                  </p>
                </div>
                <LinkButton
                  href="/orders"
                  variant="secondary"
                  size="sm"
                  aria-disabled={!canAccess(['order.read', 'order.read.limited', 'order.fulfill', 'order.cancel'])}
                >
                  Open Orders
                </LinkButton>
              </Surface>

              <Surface variant="subtle" border="hairline" padding="md" className="flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-ink">Returns &amp; Refunds</h3>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Triage returns, inspect physical receipt for RETURN_TO_STOCK, and authorize dual-step OWNER refunds.
                  </p>
                </div>
                <LinkButton
                  href="/returns"
                  variant="secondary"
                  size="sm"
                  aria-disabled={!canAccess(['return.read', 'return.review', 'return.inspect', 'return.approve', 'refund.request', 'refund.approve'])}
                >
                  Open Returns &amp; Refunds
                </LinkButton>
              </Surface>

              <Surface variant="subtle" border="hairline" padding="md" className="flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-ink">Promotional Coupons</h3>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Create percentage, fixed IDR, or free-shipping promotions with WIB scheduling windows.
                  </p>
                </div>
                <LinkButton
                  href="/coupons"
                  variant="secondary"
                  size="sm"
                  aria-disabled={!canAccess(['coupon.read', 'coupon.manage'])}
                >
                  Open Coupons
                </LinkButton>
              </Surface>

              <Surface variant="subtle" border="hairline" padding="md" className="flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-ink">Editorial CMS</h3>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Author Lookbooks, Journal essays, and Storefront Pages with preview and publish gates.
                  </p>
                </div>
                <LinkButton
                  href="/cms"
                  variant="secondary"
                  size="sm"
                  aria-disabled={!canAccess(['cms.read', 'cms.write', 'cms.publish'])}
                >
                  Open CMS
                </LinkButton>
              </Surface>
            </div>
          </section>

          <section aria-labelledby="catalog-modules-heading" className="space-y-4">
            <h2 id="catalog-modules-heading" className="font-display text-2xl font-normal text-ink">
              Phase 03 Catalog Operations
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Surface variant="subtle" border="hairline" padding="md" className="flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-ink">Products &amp; Publish Gate</h3>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Create draft silhouettes, manage multi-variant pricing with audit logs, attach
                    studio media, and execute 4-point Publish Gate reviews.
                  </p>
                </div>
                <LinkButton
                  href="/catalog/products"
                  variant="secondary"
                  size="sm"
                  aria-disabled={!canAccess(['product.read', 'product.write', 'product.publish'])}
                >
                  Open Products
                </LinkButton>
              </Surface>

              <Surface variant="subtle" border="hairline" padding="md" className="flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-ink">Categories &amp; Size Guides</h3>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Configure catalog taxonomy sort order, active status, and structured centimeter
                    measurement charts.
                  </p>
                </div>
                <LinkButton
                  href="/catalog/categories"
                  variant="secondary"
                  size="sm"
                  aria-disabled={!canAccess(['product.read', 'product.write'])}
                >
                  Open Categories
                </LinkButton>
              </Surface>

              <Surface variant="subtle" border="hairline" padding="md" className="flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-base font-semibold text-ink">Capsule Collections</h3>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Curate editorial collections, publication schedules, banner artwork, and product
                    ordering.
                  </p>
                </div>
                <LinkButton
                  href="/catalog/collections"
                  variant="secondary"
                  size="sm"
                  aria-disabled={!canAccess(['product.read', 'product.write'])}
                >
                  Open Collections
                </LinkButton>
              </Surface>
            </div>
          </section>

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
