'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { UserProfileResponse } from '@arven/contracts';
import { updateProfileRequestSchema } from '@arven/validators';
import {
  Badge,
  Button,
  Divider,
  ErrorState,
  FormField,
  Input,
  LinkButton,
  LoadingState,
  StatusBanner,
  Surface,
  formatWIB,
  useToast,
} from '@arven/ui';
import { AccountShell } from '@/components/account-shell';
import { ApiClientError, extractFieldErrors, storefrontApi } from '@/lib/api-client';

export default function CustomerAccountPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await storefrontApi.getProfile();
      setProfile(data);
      setFullName(data.fullName);
      setPhone(data.phone ?? '');
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
        router.replace('/auth/login?next=/account');
        return;
      }
      if (err instanceof ApiClientError) {
        setLoadError({ message: err.message, requestId: err.requestId });
      } else {
        setLoadError({ message: 'Unable to load your profile right now.' });
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let active = true;
    storefrontApi
      .getProfile()
      .then((data) => {
        if (!active) return;
        setProfile(data);
        setFullName(data.fullName);
        setPhone(data.phone ?? '');
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          router.replace('/auth/login?next=/account');
          return;
        }
        if (err instanceof ApiClientError) {
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({ message: 'Unable to load your profile right now.' });
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

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError(null);
    setFieldErrors({});

    const payload = {
      fullName: fullName.trim(),
      phone: phone.trim() ? phone.trim() : null,
    };

    const parsed = updateProfileRequestSchema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }
      setFieldErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const updated = await storefrontApi.updateProfile(parsed.data);
      setProfile(updated);
      setFullName(updated.fullName);
      setPhone(updated.phone ?? '');
      toast({
        tone: 'success',
        title: 'Profile updated',
        description: 'Your personal contact details have been saved.',
      });
    } catch (err) {
      if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
        router.replace('/auth/login?next=/account');
        return;
      }
      if (err instanceof ApiClientError) {
        setFieldErrors(extractFieldErrors(err));
        setSaveError({ message: err.message, requestId: err.requestId });
      } else {
        setSaveError({ message: 'Unable to save your changes right now.' });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccountShell
      title="Profile Overview"
      description="Manage your ARVEN contact identity and inspect account verification status."
    >
      {loading ? (
        <LoadingState label="Loading your profile" rows={4} />
      ) : loadError ? (
        <ErrorState
          title="Could not load account profile"
          message={loadError.message}
          requestId={loadError.requestId}
          onRetry={() => void loadProfile()}
        />
      ) : profile ? (
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Surface variant="elevated" border="hairline" padding="lg" className="space-y-6">
              <div className="space-y-1">
                <h2 className="font-display text-2xl font-normal text-ink">Personal Details</h2>
                <p className="text-sm text-ink-muted">
                  Update your name or telephone contact used for future order coordination.
                </p>
              </div>

              {saveError ? (
                <StatusBanner
                  tone="danger"
                  title="Update failed"
                  description={saveError.message}
                  requestId={saveError.requestId}
                />
              ) : null}

              <form onSubmit={handleSave} noValidate className="space-y-5">
                <FormField id="profile-email" label="Registered Email">
                  <Input
                    id="profile-email"
                    type="email"
                    value={profile.email}
                    disabled
                    readOnly
                    aria-readonly="true"
                  />
                </FormField>

                <FormField
                  id="profile-full-name"
                  label="Full Name"
                  error={fieldErrors['fullName']}
                  required
                >
                  <Input
                    id="profile-full-name"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    invalid={Boolean(fieldErrors['fullName'])}
                    aria-describedby={fieldErrors['fullName'] ? 'profile-full-name-error' : undefined}
                  />
                </FormField>

                <FormField
                  id="profile-phone"
                  label="Phone Number"
                  hint="Indonesian or international number, e.g. +6281234567890. Leave blank to clear."
                  error={fieldErrors['phone']}
                >
                  <Input
                    id="profile-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    invalid={Boolean(fieldErrors['phone'])}
                    aria-describedby={
                      fieldErrors['phone'] ? 'profile-phone-error' : 'profile-phone-hint'
                    }
                  />
                </FormField>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={saving}
                    loadingLabel="Saving profile"
                  >
                    Save Changes
                  </Button>
                </div>
              </form>
            </Surface>
          </div>

          <div className="space-y-6 lg:col-span-5">
            <Surface variant="panel" border="hairline" padding="lg" className="space-y-4">
              <h2 className="font-display text-2xl font-normal text-ink">Account Standing</h2>
              <Divider />
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Status</dt>
                  <dd>
                    <Badge tone={profile.status === 'ACTIVE' ? 'success' : 'warning'}>
                      {profile.status}
                    </Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Email Verification</dt>
                  <dd>
                    <Badge
                      tone={profile.status === 'PENDING_VERIFICATION' ? 'warning' : 'success'}
                    >
                      {profile.status === 'PENDING_VERIFICATION' ? 'Pending' : 'Verified'}
                    </Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-ink-muted">Member Since</dt>
                  <dd className="font-mono text-xs text-ink">{formatWIB(profile.createdAt)}</dd>
                </div>
              </dl>

              {profile.status === 'PENDING_VERIFICATION' ? (
                <div className="pt-2">
                  <Link
                    href="/auth/verify-email"
                    className="inline-flex min-h-11 items-center text-sm font-medium text-link hover:underline"
                  >
                    Verify email token
                  </Link>
                </div>
              ) : null}
            </Surface>

            <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
              <h2 className="font-display text-2xl font-normal text-ink">Related Controls</h2>
              <p className="text-sm leading-relaxed text-ink-muted">
                Review saved Indonesian shipping addresses or revoke active browser sessions across
                devices.
              </p>
              <div className="flex flex-wrap gap-3">
                <LinkButton href="/account/addresses" variant="secondary" size="sm">
                  Address Book
                </LinkButton>
                <LinkButton href="/account/sessions" variant="secondary" size="sm">
                  Active Sessions
                </LinkButton>
              </div>
            </Surface>
          </div>
        </div>
      ) : null}
    </AccountShell>
  );
}
