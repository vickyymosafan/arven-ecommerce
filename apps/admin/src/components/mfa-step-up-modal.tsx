'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { mfaVerifyRequestSchema } from '@arven/validators';
import { Button, FormField, Input, Modal, StatusBanner } from '@arven/ui';
import { AdminApiClientError, adminApi } from '@/lib/api-client';

export interface MfaStepUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => Promise<void> | void;
  redirectPath: string;
}

export function MfaStepUpModal({
  isOpen,
  onClose,
  onVerified,
  redirectPath,
}: MfaStepUpModalProps) {
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>(undefined);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBannerError(null);
    setCodeError(undefined);

    const parsed = mfaVerifyRequestSchema.safeParse({ code: code.trim() });
    if (!parsed.success) {
      setCodeError(parsed.error.issues[0]?.message ?? 'Enter a valid 6-digit TOTP code.');
      return;
    }

    setVerifying(true);
    try {
      await adminApi.verifyMfa(parsed.data);
      setCode('');
      await onVerified();
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setBannerError(err.message);
      } else {
        setBannerError('Unable to confirm step-up MFA code right now.');
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="MFA Step-Up Verification Required"
      description="This privileged action requires fresh TOTP verification within the last 15 minutes."
      size="sm"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {bannerError ? <StatusBanner tone="danger" description={bannerError} /> : null}

        <FormField
          id="stepup-totp-code"
          label="6-Digit Authenticator Code"
          error={codeError}
          required
        >
          <Input
            id="stepup-totp-code"
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

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Link
            href={`/mfa/verify?reason=step-up&next=${encodeURIComponent(redirectPath)}`}
            className="inline-flex min-h-11 items-center text-xs font-medium text-link hover:underline"
          >
            Open dedicated MFA page
          </Link>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={verifying}
              loadingLabel="Verifying"
            >
              Confirm &amp; Retry
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
