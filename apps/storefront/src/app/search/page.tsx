import { Suspense } from 'react';
import { LoadingState } from '@arven/ui';
import { ShopBrowser } from '@/components/catalog/shop-browser';
import { StorefrontShell } from '@/components/storefront-shell';

export default function SearchCatalogPage() {
  return (
    <StorefrontShell>
      <Suspense fallback={<LoadingState label="Preparing catalog search" rows={5} />}>
        <ShopBrowser searchFocused />
      </Suspense>
    </StorefrontShell>
  );
}
