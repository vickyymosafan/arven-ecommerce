'use client';

import { useEffect, useState } from 'react';
import { cn } from '../lib/cn.js';
import { IconMoon, IconSun } from './icons.js';

export type ArvenTheme = 'light' | 'dark';

export interface ThemeToggleProps {
  defaultTheme?: ArvenTheme;
  storageKey?: string;
  compact?: boolean;
  className?: string;
  onThemeChange?: (theme: ArvenTheme) => void;
}

function readStoredTheme(storageKey: string): ArvenTheme | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // Ignore storage access restrictions
  }
  return null;
}

function readSystemTheme(): ArvenTheme | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return null;
}

function readThemeFromEnvironment(defaultTheme: ArvenTheme, storageKey: string): ArvenTheme {
  const stored = readStoredTheme(storageKey);
  if (stored) {
    return stored;
  }

  const system = readSystemTheme();
  if (system) {
    return system;
  }

  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') {
      return attr;
    }
  }

  return defaultTheme;
}

function syncDocumentTheme(theme: ArvenTheme, explicitOverride: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (meta) {
    meta.content = explicitOverride ? theme : 'light dark';
  }
}

function applyThemeToDocument(theme: ArvenTheme, storageKey: string): void {
  syncDocumentTheme(theme, true);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch {
      // Ignore storage write failures in private/restricted browsers
    }
  }
}

export function ThemeToggle({
  defaultTheme = 'light',
  storageKey = 'arven-theme',
  compact = false,
  className,
  onThemeChange,
}: ThemeToggleProps) {
  const [theme, setTheme] = useState<ArvenTheme>(defaultTheme);

  useEffect(() => {
    const stored = readStoredTheme(storageKey);
    const initial = readThemeFromEnvironment(defaultTheme, storageKey);
    syncDocumentTheme(initial, Boolean(stored));
    setTheme(initial);

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = (event: MediaQueryListEvent) => {
      if (readStoredTheme(storageKey)) {
        return;
      }
      const next: ArvenTheme = event.matches ? 'dark' : 'light';
      syncDocumentTheme(next, false);
      setTheme(next);
      onThemeChange?.(next);
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      const next = readThemeFromEnvironment(defaultTheme, storageKey);
      syncDocumentTheme(next, Boolean(readStoredTheme(storageKey)));
      setTheme(next);
    };

    mediaQuery.addEventListener?.('change', handleSystemChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      mediaQuery.removeEventListener?.('change', handleSystemChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [defaultTheme, onThemeChange, storageKey]);

  const handleToggle = () => {
    const nextTheme: ArvenTheme = theme === 'dark' ? 'light' : 'dark';
    applyThemeToDocument(nextTheme, storageKey);
    setTheme(nextTheme);
    onThemeChange?.(nextTheme);
  };

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-pressed={isDark}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={cn(
        'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[var(--radius-xs)] border border-hairline',
        'bg-transparent text-xs font-semibold uppercase tracking-[0.05em] text-ink',
        'hover:border-strong-border hover:bg-subtle cursor-pointer',
        'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-ui)]',
        compact ? 'px-2.5 py-2' : 'px-3 py-2',
        className,
      )}
    >
      {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
      {compact ? null : <span>{isDark ? 'Light' : 'Dark'}</span>}
    </button>
  );
}
