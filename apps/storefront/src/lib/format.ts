export { formatIDR, formatWIB } from '@arven/ui';

export function formatOrderStatusLabel(status: string): string {
  return status.toLowerCase().replaceAll('_', ' ');
}
