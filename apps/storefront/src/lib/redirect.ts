/**
 * Sanitizes a relative post-authentication redirect path to block open redirects.
 * Rejects protocol-relative URLs (`//evil.test`), backslashes, and full URLs.
 */
export function sanitizeRedirectPath(
  candidate: string | null | undefined,
  fallback = '/account',
): string {
  if (!candidate) {
    return fallback;
  }
  const trimmed = candidate.trim();
  if (!trimmed.startsWith('/')) {
    return fallback;
  }
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.includes('\\')) {
    return fallback;
  }
  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (parsed.origin !== 'http://localhost') {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
