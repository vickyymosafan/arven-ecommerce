'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import { mfaVerifyRequestSchema } from '@arven/validators';
import {
  ArvenWordmark,
  Badge,
  Button,
  Checkbox,
  Divider,
  ErrorState,
  FormField,
  IconCopy,
  LoadingState,
  LocalQrSvg,
  SkipLink,
  StatusBanner,
  Surface,
  ThemeToggle,
  Input,
  useToast,
} from '@arven/ui';
import { AdminApiClientError, adminApi, type MfaSetupResponse } from '@/lib/api-client';
import { sanitizeRedirectPath } from '@/lib/redirect';

function MfaSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const nextPath = sanitizeRedirectPath(searchParams.get('next'), '/');

  const [setupData, setSetupData] = useState<MfaSetupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>(undefined);
  const [verifyError, setVerifyError] = useState<{
    message: string;
    requestId?: string | null;
  } | null>(null);
  const [verifying, setVerifying] = useState(false);

  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [codesAcknowledged, setCodesAcknowledged] = useState(false);

  const reloadSetup = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await adminApi.setupMfa();
      setSetupData(data);
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        if (err.status === 401) {
          router.replace('/login');
          return;
        }
        if (err.code === 'MFA_ALREADY_ENROLLED') {
          router.replace(
            nextPath !== '/' ? `/mfa/verify?next=${encodeURIComponent(nextPath)}` : '/mfa/verify',
          );
          return;
        }
        setLoadError({ message: err.message, requestId: err.requestId });
      } else {
        setLoadError({ message: 'Unable to initialize TOTP setup right now.' });
      }
    } finally {
      setLoading(false);
    }
  }, [nextPath, router]);

  useEffect(() => {
    let active = true;
    adminApi
      .setupMfa()
      .then((data) => {
        if (active) {
          setSetupData(data);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          if (err.status === 401) {
            router.replace('/login');
            return;
          }
          if (err.code === 'MFA_ALREADY_ENROLLED') {
            router.replace(
              nextPath !== '/' ? `/mfa/verify?next=${encodeURIComponent(nextPath)}` : '/mfa/verify',
            );
            return;
          }
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({ message: 'Unable to initialize TOTP setup right now.' });
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
  }, [nextPath, router]);

  const handleCopyManualKey = async () => {
    if (!setupData) return;
    try {
      await navigator.clipboard.writeText(setupData.manualEntryKey);
      toast({
        tone: 'success',
        title: 'Secret key copied',
        description: 'Paste it into your authenticator app if you cannot scan the QR code.',
      });
    } catch {
      toast({
        tone: 'warning',
        title: 'Clipboard unavailable',
        description: 'Copy the Base32 key directly from the monospace box.',
      });
    }
  };

  const handleCopyRecoveryCodes = async () => {
    if (!recoveryCodes) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      toast({
        tone: 'success',
        title: 'Recovery codes copied',
        description: 'Store them offline in your password vault.',
      });
    } catch {
      toast({
        tone: 'warning',
        title: 'Clipboard unavailable',
        description: 'Record the listed recovery codes manually before continuing.',
      });
    }
  };

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setVerifyError(null);
    setCodeError(undefined);

    const parsed = mfaVerifyRequestSchema.safeParse({ code: code.trim() });
    if (!parsed.success) {
      setCodeError(parsed.error.issues[0]?.message ?? 'Enter a 6-digit authenticator code.');
      return;
    }

    setVerifying(true);
    try {
      const result = await adminApi.verifyMfa(parsed.data);
      toast({
        tone: 'success',
        title: 'Authenticator enrolled',
        description: 'Two-factor authentication is now active for your staff account.',
      });
      if (result.recoveryCodes && result.recoveryCodes.length > 0) {
        setRecoveryCodes(result.recoveryCodes);
      } else {
        router.replace(nextPath);
      }
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        if (err.status === 401) {
          router.replace('/login');
          return;
        }
        setVerifyError({ message: err.message, requestId: err.requestId });
      } else {
        setVerifyError({ message: 'Unable to verify authenticator code right now.' });
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="w-full max-w-2xl space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warning">Mandatory Enrollment</Badge>
          <span className="font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
            TOTP Authenticator
          </span>
        </div>
        <h1 className="font-display text-3xl font-normal tracking-[-0.015em] text-ink sm:text-4xl">
          Set Up Two-Factor Authentication
        </h1>
        <p className="text-sm leading-relaxed text-ink-muted">
          Scan the locally rendered QR code with an authenticator app, then submit the first
          6-digit verification code to activate operations access.
        </p>
      </div>

      {loading ? (
        <LoadingState label="Generating TOTP enrollment credentials" rows={4} />
      ) : loadError ? (
        <ErrorState
          title="Could not prepare MFA enrollment"
          message={loadError.message}
          requestId={loadError.requestId}
          onRetry={() => void reloadSetup()}
        />
      ) : recoveryCodes ? (
        <Surface variant="elevated" border="strong" padding="lg" className="space-y-5">
          <StatusBanner
            tone="warning"
            title="Save your one-time recovery codes"
            description="These recovery codes are shown once. Store them securely offline before entering the operations console."
          />

          <div className="grid grid-cols-2 gap-2 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-4 sm:grid-cols-4">
            {recoveryCodes.map((item) => (
              <code
                key={item}
                className="rounded-[var(--radius-xs)] border border-hairline bg-canvas px-2.5 py-1.5 text-center font-mono text-xs text-ink select-all"
              >
                {item}
              </code>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void handleCopyRecoveryCodes()}
            >
              <IconCopy size={16} />
              <span>Copy Recovery Codes</span>
            </Button>
          </div>

          <Divider />

          <Checkbox
            label="I have recorded these one-time recovery codes in a secure vault"
            checked={codesAcknowledged}
            onChange={(event) => setCodesAcknowledged(event.target.checked)}
          />

          <Button
            type="button"
            variant="primary"
            size="lg"
            disabled={!codesAcknowledged}
            onClick={() => router.replace(nextPath)}
          >
            Enter Operations Console
          </Button>
        </Surface>
      ) : setupData ? (
        <div className="grid gap-6 md:grid-cols-12">
          <Surface
            variant="elevated"
            border="hairline"
            padding="lg"
            className="flex flex-col items-center justify-center gap-4 md:col-span-5"
          >
            <LocalQrSvg
              value={setupData.otpauthUri}
              size={196}
              label={`Authenticator QR code for ${setupData.accountName}`}
            />
            <div className="space-y-1 text-center">
              <p className="font-mono text-xs text-ink">{setupData.issuer}</p>
              <p className="break-all font-mono text-xs text-ink-muted">
                {setupData.accountName}
              </p>
            </div>
          </Surface>

          <Surface variant="elevated" border="hairline" padding="lg" className="space-y-5 md:col-span-7">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.06em] text-ink">
                Manual Entry Key
              </p>
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3">
                <code className="min-w-0 flex-1 break-all font-mono text-xs text-ink select-all">
                  {setupData.manualEntryKey}
                </code>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleCopyManualKey()}
                >
                  <IconCopy size={15} />
                  <span>Copy</span>
                </Button>
              </div>
            </div>

            {verifyError ? (
              <StatusBanner
                tone="danger"
                title="Verification rejected"
                description={verifyError.message}
                requestId={verifyError.requestId}
              />
            ) : null}

            <form onSubmit={handleVerify} noValidate className="space-y-4">
              <FormField
                id="mfa-setup-code"
                label="6-Digit Authenticator Code"
                hint="Enter the current 6-digit code shown by your authenticator app."
                error={codeError}
                required
              >
                <Input
                  id="mfa-setup-code"
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
                isLoading={verifying}
                loadingLabel="Confirming authenticator"
              >
                Activate MFA &amp; Generate Recovery Codes
              </Button>
            </form>
          </Surface>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminMfaSetupPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <SkipLink href="#main-content" />
      <header className="border-b border-hairline bg-subtle">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <ArvenWordmark />
            <span className="border-l border-hairline pl-3 font-mono text-xs uppercase tracking-[0.08em] text-ink-muted">
              MFA Setup
            </span>
          </div>
          <ThemeToggle defaultTheme="dark" storageKey="arven-admin-theme" />
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6"
      >
        <Suspense fallback={<LoadingState label="Preparing MFA enrollment" rows={3} />}>
          <MfaSetupContent />
        </Suspense>
      </main>
    </div>
  );
}
