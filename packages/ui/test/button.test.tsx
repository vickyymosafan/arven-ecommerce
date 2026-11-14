import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button, LinkButton } from '../src/components/button.js';

afterEach(() => {
  cleanup();
});

describe('Button', () => {
  it('invokes onClick when active and blocks clicks when disabled', () => {
    const onClick = vi.fn();
    render(
      <div>
        <Button onClick={onClick}>Save Profile</Button>
        <Button onClick={onClick} disabled>
          Disabled Action
        </Button>
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disabled Action' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('sets aria-busy and displays loadingLabel when isLoading is true', () => {
    const onClick = vi.fn();
    render(
      <Button isLoading loadingLabel="Submitting request" onClick={onClick}>
        Submit
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Submitting request' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders LinkButton as an anchor with href', () => {
    render(
      <LinkButton href="/account" variant="secondary">
        Manage Account
      </LinkButton>,
    );

    const link = screen.getByRole('link', { name: 'Manage Account' });
    expect(link.getAttribute('href')).toBe('/account');
  });
});
