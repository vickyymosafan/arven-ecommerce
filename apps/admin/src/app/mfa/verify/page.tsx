'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { mfaVerifyRequestSchema } from '@arven/validators';
import {
  ArvenWordmark,
  Badge,
  Button,
  FormField,
  Input,
  LoadingState,
  SkipLink,
  StatusBanner,
  Surface,
  ThemeToggle,
  useToast,
} from '@arven/ui';
import { AdminApiClientError, adminApi } from '@/lib/api-client';
import { sanitizeRedirectPath } from '@/lib/redirect';

function MfaVerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const isStepUp = searchParams.get('reason') === 'step-up';
  const nextPath = sanitizeRedirectPath(searchParams.get('next'), '/');

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [bannerError, setBannerError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBannerError(null);
    setCodeError(undefined);

    const parsed = mfaVerifyRequestSchema.safeParse({ code: code.trim() });
    if (!parsed.success) {
      setCodeError(parsed.error.issues[0]?.message ?? 'Enter a valid 6-digit code.');
      return;
    }

    setSubmitting(true);
    try {
      await adminApi.verifyMfa(parsed.data);
      toast({
        tone: 'success',
        title: isStepUp ? 'Step-up confirmed' : 'MFA verified',
        description: 'Session assurance updated.',
      });
      router.replace(nextPath);
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        if (err.status === 401) {
          router.replace('/login');
          return;
        }
        setBannerError({ message: err.message, requestId: err.requestId });
      } else {
        setBannerError({ message: 'Unable to verify authenticator code right now.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await adminApi.logout();
      router.replace('/login');
    } catch {
      router.replace('/login');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={isStepUp ? 'warning' : 'info'}>
            {isStepUp ? 'Step-Up Assurance' : 'Two-Factor Check'}
          </Badge>
          <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
            6-Digit TOTP
          </span>
        </div>
        <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
          Verify Authenticator Code
        </h1>
        <p className="text-sm leading-relaxed text-ink-muted">
          {isStepUp
            ? 'Privileged role changes require fresh TOTP confirmation within the last 15 minutes.'
            : 'Enter the current 6-digit verification code from your enrolled authenticator device.'}
        </p>
      </div>

      {isStepUp ? (
        <StatusBanner
          tone="warning"
          title="Fresh MFA confirmation required"
          description="Verify a live TOTP code to continue with role governance or permission changes."
        />
      ) : null}

      {bannerError ? (
        <StatusBanner
          tone="danger"
          title="Verification rejected"
          description={bannerError.message}
          requestId={bannerError.requestId}
        />
      ) : null}

      <Surface variant="elevated" border="hairline" padding="lg" className="space-y-4">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <FormField
            id="mfa-verify-code"
            label="Authenticator Code"
            error={codeError}
            required
          >
            <Input
              id="mfa-verify-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              invalid={Boolean(codeError)}
              className="font-mono text-lg tracking-[0.25em]"
            />
          </FormField>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={submitting}
            loadingLabel="Verifying code"
          >
            Verify &amp; Continue
          </Button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            isLoading={signingOut}
            loadingLabel="Signing out"
            onClick={() => void handleSignOut()}
          >
            Sign Out
          </Button>
          {isStepUp ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => router.replace('/')}>
              Return to Overview
            </Button>
          ) : null}
        </div>
      </Surface>
    </div>
  );
}

export default function AdminMfaVerifyPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <SkipLink href="#main-content" />
      <header className="border-b border-hairline bg-subtle">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <ArvenWordmark />
            <span className="border-l border-hairline pl-3 font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
              MFA Verify
            </span>
          </div>
          <ThemeToggle defaultTheme="dark" storageKey="arven-admin-theme" />
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6"
      >
        <Suspense fallback={<LoadingState label="Preparing MFA check" rows={2} />}>
          <MfaVerifyContent />
        </Suspense>
      </main>
    </div>
  );
}
