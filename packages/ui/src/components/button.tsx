'use client';

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn.js';

export type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost' | 'gold';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)] border border-transparent hover:bg-[var(--btn-primary-hover-bg)] active:opacity-95',
  secondary:
    'bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-fg)] border border-[var(--btn-secondary-border)] hover:bg-[var(--btn-secondary-hover-bg)] hover:border-[var(--arven-border-strong)]',
  accent:
    'bg-[var(--btn-accent-bg)] text-[var(--btn-accent-fg)] border border-transparent hover:opacity-90',
  danger:
    'bg-[var(--btn-danger-bg)] text-[var(--btn-danger-fg)] border border-transparent hover:opacity-90',
  ghost:
    'bg-transparent text-ink border border-transparent hover:bg-panel hover:border-[var(--arven-border-control)]',
  gold:
    'bg-gold text-[var(--color-charcoal-900)] border border-gold-hover hover:bg-gold-hover active:opacity-95 font-medium',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-11 min-w-11 px-3.5 py-2 text-xs font-medium tracking-[0.04em]',
  md: 'min-h-11 min-w-11 px-5 py-2.5 text-sm font-medium tracking-[0.03em]',
  lg: 'min-h-12 min-w-11 px-6 py-3 text-sm font-semibold tracking-[0.04em]',
};

export function buttonClassName({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: ButtonStyleOptions = {}): string {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)]',
    'whitespace-normal text-center leading-snug',
    'transition-[background-color,border-color,color,opacity] duration-[var(--duration-fast)] ease-[var(--ease-ui)]',
    'cursor-pointer select-none',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
    variantClasses[variant],
    sizeClasses[size],
    fullWidth ? 'w-full' : undefined,
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  isLoading?: boolean;
  loadingLabel?: string;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  isLoading = false,
  loadingLabel,
  disabled,
  type = 'button',
  className,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = Boolean(disabled || isLoading);
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      className={buttonClassName({ variant, size, fullWidth, className })}
      {...props}
    >
      {isLoading ? (
        <>
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
          />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children?: ReactNode;
}

export function LinkButton({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className,
  children,
  ...props
}: LinkButtonProps) {
  return (
    <a className={buttonClassName({ variant, size, fullWidth, className })} {...props}>
      {children}
    </a>
  );
}
