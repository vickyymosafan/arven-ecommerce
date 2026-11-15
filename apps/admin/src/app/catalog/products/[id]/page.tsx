import { Suspense } from 'react';
import { LoadingState } from '@arven/ui';
import { AdminProductDetailView } from '@/components/catalog/admin-product-detail-view';

async function ResolvedAdminProductDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminProductDetailView productId={id} />;
}

export default function AdminProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<LoadingState label="Loading product record" rows={6} />}>
      <ResolvedAdminProductDetail params={params} />
    </Suspense>
  );
}
