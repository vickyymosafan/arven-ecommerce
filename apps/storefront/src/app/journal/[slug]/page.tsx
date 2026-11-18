import { Suspense } from 'react';
import { LoadingState } from '@arven/ui';
import { JournalDetailView } from '@/components/editorial/journal-detail-view';
import { StorefrontShell } from '@/components/storefront-shell';

async function ResolvedJournalDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <JournalDetailView slug={slug} />;
}

export default function JournalDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <StorefrontShell>
      <Suspense fallback={<LoadingState label="Loading journal article" rows={5} />}>
        <ResolvedJournalDetail params={params} />
      </Suspense>
    </StorefrontShell>
  );
}
