import { Suspense } from 'react';
import { connection } from 'next/server';
import type { ShowroomScenesResponseDto, ShowroomZonePublicDto } from '@arven/contracts';
import { LoadingState } from '@arven/ui';
import { ShowroomView } from '@/components/experience/showroom-view';
import { StorefrontShell } from '@/components/storefront-shell';

async function fetchPublicShowroomScenesServer(): Promise<ShowroomZonePublicDto[] | null> {
  try {
    const apiBase = (process.env['API_URL'] ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
    const response = await fetch(`${apiBase}/api/v1/showroom/scenes`, {
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
      data?: ShowroomScenesResponseDto;
    };
    if (payload.success && payload.data && Array.isArray(payload.data.zones)) {
      return payload.data.zones;
    }
    return null;
  } catch {
    return null;
  }
}

async function ResolvedShowroom({
  searchParams,
}: {
  searchParams: Promise<{ zone?: string | string[] }>;
}) {
  await connection();
  const resolvedSearch = await searchParams;
  const rawZone = Array.isArray(resolvedSearch.zone)
    ? resolvedSearch.zone[0]
    : resolvedSearch.zone;
  const initialZones = await fetchPublicShowroomScenesServer();

  return (
    <ShowroomView
      initialZones={initialZones}
      initialZoneCode={typeof rawZone === 'string' ? rawZone : null}
    />
  );
}

export default function ShowroomPage({
  searchParams,
}: {
  searchParams: Promise<{ zone?: string | string[] }>;
}) {
  return (
    <StorefrontShell>
      <Suspense
        fallback={
          <LoadingState
            label="Memuat Virtual Showroom ARVEN"
            rows={6}
            className="min-h-[75dvh]"
          />
        }
      >
        <ResolvedShowroom searchParams={searchParams} />
      </Suspense>
    </StorefrontShell>
  );
}
