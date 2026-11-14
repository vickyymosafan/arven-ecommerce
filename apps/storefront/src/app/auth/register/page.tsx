'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { registerRequestSchema } from '@arven/validators';
import {
  Button,
  FormField,
  Input,
  LinkButton,
  PasswordInput,
  StatusBanner,
  Surface,
  useToast,
} from '@arven/ui';
import { StorefrontShell } from '@/components/storefront-shell';
import { ApiClientError, extractFieldErrors, storefrontApi } from '@/lib/api-client';

export default function CustomerRegisterPage() {
  const { toast } = useToast();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const payload = {
      fullName: fullName.trim(),
      email: email.trim(),
      password,
      ...(phone.trim() ? { phone: phone.trim() } : {}),
    };

    const parsed = registerRequestSchema.safeParse(payload);
    const nextErrors: Record<string, string> = {};

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!nextErrors[key]) {
          nextErrors[key] = issue.message;
        }
      }
    }

    if (password !== confirmPassword) {
      nextErrors['confirmPassword'] = 'Passwords do not match.';
    }

    if (Object.keys(nextErrors).length > 0 || !parsed.success) {
      setFieldErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const result = await storefrontApi.registerCustomer(parsed.data);
      setRegisteredEmail(result.user.email);
      toast({
        tone: 'success',
        title: 'Account created',
        description: 'Check your email inbox to confirm your address before signing in.',
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFieldErrors(extractFieldErrors(err));
        setFormError({ message: err.message, requestId: err.requestId });
      } else {
        setFormError({ message: 'Unable to create your account right now. Please try again.' });
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
            New Registration
          </p>
          <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
            Create Clientele Account
          </h1>
          <p className="text-sm leading-relaxed text-ink-muted">
            Register an ARVEN customer profile. Passwords require at least 12 characters.
          </p>
        </div>

        {registeredEmail ? (
          <Surface variant="elevated" border="control" padding="lg" className="space-y-5">
            <StatusBanner
              tone="success"
              title="Registration received"
              description={`We prepared a verification email for ${registeredEmail}. Confirm your email address using the verification link or token before signing in.`}
            />
            <div className="flex flex-wrap items-center gap-3">
              <LinkButton href="/auth/verify-email" variant="primary">
                Enter Verification Token
              </LinkButton>
              <LinkButton href="/auth/login" variant="secondary">
                Proceed to Sign In
              </LinkButton>
            </div>
          </Surface>
        ) : (
          <>
            {formError ? (
              <StatusBanner
                tone="danger"
                title="Registration unsuccessful"
                description={formError.message}
                requestId={formError.requestId}
              />
            ) : null}

            <Surface variant="elevated" border="hairline" padding="lg">
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <FormField
                  id="register-full-name"
                  label="Full Name"
                  error={fieldErrors['fullName']}
                  required
                >
                  <Input
                    id="register-full-name"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    invalid={Boolean(fieldErrors['fullName'])}
                    aria-describedby={fieldErrors['fullName'] ? 'register-full-name-error' : undefined}
                  />
                </FormField>

                <FormField
                  id="register-email"
                  label="Email Address"
                  error={fieldErrors['email']}
                  required
                >
                  <Input
                    id="register-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    invalid={Boolean(fieldErrors['email'])}
                    aria-describedby={fieldErrors['email'] ? 'register-email-error' : undefined}
                  />
                </FormField>

                <FormField
                  id="register-phone"
                  label="Phone Number (Optional)"
                  hint="Include country code if outside Indonesia, e.g. +6281234567890."
                  error={fieldErrors['phone']}
                >
                  <Input
                    id="register-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    invalid={Boolean(fieldErrors['phone'])}
                    aria-describedby={
                      fieldErrors['phone'] ? 'register-phone-error' : 'register-phone-hint'
                    }
                  />
                </FormField>

                <FormField
                  id="register-password"
                  label="Password"
                  hint="Minimum 12 characters. Avoid reused passphrases."
                  error={fieldErrors['password']}
                  required
                >
                  <PasswordInput
                    id="register-password"
                    name="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    invalid={Boolean(fieldErrors['password'])}
                    aria-describedby={
                      fieldErrors['password'] ? 'register-password-error' : 'register-password-hint'
                    }
                  />
                </FormField>

                <FormField
                  id="register-confirm-password"
                  label="Confirm Password"
                  error={fieldErrors['confirmPassword']}
                  required
                >
                  <PasswordInput
                    id="register-confirm-password"
                    name="confirmPassword"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    invalid={Boolean(fieldErrors['confirmPassword'])}
                    aria-describedby={
                      fieldErrors['confirmPassword'] ? 'register-confirm-password-error' : undefined
                    }
                  />
                </FormField>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  isLoading={submitting}
                  loadingLabel="Creating account"
                >
                  Create Account
                </Button>
              </form>
            </Surface>

            <p className="text-center text-sm text-ink-muted">
              Already registered?{' '}
              <Link href="/auth/login" className="font-medium text-link hover:underline">
                Sign in instead
              </Link>
            </p>
          </>
        )}
      </div>
    </StorefrontShell>
  );
}
