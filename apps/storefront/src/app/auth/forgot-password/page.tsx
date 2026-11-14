'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { forgotPasswordRequestSchema } from '@arven/validators';
import { Button, FormField, Input, LinkButton, StatusBanner, Surface } from '@arven/ui';
import { StorefrontShell } from '@/components/storefront-shell';
import { ApiClientError, storefrontApi } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [bannerError, setBannerError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBannerError(null);
    setEmailError(undefined);

    const parsed = forgotPasswordRequestSchema.safeParse({ email: email.trim() });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? 'Enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      await storefrontApi.forgotPassword(parsed.data);
      setAccepted(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setBannerError({ message: err.message, requestId: err.requestId });
      } else {
        setBannerError({
          message: 'Unable to submit your reset request right now. Please try again.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StorefrontShell narrow>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
            Credential Recovery
          </p>
          <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
            Reset Your Password
          </h1>
          <p className="text-sm leading-relaxed text-ink-muted">
            Enter your account email address to request a one-time password reset token.
          </p>
        </div>

        {accepted ? (
          <Surface variant="elevated" border="control" padding="lg" className="space-y-5">
            <StatusBanner
              tone="info"
              title="Reset request accepted"
              description="If an account matches that email address, password reset instructions have been dispatched."
            />
            <div className="flex flex-wrap items-center gap-3">
              <LinkButton href="/auth/reset-password" variant="primary">
                Enter Reset Token
              </LinkButton>
              <LinkButton href="/auth/login" variant="secondary">
                Back to Sign In
              </LinkButton>
            </div>
          </Surface>
        ) : (
          <>
            {bannerError ? (
              <StatusBanner
                tone="danger"
                title="Request failed"
                description={bannerError.message}
                requestId={bannerError.requestId}
              />
            ) : null}

            <Surface variant="elevated" border="hairline" padding="lg">
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <FormField id="forgot-email" label="Email Address" error={emailError} required>
                  <Input
                    id="forgot-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    invalid={Boolean(emailError)}
                    aria-describedby={emailError ? 'forgot-email-error' : undefined}
                  />
                </FormField>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  isLoading={submitting}
                  loadingLabel="Sending instructions"
                >
                  Request Reset Instructions
                </Button>
              </form>
            </Surface>

            <p className="text-center text-sm text-ink-muted">
              Remembered your password?{' '}
              <Link href="/auth/login" className="font-medium text-link hover:underline">
                Return to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </StorefrontShell>
  );
}
