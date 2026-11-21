export type DeviceQualityTier = 'default' | 'lite';

export interface WebGLCapabilityReport {
  readonly supported: boolean;
  readonly maxTextureSize: number;
  readonly rendererLabel: string | null;
  readonly reason: string | null;
}

declare global {
  interface Window {
    __ARVEN_WEBGL_CAPABILITY__?: WebGLCapabilityReport;
  }
}

/**
 * Safely probes browser WebGL availability once per browser session (memoized across islands
 * and React StrictMode remounts to avoid spawning duplicate contexts or synthetic context-loss events).
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

  const isTestEnv =
    typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
  if (!isTestEnv && window.__ARVEN_WEBGL_CAPABILITY__) {
    return window.__ARVEN_WEBGL_CAPABILITY__;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const gl =
      (canvas.getContext('webgl2', {
        failIfMajorPerformanceCaveat: false,
      }) as WebGL2RenderingContext | null) ??
      (canvas.getContext('webgl', {
        failIfMajorPerformanceCaveat: false,
      }) as WebGLRenderingContext | null);

    if (!gl) {
      const report: WebGLCapabilityReport = {
        supported: false,
        maxTextureSize: 0,
        rendererLabel: null,
        reason: 'webgl_context_unavailable',
      };
      if (!isTestEnv) {
        window.__ARVEN_WEBGL_CAPABILITY__ = report;
      }
      return report;
    }

    const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 2048;
    const report: WebGLCapabilityReport = {
      supported: true,
      maxTextureSize,
      rendererLabel: 'webgl_ready',
      reason: null,
    };
    if (!isTestEnv) {
      window.__ARVEN_WEBGL_CAPABILITY__ = report;
    }
    return report;
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
