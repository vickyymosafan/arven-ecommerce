import { Suspense } from 'react';
import { LoadingState } from '@arven/ui';
import { CollectionDetailView } from '@/components/catalog/collection-detail-view';
import { StorefrontShell } from '@/components/storefront-shell';

async function ResolvedCollectionDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CollectionDetailView slug={slug} />;
}

export default function CollectionSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <StorefrontShell>
      <Suspense fallback={<LoadingState label="Loading collection" rows={6} />}>
        <ResolvedCollectionDetail params={params} />
      </Suspense>
    </StorefrontShell>
  );
}
