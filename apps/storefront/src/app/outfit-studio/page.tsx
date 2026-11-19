import { Suspense } from 'react';
import { connection } from 'next/server';
import type { OutfitStudioCatalogDto } from '@arven/contracts';
import { LoadingState } from '@arven/ui';
import { OutfitStudioView } from '@/components/experience/outfit-studio-view';
import { StorefrontShell } from '@/components/storefront-shell';

async function fetchOutfitStudioCatalogServer(): Promise<OutfitStudioCatalogDto | null> {
  try {
    const apiBase = (process.env['API_URL'] ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
    const response = await fetch(`${apiBase}/api/v1/outfit-studio/catalog`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-arven-portal': 'customer',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as {
      success?: boolean;
      data?: OutfitStudioCatalogDto;
    };
    if (payload.success && payload.data && payload.data.rig) {
      return payload.data;
    }
    return null;
  } catch {
    return null;
  }
}

async function ResolvedOutfitStudio({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const resolvedSearch = await searchParams;
  const initialCatalog = await fetchOutfitStudioCatalogServer();

  return (
    <OutfitStudioView
      initialCatalog={initialCatalog}
      initialSearchParams={resolvedSearch}
    />
  );
}

export default function OutfitStudioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <StorefrontShell>
      <Suspense
        fallback={
          <LoadingState
            label="Memuat Studio Padu Padan ARVEN"
            rows={6}
            className="min-h-[75dvh]"
          />
        }
      >
        <ResolvedOutfitStudio searchParams={searchParams} />
      </Suspense>
    </StorefrontShell>
  );
}
