import { Suspense } from 'react';
import { LoadingState } from '@arven/ui';
import { OrdersHistoryView } from '@/components/account/orders-history-view';
import { StorefrontShell } from '@/components/storefront-shell';

export default function AccountOrdersPage() {
  return (
    <Suspense
      fallback={
        <StorefrontShell>
          <div className="min-h-[34rem]">
            <LoadingState label="Loading your order history" rows={5} />
          </div>
        </StorefrontShell>
      }
    >
      <OrdersHistoryView />
    </Suspense>
  );
}
