'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { adminLoginRequestSchema } from '@arven/validators';
import {
  ArvenWordmark,
  Badge,
  Button,
  FormField,
  Input,
  LoadingState,
  PasswordInput,
  SkipLink,
  StatusBanner,
  Surface,
  ThemeToggle,
  useToast,
} from '@arven/ui';
import {
  AdminApiClientError,
  adminApi,
  extractAdminFieldErrors,
} from '@/lib/api-client';
import { sanitizeRedirectPath } from '@/lib/redirect';

function AdminLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const nextPath = sanitizeRedirectPath(searchParams.get('next'), '/');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const parsed = adminLoginRequestSchema.safeParse({
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
      const session = await adminApi.loginAdmin(parsed.data);
      toast({
        tone: 'info',
        title: 'Credentials accepted',
        description: 'Complete authenticator verification to enter the console.',
      });

      const nextQuery = nextPath !== '/' ? `?next=${encodeURIComponent(nextPath)}` : '';
      if (session.mfaSetupRequired || !session.user.mfaEnabled) {
        router.replace(`/mfa/setup${nextQuery}`);
      } else if (session.mfaRequired) {
        router.replace(`/mfa/verify${nextQuery}`);
      } else {
        router.replace(nextPath);
      }
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setFieldErrors(extractAdminFieldErrors(err));
        setFormError({ message: err.message, requestId: err.requestId });
      } else {
        setFormError({ message: 'Unable to authenticate right now. Please try again.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warning">Staff Portal</Badge>
          <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
            Mandatory TOTP MFA
          </span>
        </div>
        <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
          Operations Sign In
        </h1>
        <p className="text-sm leading-relaxed text-ink-muted">
          Authorized ARVEN personnel only. Storefront customer accounts are rejected at this
          portal boundary.
        </p>
      </div>

      {formError ? (
        <StatusBanner
          tone="danger"
          title="Authentication failed"
          description={formError.message}
          requestId={formError.requestId}
        />
      ) : null}

      <Surface variant="elevated" border="hairline" padding="lg">
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <FormField id="admin-email" label="Staff Email" error={fieldErrors['email']} required>
            <Input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              invalid={Boolean(fieldErrors['email'])}
              aria-describedby={fieldErrors['email'] ? 'admin-email-error' : undefined}
            />
          </FormField>

          <FormField
            id="admin-password"
            label="Password"
            error={fieldErrors['password']}
            required
          >
            <PasswordInput
              id="admin-password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              invalid={Boolean(fieldErrors['password'])}
              aria-describedby={fieldErrors['password'] ? 'admin-password-error' : undefined}
            />
          </FormField>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={submitting}
            loadingLabel="Verifying staff credentials"
          >
            Continue to MFA
          </Button>
        </form>
      </Surface>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <SkipLink href="#main-content" />
      <header className="border-b border-hairline bg-subtle">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <ArvenWordmark />
            <span className="border-l border-hairline pl-3 font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
              Admin
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
        <Suspense fallback={<LoadingState label="Preparing staff sign in" rows={3} />}>
          <AdminLoginContent />
        </Suspense>
      </main>
    </div>
  );
}
