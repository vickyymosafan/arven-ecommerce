import { Suspense } from 'react';
import { LoadingState } from '@arven/ui';
import { OrderDetailView } from '@/components/account/order-detail-view';
import { StorefrontShell } from '@/components/storefront-shell';

async function ResolvedAccountOrderDetail({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  return <OrderDetailView orderNumber={decodeURIComponent(orderNumber)} />;
}

export default function AccountOrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  return (
    <Suspense
      fallback={
        <StorefrontShell>
          <div className="min-h-[34rem]">
            <LoadingState label="Loading order snapshot and status history" rows={5} />
          </div>
        </StorefrontShell>
      }
    >
      <ResolvedAccountOrderDetail params={params} />
    </Suspense>
  );
}
