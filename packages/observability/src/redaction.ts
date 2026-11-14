const SENSITIVE_FIELD_NAMES = [
  'cookie',
  'authorization',
  'x-csrf-token',
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'tokenHash',
  'sessionToken',
  'refreshToken',
  'resetToken',
  'verificationToken',
  'guestToken',
  'guestTokenHash',
  'csrfToken',
  'secret',
  'mfaSecret',
  'totpSecret',
  'totpSecretEncrypted',
  'totpCode',
  'serverKey',
  'midtransServerKey',
  'signature',
  'signatureKey',
  'pan',
  'cvv',
  'cvc',
  'email',
  'phone',
  'address',
  'addressLine1',
  'addressLine2',
  'line1',
  'line2',
  'fullAddress',
] as const;

/**
 * Builds Pino fast-redact paths across root, HTTP header, and nested payload depths (ASVS V7 / T-08).
 */
export const ARVEN_REDACT_PATHS: string[] = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'headers.cookie',
  'headers.authorization',
  'headers["x-csrf-token"]',
  ...SENSITIVE_FIELD_NAMES,
  ...SENSITIVE_FIELD_NAMES.map((field) => `*.${field}`),
  ...SENSITIVE_FIELD_NAMES.map((field) => `*.*.${field}`),
  ...SENSITIVE_FIELD_NAMES.map((field) => `*.*.*.${field}`),
];

const REDACT_KEY_PATTERN =
  /(password|secret|token|cookie|authorization|server_?key|signature|mfa|totp|csrf|pan|cvv|cvc|card|email|phone|address|line1|line2)/i;

/**
 * Masks an email address preserving only first local character and domain (e.g. `j***@example.com`).
 */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0) {
    return '***';
  }
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (!domain) {
    return '***';
  }
  return `${local[0]}***@${domain}`;
}

/**
 * Masks a phone number leaving only the last 4 visible digits (`****5678`).
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\s+/g, '');
  if (digits.length <= 4) {
    return '****';
  }
  return `****${digits.slice(-4)}`;
}

/**
 * Masks an IPv4 or IPv6 address for session display and audit records.
 */
export function maskIp(ip: string | null | undefined): string {
  if (!ip) {
    return 'unknown';
  }
  const clean = ip.replace(/^::ffff:/, '').trim();
  if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
    }
  }
  if (clean.includes(':')) {
    const parts = clean.split(':').filter((part) => part.length > 0);
    return `${parts.slice(0, 3).join(':') || '::'}::x`;
  }
  return 'masked';
}

/**
 * Deeply scrubs secret and PII fields from arbitrary objects before writing audit metadata or logs.
 */
export function scrubSensitiveMetadata(input: unknown, depth: number = 0): unknown {
  if (depth > 6 || input === null || input === undefined) {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => scrubSensitiveMetadata(item, depth + 1));
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (REDACT_KEY_PATTERN.test(key)) {
        if (/email/i.test(key) && typeof value === 'string') {
          out[key] = maskEmail(value);
        } else if (/phone/i.test(key) && typeof value === 'string') {
          out[key] = maskPhone(value);
        } else {
          out[key] = '[Redacted]';
        }
      } else {
        out[key] = scrubSensitiveMetadata(value, depth + 1);
      }
    }
    return out;
  }
  return input;
}
