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
    'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)] border border-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover-bg)] hover:border-[var(--btn-primary-hover-bg)] active:opacity-95',
  secondary:
    'bg-canvas text-ink border border-[var(--btn-secondary-border)] hover:bg-[var(--btn-secondary-bg)] hover:border-[var(--arven-border-strong)]',
  accent:
    'bg-[var(--btn-accent-bg)] text-[var(--btn-accent-fg)] border border-transparent hover:opacity-92',
  danger:
    'bg-[var(--btn-danger-bg)] text-[var(--btn-danger-fg)] border border-transparent hover:opacity-92',
  ghost:
    'bg-transparent text-ink border border-transparent hover:bg-subtle hover:border-hairline',
  gold:
    'bg-gold text-[var(--color-charcoal-900)] border border-gold-border hover:bg-gold-hover active:opacity-95 font-semibold',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-11 min-w-11 px-4 py-2 text-xs font-semibold tracking-[0.04em]',
  md: 'min-h-11 min-w-11 px-5 py-2.5 text-sm font-medium tracking-[0.02em]',
  lg: 'min-h-12 min-w-11 px-7 py-3 text-sm font-semibold tracking-[0.03em]',
};

export function buttonClassName({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: ButtonStyleOptions = {}): string {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-[var(--radius-xs)]',
    'whitespace-normal text-center leading-snug',
    'transition-[background-color,border-color,color,opacity] duration-[var(--duration-fast)] ease-[var(--ease-ui)]',
    'cursor-pointer select-none',
    variantClasses[variant],
    'disabled:cursor-not-allowed disabled:bg-subtle disabled:text-ink-muted disabled:border-hairline disabled:hover:bg-subtle disabled:hover:border-hairline',
    'aria-disabled:cursor-not-allowed aria-disabled:bg-subtle aria-disabled:text-ink-muted aria-disabled:border-hairline',
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
