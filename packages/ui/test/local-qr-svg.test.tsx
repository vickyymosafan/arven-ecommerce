import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LocalQrSvg } from '../src/components/local-qr-svg.js';

afterEach(() => {
  cleanup();
});

describe('LocalQrSvg', () => {
  it('renders a local declarative SVG matrix without external images', () => {
    const otpauthUri =
      'otpauth://totp/ARVEN:ops@arven.id?secret=JBSWY3DPEHPK3PXP&issuer=ARVEN';
    const { container } = render(
      <LocalQrSvg value={otpauthUri} label="Staff authenticator QR code" />,
    );

    const svg = screen.getByRole('img', { name: 'Staff authenticator QR code' });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(container.querySelectorAll('img').length).toBe(0);

    const rects = svg.querySelectorAll('rect');
    // 1 quiet-zone background rect + many dark module rects
    expect(rects.length).toBeGreaterThan(50);
  });

  it('renders nothing when value is empty', () => {
    const { container } = render(<LocalQrSvg value="   " />);
    expect(container.firstChild).toBeNull();
  });
});
