import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Drawer, Modal } from '../src/components/modal.js';

afterEach(() => {
  cleanup();
});

function ModalHarness() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open Confirm Dialog
      </button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Confirm Account Status"
        description="Review the status change before saving."
      >
        <p>This action updates portal access immediately.</p>
      </Modal>
    </div>
  );
}

describe('Modal and Drawer', () => {
  it('closes on Escape and restores focus to the trigger button', () => {
    render(<ModalHarness />);

    const trigger = screen.getByRole('button', { name: 'Open Confirm Dialog' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Close button click', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Edit Address">
        <p>Address content</p>
      </Modal>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes Drawer on Escape', () => {
    const onClose = vi.fn();
    render(
      <Drawer isOpen onClose={onClose} title="Navigation">
        <a href="/account">Account</a>
      </Drawer>,
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
