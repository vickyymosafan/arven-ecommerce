/**
 * Deterministic IDR currency and Asia/Jakarta (WIB) date-time formatters.
 * Ensures identical SSR and browser CSR output without hydration drift.
 */

const wibDateTimeEn = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const wibDateTimeWithSecondsEn = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/**
 * Formats an integer Rupiah amount deterministically (e.g. `Rp 299.000`).
 * Always pair with `tabular-nums` in JSX.
 */
export function formatIDR(amountIdr: number | bigint): string {
  if (typeof amountIdr === 'number' && (!Number.isFinite(amountIdr) || !Number.isInteger(amountIdr))) {
    throw new RangeError(`formatIDR requires an integer Rupiah amount, received: ${String(amountIdr)}`);
  }
  const numeric = typeof amountIdr === 'bigint' ? amountIdr : BigInt(Math.trunc(amountIdr));
  const negative = numeric < 0n;
  const absStr = (negative ? -numeric : numeric).toString();
  const grouped = absStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}Rp ${grouped}`;
}

/**
 * Formats a UTC ISO timestamp or Date into `Asia/Jakarta` (`WIB`).
 * Returns `"-"` when the input cannot be parsed into a valid date.
 */
export function formatWIB(
  input: string | Date | null | undefined,
  options?: { includeSeconds?: boolean },
): string {
  if (!input) {
    return '-';
  }
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  const formatter = options?.includeSeconds ? wibDateTimeWithSecondsEn : wibDateTimeEn;
  return `${formatter.format(date)} WIB`;
}
