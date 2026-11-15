import { Suspense } from 'react';
import { LoadingState } from '@arven/ui';
import { ProductDetailView } from '@/components/catalog/product-detail-view';
import { StorefrontShell } from '@/components/storefront-shell';

async function ResolvedProductDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ProductDetailView slug={slug} />;
}

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <StorefrontShell>
      <Suspense
        fallback={
          <LoadingState label="Loading garment details" rows={6} className="min-h-[85dvh]" />
        }
      >
        <ResolvedProductDetail params={params} />
      </Suspense>
    </StorefrontShell>
  );
}
