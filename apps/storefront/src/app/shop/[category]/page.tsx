import { Suspense } from 'react';
import { LoadingState } from '@arven/ui';
import { ShopBrowser } from '@/components/catalog/shop-browser';
import { StorefrontShell } from '@/components/storefront-shell';

async function ResolvedShopCategory({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  return <ShopBrowser fixedCategorySlug={category} />;
}

export default function ShopCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  return (
    <StorefrontShell>
      <Suspense fallback={<LoadingState label="Loading category catalog" rows={6} />}>
        <ResolvedShopCategory params={params} />
      </Suspense>
    </StorefrontShell>
  );
}
