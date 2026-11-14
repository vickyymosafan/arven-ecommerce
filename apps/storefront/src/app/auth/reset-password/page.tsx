'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { resetPasswordRequestSchema } from '@arven/validators';
import {
  Button,
  FormField,
  Input,
  LoadingState,
  PasswordInput,
  StatusBanner,
  Surface,
  useToast,
} from '@arven/ui';
import { StorefrontShell } from '@/components/storefront-shell';
import { ApiClientError, extractFieldErrors, storefrontApi } from '@/lib/api-client';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [bannerError, setBannerError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBannerError(null);
    setFieldErrors({});

    const nextErrors: Record<string, string> = {};
    const parsed = resetPasswordRequestSchema.safeParse({
      token: token.trim(),
      newPassword,
    });

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }
    }

    if (newPassword !== confirmPassword) {
      nextErrors['confirmPassword'] = 'Passwords do not match.';
    }

    if (Object.keys(nextErrors).length > 0 || !parsed.success) {
      setFieldErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      await storefrontApi.resetPassword(parsed.data);
      toast({
        tone: 'success',
        title: 'Password reset complete',
        description: 'Sign in with your updated password.',
      });
      router.replace('/auth/login?reset=1');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFieldErrors(extractFieldErrors(err));
        setBannerError({ message: err.message, requestId: err.requestId });
      } else {
        setBannerError({ message: 'Unable to complete password reset. Please try again.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
          Credential Recovery
        </p>
        <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
          Choose a New Password
        </h1>
        <p className="text-sm leading-relaxed text-ink-muted">
          Set a new password with at least 12 characters. Existing sessions will be signed out.
        </p>
      </div>

      {bannerError ? (
        <StatusBanner
          tone="danger"
          title="Reset failed"
          description={bannerError.message}
          requestId={bannerError.requestId}
        />
      ) : null}

      <Surface variant="elevated" border="hairline" padding="lg">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <FormField id="reset-token" label="Reset Token" error={fieldErrors['token']} required>
            <Input
              id="reset-token"
              name="token"
              type="text"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              invalid={Boolean(fieldErrors['token'])}
              className="font-mono text-sm"
              aria-describedby={fieldErrors['token'] ? 'reset-token-error' : undefined}
            />
          </FormField>

          <FormField
            id="reset-password"
            label="New Password"
            hint="Minimum 12 characters."
            error={fieldErrors['newPassword']}
            required
          >
            <PasswordInput
              id="reset-password"
              name="newPassword"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              invalid={Boolean(fieldErrors['newPassword'])}
              aria-describedby={
                fieldErrors['newPassword'] ? 'reset-password-error' : 'reset-password-hint'
              }
            />
          </FormField>

          <FormField
            id="reset-confirm-password"
            label="Confirm New Password"
            error={fieldErrors['confirmPassword']}
            required
          >
            <PasswordInput
              id="reset-confirm-password"
              name="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              invalid={Boolean(fieldErrors['confirmPassword'])}
              aria-describedby={
                fieldErrors['confirmPassword'] ? 'reset-confirm-password-error' : undefined
              }
            />
          </FormField>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={submitting}
            loadingLabel="Updating password"
          >
            Update Password
          </Button>
        </form>
      </Surface>

      <p className="text-center text-sm text-ink-muted">
        <Link href="/auth/login" className="font-medium text-link hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <StorefrontShell narrow>
      <Suspense fallback={<LoadingState label="Preparing password reset" rows={3} />}>
        <ResetPasswordContent />
      </Suspense>
    </StorefrontShell>
  );
}
