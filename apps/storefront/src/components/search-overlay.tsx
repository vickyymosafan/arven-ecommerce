'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, IconSearch, Input, Modal } from '@arven/ui';

const QUICK_TERMS = ['Heavyweight', 'Wool', 'Poplin', 'Sneaker', 'Calfskin', 'Trouser'] as const;

export interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const navigateWithQuery = (raw: string) => {
    const trimmed = raw.trim();
    onClose();
    if (trimmed) {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    } else {
      router.push('/search');
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigateWithQuery(query);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Search Archive"
      description="Find garments by silhouette, natural textile, category, or exact SKU."
      size="md"
      closeLabel="Close search"
    >
      <div className="space-y-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Input
              id="header-quick-search"
              type="search"
              aria-label="Search ARVEN garments"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. Boxy Wool Overshirt, Poplin, ARV-TOP-001"
              className="pl-10"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
            >
              <IconSearch size={16} />
            </span>
          </div>
          <Button type="submit" variant="primary" size="md" className="shrink-0">
            Search
          </Button>
        </form>

        <div className="space-y-2.5">
          <p className="type-eyebrow text-ink-muted">Curated Queries</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_TERMS.map((term) => (
              <Button
                key={term}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => navigateWithQuery(term)}
              >
                {term}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
