import { Suspense } from 'react';
import { LoadingState } from '@arven/ui';
import { CheckoutStatusView } from '@/components/checkout/checkout-status-view';
import { StorefrontShell } from '@/components/storefront-shell';

async function ResolvedCheckoutStatus({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  return <CheckoutStatusView orderNumber={decodeURIComponent(orderNumber)} />;
}

export default function CheckoutStatusPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  return (
    <StorefrontShell>
      <Suspense
        fallback={
          <div className="min-h-[38rem]">
            <LoadingState label="Verifying order and payment status" rows={6} />
          </div>
        }
      >
        <ResolvedCheckoutStatus params={params} />
      </Suspense>
    </StorefrontShell>
  );
}
