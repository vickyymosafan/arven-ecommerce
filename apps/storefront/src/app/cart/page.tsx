import { Suspense } from 'react';
import { LoadingState } from '@arven/ui';
import { CartView } from '@/components/cart/cart-view';
import { StorefrontShell } from '@/components/storefront-shell';

export default function CartPage() {
  return (
    <StorefrontShell>
      <Suspense
        fallback={
          <div className="min-h-[38rem] sm:min-h-[34rem]">
            <LoadingState label="Loading your shopping bag" rows={4} />
          </div>
        }
      >
        <CartView />
      </Suspense>
    </StorefrontShell>
  );
}
