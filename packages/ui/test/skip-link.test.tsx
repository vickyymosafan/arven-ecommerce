import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SkipLink } from '../src/components/skip-link.js';

afterEach(() => {
  cleanup();
});

describe('SkipLink', () => {
  it('renders an anchor targeting #main-content by default', () => {
    render(<SkipLink />);

    const link = screen.getByRole('link', { name: 'Skip to main content' });
    expect(link.getAttribute('href')).toBe('#main-content');
  });

  it('supports custom target and text', () => {
    render(<SkipLink href="#primary-section">Jump to workspace</SkipLink>);

    const link = screen.getByRole('link', { name: 'Jump to workspace' });
    expect(link.getAttribute('href')).toBe('#primary-section');
  });
});
