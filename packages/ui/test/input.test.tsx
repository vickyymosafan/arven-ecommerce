import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Checkbox, FormField, Input, PasswordInput } from '../src/components/input.js';

afterEach(() => {
  cleanup();
});

describe('Input primitives', () => {
  it('links FormField label, hint, and alert error state with aria-invalid', () => {
    render(
      <FormField
        id="email-field"
        label="Email Address"
        error="Please enter a valid email address"
        required
      >
        <Input id="email-field" type="email" invalid />
      </FormField>,
    );

    const input = screen.getByLabelText(/Email Address/i);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toContain('Please enter a valid email address');
  });

  it('toggles PasswordInput visibility and aria-pressed state cleanly', () => {
    render(
      <FormField id="pw-field" label="Password">
        <PasswordInput id="pw-field" name="password" />
      </FormField>,
    );

    const input = screen.getByLabelText('Password') as HTMLInputElement;
    const toggle = screen.getByRole('button', { name: 'Show password' });

    expect(input.type).toBe('password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggle);
    expect(input.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('renders Checkbox with accessible label and description', () => {
    render(
      <Checkbox
        label="Set as default shipping address"
        description="Used automatically for future storefront checkouts."
      />,
    );

    const checkbox = screen.getByRole('checkbox', {
      name: /Set as default shipping address/i,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });
});
