/**
 * Joins truthy class name strings cleanly without external runtime dependencies.
 */
export function cn(...inputs: Array<string | false | null | undefined>): string {
  const parts: string[] = [];
  for (const item of inputs) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed.length > 0) {
        parts.push(trimmed);
      }
    }
  }
  return parts.join(' ');
}
