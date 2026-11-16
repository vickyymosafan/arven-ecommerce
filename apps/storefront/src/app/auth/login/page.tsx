'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import type { CartDto } from '@arven/contracts';
import { loginRequestSchema } from '@arven/validators';
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
import {
  ApiClientError,
  extractFieldErrors,
  notifyCartUpdated,
  storefrontApi,
} from '@/lib/api-client';
import { sanitizeRedirectPath } from '@/lib/redirect';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const nextPath = sanitizeRedirectPath(searchParams.get('next'), '/account');
  const verifiedNotice = searchParams.get('verified') === '1';
  const resetNotice = searchParams.get('reset') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = loginRequestSchema.safeParse({
      email: email.trim(),
      password,
    });

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

    setSubmitting(true);
    try {
      await storefrontApi.loginCustomer(parsed.data);
      let mergedCart: CartDto | undefined;
      try {
        const mergeResult = await storefrontApi.mergeGuestCart();
        mergedCart = mergeResult.cart;
      } catch {
        /* ignore when no guest cart exists */
      }
      notifyCartUpdated(mergedCart);
      toast({
        tone: 'success',
        title: 'Signed in',
        description: 'Welcome back to your ARVEN account.',
      });
      router.replace(nextPath);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFieldErrors(extractFieldErrors(err));
        setFormError({ message: err.message, requestId: err.requestId });
      } else {
        setFormError({ message: 'Unable to sign in right now. Please try again.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
          Clientele Sign In
        </p>
        <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
          Access Your Account
        </h1>
        <p className="text-sm leading-relaxed text-ink-muted">
          Sign in with your ARVEN customer credentials to review your profile, shipping addresses,
          and active device sessions.
        </p>
      </div>

      {verifiedNotice ? (
        <StatusBanner
          tone="success"
          title="Email verified"
          description="Your email address has been confirmed. Sign in to continue."
        />
      ) : null}

      {resetNotice ? (
        <StatusBanner
          tone="success"
          title="Password updated"
          description="Your password has been changed and previous sessions were cleared. Sign in with your new password."
        />
      ) : null}

      {formError ? (
        <StatusBanner
          tone="danger"
          title="Sign in failed"
          description={formError.message}
          requestId={formError.requestId}
        />
      ) : null}

      <Surface variant="elevated" border="hairline" padding="lg">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <FormField id="login-email" label="Email Address" error={fieldErrors['email']} required>
            <Input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@domain.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              invalid={Boolean(fieldErrors['email'])}
              aria-describedby={fieldErrors['email'] ? 'login-email-error' : undefined}
            />
          </FormField>

          <FormField id="login-password" label="Password" error={fieldErrors['password']} required>
            <PasswordInput
              id="login-password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              invalid={Boolean(fieldErrors['password'])}
              aria-describedby={fieldErrors['password'] ? 'login-password-error' : undefined}
            />
          </FormField>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Link
              href="/auth/forgot-password"
              className="inline-flex min-h-11 items-center text-link hover:underline"
            >
              Forgot password?
            </Link>
            <Link
              href="/auth/verify-email"
              className="inline-flex min-h-11 items-center text-ink-muted hover:text-ink hover:underline"
            >
              Have a verification token?
            </Link>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={submitting}
            loadingLabel="Signing in"
          >
            Sign In
          </Button>
        </form>
      </Surface>

      <p className="text-center text-sm text-ink-muted">
        New to ARVEN?{' '}
        <Link href="/auth/register" className="font-medium text-link hover:underline">
          Create a clientele account
        </Link>
      </p>
    </div>
  );
}

export default function CustomerLoginPage() {
  return (
    <StorefrontShell narrow>
      <Suspense fallback={<LoadingState label="Preparing sign in form" rows={3} />}>
        <LoginFormContent />
      </Suspense>
    </StorefrontShell>
  );
}
