export { formatIDR, formatWIB } from '@arven/ui';

export function formatRoleLabel(code: string): string {
  return code.replaceAll('_', ' ');
}
