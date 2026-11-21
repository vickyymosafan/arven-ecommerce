import type { SVGProps } from 'react';

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function SvgIcon({ size = 18, children, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

/**
 * Architectural typographic ARVEN wordmark (pure typography, no invented emblem).
 */
export function ArvenWordmark({ className }: { className?: string }) {
  return (
    <span
      className={`font-display text-2xl font-medium tracking-[0.2em] uppercase text-ink select-none ${className ?? ''}`.trim()}
    >
      ARVEN
    </span>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </SvgIcon>
  );
}

export function IconClose(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </SvgIcon>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </SvgIcon>
  );
}

export function IconBag(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 8h14l1 12H4L5 8Z" />
      <path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" />
    </SvgIcon>
  );
}

export function IconUser(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </SvgIcon>
  );
}

export function IconFilter(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </SvgIcon>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </SvgIcon>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </SvgIcon>
  );
}

export function IconMinus(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 12h14" />
    </SvgIcon>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M6 9l6 6 6-6" />
    </SvgIcon>
  );
}

export function IconEye(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </SvgIcon>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a16.8 16.8 0 0 1-3.3 3.9" />
      <path d="M6.4 8.3A16.2 16.2 0 0 0 2.5 12s3.5 6 9.5 6c1.5 0 2.9-.4 4.1-1" />
    </SvgIcon>
  );
}

export function IconSun(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5" />
      <path d="M12 19v2.5" />
      <path d="M4.9 4.9l1.8 1.8" />
      <path d="M17.3 17.3l1.8 1.8" />
      <path d="M2.5 12H5" />
      <path d="M19 12h2.5" />
      <path d="M4.9 19.1l1.8-1.8" />
      <path d="M17.3 6.7l1.8-1.8" />
    </SvgIcon>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z" />
    </SvgIcon>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </SvgIcon>
  );
}

export function IconCheckCircle(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.3l2.3 2.3 4.7-4.8" />
    </SvgIcon>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </SvgIcon>
  );
}

export function IconAlertTriangle(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 3.5L2.5 20h19L12 3.5Z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.5h.01" />
    </SvgIcon>
  );
}

export function IconAlertOctagon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <polygon points="8 3 16 3 21 8 21 16 16 21 8 21 3 16 3 8 8 3" />
      <path d="M12 8v5" />
      <path d="M12 16.5h.01" />
    </SvgIcon>
  );
}

export function IconShield(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 3l7 3v5.5c0 4.5-3 8.1-7 9.5-4-1.4-7-5-7-9.5V6l7-3Z" />
      <path d="M9.5 12.2l1.8 1.8 3.5-3.6" />
    </SvgIcon>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <rect x="9" y="9" width="11" height="11" />
      <path d="M5 15H4V4h11v1" />
    </SvgIcon>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M15 6l-6 6 6 6" />
    </SvgIcon>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M9 6l6 6-6 6" />
    </SvgIcon>
  );
}

export function IconRefresh(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M20 11a8 8 0 0 0-14.3-4.8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.3 4.8" />
      <path d="M20 20v-4h-4" />
    </SvgIcon>
  );
}
