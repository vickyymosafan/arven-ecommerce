'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  AdminCouponDto,
  CouponStatusInput,
  DiscountTypeInput,
} from '@arven/contracts';
import { createCouponSchema, updateCouponSchema } from '@arven/validators';
import {
  Badge,
  Button,
  DataTable,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  Select,
  StatusBanner,
  Surface,
  cn,
  formatIDR,
  formatWIB,
  useToast,
  type DataTableColumn,
} from '@arven/ui';
import { AdminForbiddenPanel } from '@/components/admin-forbidden-panel';
import { AdminShell } from '@/components/admin-shell';
import {
  AdminApiClientError,
  adminApi,
  extractAdminFieldErrors,
  type PaginationMeta,
} from '@/lib/api-client';
import {
  formatStatusLabel,
  fromWibDateTimeInputValue,
  getCouponStatusBadge,
  toWibDateTimeInputValue,
} from '@/lib/ops-helpers';
import { useAdminSession } from '@/lib/use-admin-session';

const COUPON_STATUS_OPTIONS: readonly CouponStatusInput[] = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'EXPIRED',
  'ARCHIVED',
];

const DISCOUNT_TYPES: ReadonlyArray<{ value: DiscountTypeInput; label: string }> = [
  { value: 'PERCENTAGE', label: 'Percentage (%)' },
  { value: 'FIXED_AMOUNT', label: 'Fixed Amount (IDR)' },
  { value: 'FREE_SHIPPING', label: 'Free Shipping' },
];

export default function AdminCouponsPage() {
  const { toast } = useToast();
  const { user, loading: sessionLoading, error: sessionError, canAccess, reload } =
    useAdminSession();

  const hasCouponsAccess = canAccess(['coupon.read', 'coupon.manage']);
  const canReadCoupons = canAccess(['coupon.read']);
  const canManageCoupons = canAccess(['coupon.manage']);

  const [draftQ, setDraftQ] = useState('');
  const [draftStatus, setDraftStatus] = useState<string>('');
  const [filters, setFilters] = useState<{ page: number; q: string; status: string }>({
    page: 1,
    q: '',
    status: '',
  });

  const [coupons, setCoupons] = useState<AdminCouponDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    requestId: '',
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [loadingCoupons, setLoadingCoupons] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );
  const [reloadNonce, setReloadNonce] = useState(0);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Create / Edit Modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<AdminCouponDto | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [discountType, setDiscountType] = useState<DiscountTypeInput>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('15');
  const [maxDiscountIdr, setMaxDiscountIdr] = useState('');
  const [minOrderSubtotalIdr, setMinOrderSubtotalIdr] = useState('0');
  const [usageLimitTotal, setUsageLimitTotal] = useState('');
  const [usageLimitPerUser, setUsageLimitPerUser] = useState('');
  const [startsAtWib, setStartsAtWib] = useState('');
  const [endsAtWib, setEndsAtWib] = useState('');
  const [couponStatus, setCouponStatus] = useState<'DRAFT' | 'ACTIVE' | 'PAUSED'>('DRAFT');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadCoupons = useCallback(() => {
    if (!user || !canReadCoupons) return;
    setLoadingCoupons(true);
    setLoadError(null);
    setReloadNonce((n) => n + 1);
  }, [canReadCoupons, user]);

  useEffect(() => {
    if (sessionLoading || !user || !canReadCoupons) {
      return;
    }

    let active = true;
    adminApi
      .listCoupons({
        page: filters.page,
        limit: 20,
        status: (filters.status as CouponStatusInput) || undefined,
        q: filters.q || undefined,
      })
      .then((result) => {
        if (!active) return;
        setCoupons(result.items);
        setMeta(result.meta);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({ message: 'Unable to load promotional coupons right now.' });
        }
      })
      .finally(() => {
        if (active) {
          setLoadingCoupons(false);
        }
      });

    return () => {
      active = false;
    };
  }, [canReadCoupons, filters, reloadNonce, sessionLoading, user]);

  const openCreateModal = () => {
    const now = new Date();
    const inThirtyDays = new Date(now.getTime() + 30 * 86_400_000);
    setEditingCoupon(null);
    setCode('');
    setName('');
    setDiscountType('PERCENTAGE');
    setDiscountValue('15');
    setMaxDiscountIdr('150000');
    setMinOrderSubtotalIdr('0');
    setUsageLimitTotal('');
    setUsageLimitPerUser('1');
    setStartsAtWib(toWibDateTimeInputValue(now.toISOString()));
    setEndsAtWib(toWibDateTimeInputValue(inThirtyDays.toISOString()));
    setCouponStatus('DRAFT');
    setFieldErrors({});
    setBannerError(null);
    setEditorOpen(true);
  };

  const openEditModal = (coupon: AdminCouponDto) => {
    setEditingCoupon(coupon);
    setCode(coupon.code);
    setName(coupon.name);
    setDiscountType(coupon.discountType);
    setDiscountValue(String(coupon.discountValue));
    setMaxDiscountIdr(coupon.maxDiscountIdr !== null ? String(coupon.maxDiscountIdr) : '');
    setMinOrderSubtotalIdr(String(coupon.minOrderSubtotalIdr));
    setUsageLimitTotal(coupon.usageLimitTotal !== null ? String(coupon.usageLimitTotal) : '');
    setUsageLimitPerUser(
      coupon.usageLimitPerUser !== null ? String(coupon.usageLimitPerUser) : '',
    );
    setStartsAtWib(toWibDateTimeInputValue(coupon.startsAt));
    setEndsAtWib(toWibDateTimeInputValue(coupon.endsAt));
    setCouponStatus(
      coupon.status === 'ACTIVE' || coupon.status === 'PAUSED' ? coupon.status : 'DRAFT',
    );
    setFieldErrors({});
    setBannerError(null);
    setEditorOpen(true);
  };

  const handleTogglePauseActivate = useCallback(
    async (coupon: AdminCouponDto) => {
      const nextStatus: 'ACTIVE' | 'PAUSED' = coupon.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
      setTogglingId(coupon.id);
      try {
        const updated = await adminApi.updateCoupon(coupon.id, { status: nextStatus });
        setCoupons((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
        toast({
          tone: 'success',
          title: nextStatus === 'ACTIVE' ? 'Coupon activated' : 'Coupon paused',
          description: `${updated.code} is now ${updated.status}.`,
        });
      } catch (err) {
        toast({
          tone: 'danger',
          title: 'Coupon status update failed',
          description:
            err instanceof AdminApiClientError
              ? err.message
              : 'Unable to update coupon status right now.',
        });
      } finally {
        setTogglingId(null);
      }
    },
    [toast],
  );

  const handleSubmitCoupon = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldErrors({});
    setBannerError(null);

    const startsAtIso = fromWibDateTimeInputValue(startsAtWib);
    const endsAtIso = fromWibDateTimeInputValue(endsAtWib);
    const nextErrors: Record<string, string> = {};

    if (!startsAtIso) {
      nextErrors['startsAt'] = 'Valid start date/time (WIB) is required.';
    }
    if (!endsAtIso) {
      nextErrors['endsAt'] = 'Valid end date/time (WIB) is required.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    const parsedDiscountValue =
      discountType === 'FREE_SHIPPING'
        ? 1
        : Number.parseInt(discountValue.replace(/\D/g, ''), 10) || 0;
    const parsedMaxDiscount =
      discountType === 'PERCENTAGE' && maxDiscountIdr.trim()
        ? Number.parseInt(maxDiscountIdr.replace(/\D/g, ''), 10)
        : null;
    const parsedMinSubtotal =
      minOrderSubtotalIdr.trim() !== ''
        ? Number.parseInt(minOrderSubtotalIdr.replace(/\D/g, ''), 10)
        : 0;
    const parsedLimitTotal = usageLimitTotal.trim()
      ? Number.parseInt(usageLimitTotal.replace(/\D/g, ''), 10)
      : null;
    const parsedLimitPerUser = usageLimitPerUser.trim()
      ? Number.parseInt(usageLimitPerUser.replace(/\D/g, ''), 10)
      : null;

    const payload = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      discountType,
      discountValue: parsedDiscountValue,
      maxDiscountIdr: parsedMaxDiscount,
      minOrderSubtotalIdr: Number.isFinite(parsedMinSubtotal) ? parsedMinSubtotal : 0,
      usageLimitTotal: parsedLimitTotal,
      usageLimitPerUser: parsedLimitPerUser,
      status: couponStatus,
      startsAt: startsAtIso!,
      endsAt: endsAtIso!,
    };

    const schema = editingCoupon ? updateCouponSchema : createCouponSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'code');
        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }
      setFieldErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      if (editingCoupon) {
        await adminApi.updateCoupon(editingCoupon.id, payload);
        toast({
          tone: 'success',
          title: 'Coupon updated',
          description: `Coupon ${payload.code} saved.`,
        });
      } else {
        await adminApi.createCoupon(payload);
        toast({
          tone: 'success',
          title: 'Coupon created',
          description: `Coupon ${payload.code} created in ${payload.status} status.`,
        });
      }
      setEditorOpen(false);
      await loadCoupons();
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setFieldErrors(extractAdminFieldErrors(err));
        setBannerError(err.message);
      } else {
        setBannerError('Unable to save coupon right now.');
      }
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<DataTableColumn<AdminCouponDto>[]>(
    () => [
      {
        key: 'code',
        header: 'Code & Name',
        render: (row) => (
          <div className="space-y-0.5">
            <p className="font-mono text-xs font-semibold uppercase text-ink">{row.code}</p>
            <p className="text-sm text-ink-secondary">{row.name}</p>
          </div>
        ),
      },
      {
        key: 'discount',
        header: 'Discount',
        render: (row) => {
          if (row.discountType === 'PERCENTAGE') {
            return (
              <span className="font-mono text-xs tabular-nums text-ink">
                {row.discountValue}%
                {row.maxDiscountIdr ? ` (cap ${formatIDR(row.maxDiscountIdr)})` : ''}
              </span>
            );
          }
          if (row.discountType === 'FIXED_AMOUNT') {
            return (
              <span className="font-mono text-xs tabular-nums text-ink">
                {formatIDR(row.discountValue)} off
              </span>
            );
          }
          return <span className="text-xs font-medium text-ink">Free Shipping</span>;
        },
      },
      {
        key: 'minSubtotal',
        header: 'Min Subtotal',
        render: (row) => (
          <span className="whitespace-nowrap font-mono text-xs tabular-nums text-ink">
            {formatIDR(row.minOrderSubtotalIdr)}
          </span>
        ),
      },
      {
        key: 'redemptions',
        header: 'Redemptions',
        render: (row) => (
          <span className="font-mono text-xs tabular-nums text-ink">
            {row.usedCount} / {row.usageLimitTotal ?? 'Unlimited'}
          </span>
        ),
      },
      {
        key: 'window',
        header: 'Active Window (WIB)',
        render: (row) => (
          <div className="space-y-0.5 font-mono text-xs tabular-nums text-ink-muted">
            <p>From: {formatWIB(row.startsAt)}</p>
            <p>To: {formatWIB(row.endsAt)}</p>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => {
          const badge = getCouponStatusBadge(row.status);
          return <Badge tone={badge.tone}>{badge.label}</Badge>;
        },
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        render: (row) =>
          canManageCoupons ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-h-11"
                onClick={() => openEditModal(row)}
              >
                Edit
              </Button>
              {row.status === 'ACTIVE' || row.status === 'PAUSED' || row.status === 'DRAFT' ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="min-h-11"
                  isLoading={togglingId === row.id}
                  loadingLabel="Updating"
                  onClick={() => void handleTogglePauseActivate(row)}
                >
                  {row.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                </Button>
              ) : null}
            </div>
          ) : (
            <span className="text-xs text-ink-muted">Read only</span>
          ),
      },
    ],
    [canManageCoupons, handleTogglePauseActivate, togglingId],
  );

  const liveFixedPreview = useMemo(() => {
    if (discountType !== 'FIXED_AMOUNT') return undefined;
    const numeric = Number.parseInt(discountValue.replace(/\D/g, ''), 10);
    if (!Number.isFinite(numeric) || numeric <= 0) return 'Enter whole Rupiah amount';
    return `Preview: ${formatIDR(numeric)}`;
  }, [discountType, discountValue]);

  return (
    <AdminShell
      title="Promotional Coupons"
      description="Manage percentage, fixed IDR, and free-shipping coupon campaigns with Asia/Jakarta (WIB) validity windows."
      user={user}
      actions={
        canManageCoupons ? (
          <Button type="button" variant="primary" size="md" onClick={openCreateModal}>
            Create Coupon
          </Button>
        ) : undefined
      }
    >
      {sessionLoading ? (
        <LoadingState label="Checking coupon permissions" rows={4} />
      ) : sessionError ? (
        <ErrorState
          title="Unable to verify staff session"
          message={sessionError.message}
          requestId={sessionError.requestId}
          onRetry={() => void reload()}
        />
      ) : !hasCouponsAccess ? (
        <AdminForbiddenPanel description="Your assigned role does not include coupon.read or coupon.manage permissions." />
      ) : !canReadCoupons ? (
        <AdminForbiddenPanel description="Listing promotional coupons requires coupon.read permission." />
      ) : (
        <div className="space-y-6">
          <Surface variant="subtle" border="hairline" padding="md">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setFilters({ page: 1, q: draftQ.trim(), status: draftStatus });
              }}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:items-end"
            >
              <div className="lg:col-span-5">
                <FormField id="coupons-search" label="Search Code or Name">
                  <Input
                    id="coupons-search"
                    placeholder="ARVEN15 or Seasonal Launch"
                    value={draftQ}
                    onChange={(event) => setDraftQ(event.target.value)}
                  />
                </FormField>
              </div>
              <div className="lg:col-span-4">
                <FormField id="coupons-status-filter" label="Coupon Status">
                  <Select
                    id="coupons-status-filter"
                    value={draftStatus}
                    onChange={(event) => setDraftStatus(event.target.value)}
                  >
                    <option value="">ALL</option>
                    {COUPON_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {formatStatusLabel(st)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="flex flex-wrap gap-2 lg:col-span-3 lg:justify-end">
                <Button type="submit" variant="primary" size="md">
                  Filter
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setDraftQ('');
                    setDraftStatus('');
                    setFilters({ page: 1, q: '', status: '' });
                  }}
                >
                  Reset
                </Button>
              </div>
            </form>
          </Surface>

          <DataTable
            caption="ARVEN promotional coupons"
            tableBreakpoint="lg"
            columns={columns}
            rows={coupons}
            getRowKey={(row) => row.id}
            isLoading={loadingCoupons}
            loadingLabel="Loading promotional coupons"
            error={loadError?.message ?? null}
            errorRequestId={loadError?.requestId ?? null}
            onRetry={() => void loadCoupons()}
            emptyTitle="No coupons found"
            emptyDescription="Create a coupon or clear the active filter."
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4 text-xs text-ink-muted">
            <span className="font-mono tabular-nums">
              Page {meta.page} of {meta.totalPages} ({meta.total} total coupons)
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="min-h-11"
                disabled={meta.page <= 1 || loadingCoupons}
                onClick={() => setFilters((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
              >
                Prev
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="min-h-11"
                disabled={meta.page >= meta.totalPages || loadingCoupons}
                onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Coupon Modal */}
      <Modal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingCoupon ? `Edit Coupon: ${editingCoupon.code}` : 'Create Promotional Coupon'}
        description="Configure discount rules, usage caps, and WIB (Asia/Jakarta) active window."
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setEditorOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="coupon-editor-form"
              variant="primary"
              isLoading={saving}
              loadingLabel="Saving..."
            >
              {editingCoupon ? 'Save Changes' : 'Create Coupon'}
            </Button>
          </>
        }
      >
        <form id="coupon-editor-form" onSubmit={handleSubmitCoupon} noValidate className="space-y-4">
          {bannerError ? <StatusBanner tone="danger" description={bannerError} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="coupon-code" label="Coupon Code" error={fieldErrors['code']} required>
              <Input
                id="coupon-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                invalid={Boolean(fieldErrors['code'])}
                placeholder="ARVEN15"
                className="font-mono uppercase"
              />
            </FormField>

            <FormField id="coupon-name" label="Campaign Name" error={fieldErrors['name']} required>
              <Input
                id="coupon-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                invalid={Boolean(fieldErrors['name'])}
                placeholder="Autumn Capsule Welcome"
              />
            </FormField>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium uppercase tracking-[0.06em] text-ink">
              Discount Type *
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {DISCOUNT_TYPES.map((option) => {
                const selected = discountType === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      'relative flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border px-3 py-2 text-xs font-medium transition-colors',
                      'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--arven-focus-ring)] has-[:focus-visible]:outline-offset-2',
                      selected
                        ? 'border-strong-border bg-panel text-ink'
                        : 'border-control-border bg-canvas text-ink-secondary hover:text-ink',
                    )}
                  >
                    <input
                      type="radio"
                      name="coupon-discount-type"
                      value={option.value}
                      checked={selected}
                      onChange={() => {
                        setDiscountType(option.value);
                        if (option.value === 'PERCENTAGE' && Number(discountValue) > 100) {
                          setDiscountValue('15');
                        }
                      }}
                      className="sr-only"
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            {discountType !== 'FREE_SHIPPING' ? (
              <FormField
                id="coupon-discount-value"
                label={discountType === 'PERCENTAGE' ? 'Percentage (1-100)' : 'Discount Amount (IDR)'}
                hint={liveFixedPreview}
                error={fieldErrors['discountValue']}
                required
              >
                <Input
                  id="coupon-discount-value"
                  type="text"
                  inputMode="numeric"
                  value={discountValue}
                  onChange={(event) => setDiscountValue(event.target.value.replace(/\D/g, ''))}
                  invalid={Boolean(fieldErrors['discountValue'])}
                  className="font-mono tabular-nums"
                />
              </FormField>
            ) : (
              <div className="rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3 text-xs text-ink-muted">
                Free shipping waives calculated courier fees during quote and checkout.
              </div>
            )}

            <FormField
              id="coupon-max-discount"
              label="Max Discount Cap (IDR)"
              hint={discountType === 'PERCENTAGE' ? 'Optional cap for % discounts' : 'Percentage only'}
              error={fieldErrors['maxDiscountIdr']}
            >
              <Input
                id="coupon-max-discount"
                type="text"
                inputMode="numeric"
                disabled={discountType !== 'PERCENTAGE'}
                value={discountType === 'PERCENTAGE' ? maxDiscountIdr : ''}
                onChange={(event) => setMaxDiscountIdr(event.target.value.replace(/\D/g, ''))}
                invalid={Boolean(fieldErrors['maxDiscountIdr'])}
                placeholder="150000"
                className="font-mono tabular-nums"
              />
            </FormField>

            <FormField
              id="coupon-min-subtotal"
              label="Min Order Subtotal (IDR)"
              error={fieldErrors['minOrderSubtotalIdr']}
            >
              <Input
                id="coupon-min-subtotal"
                type="text"
                inputMode="numeric"
                value={minOrderSubtotalIdr}
                onChange={(event) =>
                  setMinOrderSubtotalIdr(event.target.value.replace(/\D/g, ''))
                }
                invalid={Boolean(fieldErrors['minOrderSubtotalIdr'])}
                className="font-mono tabular-nums"
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              id="coupon-limit-total"
              label="Total Usage Limit"
              hint="Leave blank for unlimited"
              error={fieldErrors['usageLimitTotal']}
            >
              <Input
                id="coupon-limit-total"
                type="text"
                inputMode="numeric"
                value={usageLimitTotal}
                onChange={(event) => setUsageLimitTotal(event.target.value.replace(/\D/g, ''))}
                invalid={Boolean(fieldErrors['usageLimitTotal'])}
                className="font-mono tabular-nums"
              />
            </FormField>

            <FormField
              id="coupon-limit-user"
              label="Per-User Limit"
              error={fieldErrors['usageLimitPerUser']}
            >
              <Input
                id="coupon-limit-user"
                type="text"
                inputMode="numeric"
                value={usageLimitPerUser}
                onChange={(event) => setUsageLimitPerUser(event.target.value.replace(/\D/g, ''))}
                invalid={Boolean(fieldErrors['usageLimitPerUser'])}
                className="font-mono tabular-nums"
              />
            </FormField>

            <FormField id="coupon-status" label="Initial / Current Status" error={fieldErrors['status']}>
              <Select
                id="coupon-status"
                value={couponStatus}
                onChange={(event) =>
                  setCouponStatus(event.target.value as 'DRAFT' | 'ACTIVE' | 'PAUSED')
                }
              >
                <option value="DRAFT">DRAFT</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="PAUSED">PAUSED</option>
              </Select>
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="coupon-starts-at"
              label="Starts At (WIB / Asia/Jakarta)"
              error={fieldErrors['startsAt']}
              required
            >
              <Input
                id="coupon-starts-at"
                type="datetime-local"
                value={startsAtWib}
                onChange={(event) => setStartsAtWib(event.target.value)}
                invalid={Boolean(fieldErrors['startsAt'])}
                className="font-mono text-sm"
              />
            </FormField>

            <FormField
              id="coupon-ends-at"
              label="Ends At (WIB / Asia/Jakarta)"
              error={fieldErrors['endsAt']}
              required
            >
              <Input
                id="coupon-ends-at"
                type="datetime-local"
                value={endsAtWib}
                onChange={(event) => setEndsAtWib(event.target.value)}
                invalid={Boolean(fieldErrors['endsAt'])}
                className="font-mono text-sm"
              />
            </FormField>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}
