import { Suspense } from 'react';
import { LoadingState } from '@arven/ui';
import { AdminOrderDetailView } from '@/components/orders/admin-order-detail-view';

async function ResolvedAdminOrderDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminOrderDetailView orderId={id} />;
}

export default function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<LoadingState label="Loading order workspace" rows={6} />}>
      <ResolvedAdminOrderDetail params={params} />
    </Suspense>
  );
}
