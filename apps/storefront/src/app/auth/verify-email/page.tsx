'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { verifyEmailRequestSchema } from '@arven/validators';
import {
  Button,
  FormField,
  Input,
  LinkButton,
  LoadingState,
  StatusBanner,
  Surface,
} from '@arven/ui';
import { StorefrontShell } from '@/components/storefront-shell';
import { ApiClientError, storefrontApi } from '@/lib/api-client';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const queryToken = searchParams.get('token') ?? '';

  const [token, setToken] = useState(queryToken);
  const [submitting, setSubmitting] = useState(false);
  const [verified, setVerified] = useState(false);
  const [tokenError, setTokenError] = useState<string | undefined>(undefined);
  const [bannerError, setBannerError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );
  const autoAttemptedRef = useRef(false);

  const submitToken = useCallback(async (candidateToken: string) => {
    setBannerError(null);
    setTokenError(undefined);

    const parsed = verifyEmailRequestSchema.safeParse({ token: candidateToken.trim() });
    if (!parsed.success) {
      setTokenError(parsed.error.issues[0]?.message ?? 'Enter a valid verification token.');
      return;
    }

    setSubmitting(true);
    try {
      await storefrontApi.verifyEmail(parsed.data);
      setVerified(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setBannerError({ message: err.message, requestId: err.requestId });
      } else {
        setBannerError({
          message: 'Unable to verify your email right now. Please try again.',
        });
      }
    } finally {
      setSubmitting(false);
    }
  }, []);

  useEffect(() => {
    if (queryToken && !autoAttemptedRef.current) {
      autoAttemptedRef.current = true;
      void submitToken(queryToken);
    }
  }, [queryToken, submitToken]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitToken(token);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
          Email Confirmation
        </p>
        <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
          Verify Email Address
        </h1>
        <p className="text-sm leading-relaxed text-ink-muted">
          Confirm ownership of your email address using the verification token sent after registration.
        </p>
      </div>

      {verified ? (
        <Surface variant="elevated" border="control" padding="lg" className="space-y-5">
          <StatusBanner
            tone="success"
            title="Email address verified"
            description="Your email is confirmed and your account is ready for sign in."
          />
          <LinkButton href="/auth/login?verified=1" variant="primary" size="lg">
            Sign In to ARVEN
          </LinkButton>
        </Surface>
      ) : (
        <>
          {bannerError ? (
            <StatusBanner
              tone="danger"
              title="Verification failed"
              description={bannerError.message}
              requestId={bannerError.requestId}
            />
          ) : null}

          <Surface variant="elevated" border="hairline" padding="lg">
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <FormField
                id="verify-token"
                label="Verification Token"
                hint="Paste the token included in your verification email."
                error={tokenError}
                required
              >
                <Input
                  id="verify-token"
                  name="token"
                  type="text"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  invalid={Boolean(tokenError)}
                  className="font-mono text-sm"
                  aria-describedby={tokenError ? 'verify-token-error' : 'verify-token-hint'}
                />
              </FormField>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                isLoading={submitting}
                loadingLabel="Verifying email"
              >
                Verify Email
              </Button>
            </form>
          </Surface>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <StorefrontShell narrow>
      <Suspense fallback={<LoadingState label="Checking verification token" rows={2} />}>
        <VerifyEmailContent />
      </Suspense>
    </StorefrontShell>
  );
}
