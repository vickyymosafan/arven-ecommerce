'use client';

import { useEffect, useState } from 'react';
import { cn } from '../lib/cn.js';
import { IconMoon, IconSun } from './icons.js';

export type ArvenTheme = 'light' | 'dark';

export interface ThemeToggleProps {
  defaultTheme?: ArvenTheme;
  storageKey?: string;
  className?: string;
  onThemeChange?: (theme: ArvenTheme) => void;
}

function readThemeFromEnvironment(defaultTheme: ArvenTheme, storageKey: string): ArvenTheme {
  if (typeof document !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    } catch {
      // Ignore storage access restrictions
    }
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') {
      return attr;
    }
  }
  return defaultTheme;
}

function applyThemeToDocument(theme: ArvenTheme, storageKey: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  }
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
  className,
  onThemeChange,
}: ThemeToggleProps) {
  const [theme, setTheme] = useState<ArvenTheme>(defaultTheme);

  useEffect(() => {
    const initial = readThemeFromEnvironment(defaultTheme, storageKey);
    document.documentElement.setAttribute('data-theme', initial);
    document.documentElement.style.colorScheme = initial;
    setTheme(initial);
  }, [defaultTheme, storageKey]);

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
        'inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-control-border',
        'bg-panel px-3 py-2 text-xs font-medium uppercase tracking-[0.06em] text-ink',
        'hover:border-strong-border hover:bg-panel-hover cursor-pointer',
        'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-ui)]',
        className,
      )}
    >
      {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
      <span>{isDark ? 'Light' : 'Dark'}</span>
    </button>
  );
}
