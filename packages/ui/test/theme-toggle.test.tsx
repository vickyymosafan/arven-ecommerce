import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeToggle } from '../src/components/theme-toggle.js';

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    cleanup();
  });

  it('toggles document data-theme between light and dark and persists to localStorage', () => {
    render(<ThemeToggle defaultTheme="light" storageKey="arven-test-theme" />);

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    const toggleToDark = screen.getByRole('button', { name: 'Switch to dark theme' });
    expect(toggleToDark.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggleToDark);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem('arven-test-theme')).toBe('dark');

    const toggleToLight = screen.getByRole('button', { name: 'Switch to light theme' });
    expect(toggleToLight.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggleToLight);

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem('arven-test-theme')).toBe('light');
  });
});
