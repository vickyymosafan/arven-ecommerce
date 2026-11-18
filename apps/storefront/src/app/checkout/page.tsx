import { Suspense } from 'react';
import { LoadingState } from '@arven/ui';
import { CheckoutView } from '@/components/checkout/checkout-view';
import { StorefrontShell } from '@/components/storefront-shell';

export default function CheckoutPage() {
  return (
    <StorefrontShell>
      <Suspense
        fallback={
          <div className="min-h-[38rem]">
            <LoadingState label="Preparing checkout details and server quote" rows={6} />
          </div>
        }
      >
        <CheckoutView />
      </Suspense>
    </StorefrontShell>
  );
}
