'use client';

import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../lib/cn.js';
import { IconAlertOctagon, IconEye, IconEyeOff } from './icons.js';

export interface FormFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({
  id,
  label,
  hint,
  error,
  required = false,
  children,
  className,
}: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.05em] text-ink"
      >
        <span>{label}</span>
        {required ? (
          <span aria-hidden="true" className="text-danger-fg">
            *
          </span>
        ) : null}
      </label>

      {children}

      {hint && !error ? (
        <p id={hintId} className="text-xs leading-relaxed text-ink-muted">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-xs leading-relaxed font-medium text-danger-fg"
        >
          <span aria-hidden="true" className="mt-0.5 shrink-0">
            <IconAlertOctagon size={14} />
          </span>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

const baseControlClasses = cn(
  'w-full min-h-11 rounded-[var(--radius-xs)] border px-3.5 py-2.5 text-sm leading-normal',
  'bg-[var(--input-bg)] text-[var(--input-fg)] placeholder:text-[var(--input-placeholder)]',
  'border-[var(--input-border)]',
  'hover:border-strong-border focus-visible:border-[var(--input-border-focus)]',
  'disabled:cursor-not-allowed disabled:opacity-55',
  'transition-[border-color,background-color] duration-[var(--duration-fast)] ease-[var(--ease-ui)]',
);

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className, type = 'text', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        baseControlClasses,
        invalid ? 'border-[var(--input-border-error)]' : undefined,
        className,
      )}
      {...props}
    />
  );
});

export interface PasswordInputProps extends Omit<InputProps, 'type'> {
  revealLabel?: string;
  hideLabel?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    {
      invalid = false,
      revealLabel = 'Show password',
      hideLabel = 'Hide password',
      className,
      ...props
    },
    ref,
  ) {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative flex w-full items-center">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          invalid={invalid}
          className={cn('pr-12', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? hideLabel : revealLabel}
          aria-pressed={visible}
          className="absolute right-0.5 inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-xs)] text-ink-muted hover:text-ink cursor-pointer"
        >
          {visible ? <IconEyeOff size={18} /> : <IconEye size={18} />}
        </button>
      </div>
    );
  },
);

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid = false, className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        baseControlClasses,
        invalid ? 'border-[var(--input-border-error)]' : undefined,
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid = false, className, rows = 3, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(
        baseControlClasses,
        'min-h-24 py-2.5',
        invalid ? 'border-[var(--input-border-error)]' : undefined,
        className,
      )}
      {...props}
    />
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { id, label, description, className, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-xs)] px-1.5 py-1.5 select-none',
        props.disabled ? 'cursor-not-allowed opacity-55' : 'hover:bg-subtle',
        className,
      )}
    >
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="h-6 w-6 shrink-0 accent-[var(--arven-accent-link)] cursor-pointer"
        {...props}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-ink">{label}</span>
        {description ? (
          <span className="text-xs leading-relaxed text-ink-muted">{description}</span>
        ) : null}
      </span>
    </label>
  );
});
