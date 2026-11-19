export type DeviceQualityTier = 'default' | 'lite';

export interface WebGLCapabilityReport {
  readonly supported: boolean;
  readonly maxTextureSize: number;
  readonly rendererLabel: string | null;
  readonly reason: string | null;
}

/**
 * Safely probes browser WebGL availability without leaving dangling contexts.
 */
export function detectWebGLCapabilities(): WebGLCapabilityReport {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      supported: false,
      maxTextureSize: 0,
      rendererLabel: null,
      reason: 'non_browser_environment',
    };
  }

  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl2', {
        failIfMajorPerformanceCaveat: false,
      }) as WebGL2RenderingContext | null) ??
      (canvas.getContext('webgl', {
        failIfMajorPerformanceCaveat: false,
      }) as WebGLRenderingContext | null);

    if (!gl) {
      return {
        supported: false,
        maxTextureSize: 0,
        rendererLabel: null,
        reason: 'webgl_context_unavailable',
      };
    }

    const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 2048;
    const loseExt = gl.getExtension('WEBGL_lose_context');
    if (loseExt) {
      loseExt.loseContext();
    }

    return {
      supported: true,
      maxTextureSize,
      rendererLabel: 'webgl_ready',
      reason: null,
    };
  } catch {
    return {
      supported: false,
      maxTextureSize: 0,
      rendererLabel: null,
      reason: 'webgl_probe_threw',
    };
  }
}

export function resolveDeviceQualityTier(): DeviceQualityTier {
  if (typeof window === 'undefined') {
    return 'lite';
  }

  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  };

  if (nav.connection?.saveData) {
    return 'lite';
  }
  if (
    nav.connection?.effectiveType &&
    (nav.connection.effectiveType === 'slow-2g' || nav.connection.effectiveType === '2g')
  ) {
    return 'lite';
  }
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2) {
    return 'lite';
  }
  if (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2) {
    return 'lite';
  }
  if (window.innerWidth > 0 && window.innerWidth < 768) {
    return 'lite';
  }
  return 'default';
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
