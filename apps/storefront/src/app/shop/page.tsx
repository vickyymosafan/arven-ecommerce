import { Suspense } from 'react';
import { LoadingState } from '@arven/ui';
import { ShopBrowser } from '@/components/catalog/shop-browser';
import { StorefrontShell } from '@/components/storefront-shell';

export default function ShopAllPage() {
  return (
    <StorefrontShell>
      <Suspense fallback={<LoadingState label="Initializing catalog workbench" rows={6} />}>
        <ShopBrowser />
      </Suspense>
    </StorefrontShell>
  );
}
