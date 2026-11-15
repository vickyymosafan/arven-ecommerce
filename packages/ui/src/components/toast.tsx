'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '../lib/cn.js';
import {
  IconAlertOctagon,
  IconAlertTriangle,
  IconCheckCircle,
  IconClose,
  IconInfo,
} from './icons.js';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastInput {
  tone?: ToastTone;
  title: string;
  description?: string;
  durationMs?: number;
}

interface ToastItem extends Required<Pick<ToastInput, 'tone' | 'title'>> {
  id: string;
  description?: string;
}

interface ToastContextValue {
  toast: (input: ToastInput) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toastToneClasses: Record<ToastTone, string> = {
  info: 'border-info-fg/40 bg-elevated text-ink',
  success: 'border-success-fg/40 bg-elevated text-ink',
  warning: 'border-warning-fg/40 bg-elevated text-ink',
  danger: 'border-danger-fg/40 bg-elevated text-ink',
};

const iconToneClasses: Record<ToastTone, string> = {
  info: 'text-info-fg',
  success: 'text-success-fg',
  warning: 'text-warning-fg',
  danger: 'text-danger-fg',
};

function ToastIcon({ tone }: { tone: ToastTone }) {
  switch (tone) {
    case 'success':
      return <IconCheckCircle size={18} />;
    case 'warning':
      return <IconAlertTriangle size={18} />;
    case 'danger':
      return <IconAlertOctagon size={18} />;
    case 'info':
    default:
      return <IconInfo size={18} />;
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const counterRef = useRef(0);

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    ({ tone = 'info', title, description, durationMs = 5000 }: ToastInput) => {
      counterRef.current += 1;
      const id = `arven-toast-${counterRef.current}`;
      const nextItem: ToastItem = { id, tone, title, description };

      setItems((prev) => [...prev.slice(-3), nextItem]);

      if (durationMs > 0) {
        const timer = setTimeout(() => {
          dismissToast(id);
        }, durationMs);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [dismissToast],
  );

  useEffect(() => {
    const activeTimers = timersRef.current;
    return () => {
      for (const timer of activeTimers.values()) {
        clearTimeout(timer);
      }
      activeTimers.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismissToast }), [toast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed right-4 bottom-4 left-4 z-[var(--z-toast)] flex flex-col gap-2 sm:left-auto sm:w-full sm:max-w-sm"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'danger' || item.tone === 'warning' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex items-start justify-between gap-3 rounded-[var(--radius-sm)] border p-3.5 shadow-[var(--shadow-overlay)]',
              toastToneClasses[item.tone],
            )}
          >
            <div className="flex min-w-0 items-start gap-2.5">
              <span aria-hidden="true" className={cn('mt-0.5 shrink-0', iconToneClasses[item.tone])}>
                <ToastIcon tone={item.tone} />
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                {item.description ? (
                  <p className="text-xs leading-relaxed text-ink-muted">{item.description}</p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(item.id)}
              aria-label={`Dismiss ${item.title}`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-ink-muted hover:bg-panel hover:text-ink cursor-pointer"
            >
              <IconClose size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
