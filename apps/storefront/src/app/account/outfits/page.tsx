import { Suspense } from 'react';
import { LoadingState } from '@arven/ui';
import { SavedOutfitsView } from '@/components/account/saved-outfits-view';
import { StorefrontShell } from '@/components/storefront-shell';

export default function AccountOutfitsPage() {
  return (
    <Suspense
      fallback={
        <StorefrontShell>
          <div className="min-h-[34rem]">
            <LoadingState label="Memuat daftar paduan pakaian tersimpan" rows={5} />
          </div>
        </StorefrontShell>
      }
    >
      <SavedOutfitsView />
    </Suspense>
  );
}
