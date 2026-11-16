import { Suspense } from 'react';
import { LoadingState } from '@arven/ui';
import { InventoryWorkspace } from '@/components/inventory/inventory-workspace';

export default function AdminInventoryPage() {
  return (
    <Suspense fallback={<LoadingState label="Initializing inventory ledger" rows={6} />}>
      <InventoryWorkspace />
    </Suspense>
  );
}
