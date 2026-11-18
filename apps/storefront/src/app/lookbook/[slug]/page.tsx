import { Suspense } from 'react';
import { LoadingState } from '@arven/ui';
import { LookbookDetailView } from '@/components/editorial/lookbook-detail-view';
import { StorefrontShell } from '@/components/storefront-shell';

async function ResolvedLookbookDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <LookbookDetailView slug={slug} />;
}

export default function LookbookDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <StorefrontShell>
      <Suspense fallback={<LoadingState label="Loading lookbook" rows={6} />}>
        <ResolvedLookbookDetail params={params} />
      </Suspense>
    </StorefrontShell>
  );
}
