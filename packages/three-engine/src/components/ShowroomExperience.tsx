'use client';

import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type {
  ShowroomHotspotPublicDto,
  ShowroomZonePublicDto,
} from '@arven/contracts';
import {
  detectWebGLCapabilities,
  prefersReducedMotion,
  resolveDeviceQualityTier,
  type DeviceQualityTier,
} from '../capabilities.js';
import { ResourceTracker } from '../resource-tracker.js';

export const SHOWROOM_MAX_RESIDENT_ZONES = 2;

export interface ShowroomCameraControlHandle {
  rotateBy: (deltaAzimuthRad: number, deltaPolarRad?: number) => void;
  moveForward: (stepMeters: number) => void;
  focusHotspot: (hotspotId: string) => void;
  resetView: () => void;
}

export interface ShowroomExperienceProps {
  readonly zones: ReadonlyArray<ShowroomZonePublicDto>;
  readonly activeZoneCode: string;
  readonly selectedHotspotId?: string | null;
  readonly tierOverride?: DeviceQualityTier;
  readonly reducedMotion?: boolean;
  readonly interactionEnabled?: boolean;
  readonly dracoDecoderPath?: string;
  readonly ktx2TranscoderPath?: string;
  readonly onHotspotSelect?: (hotspot: ShowroomHotspotPublicDto) => void;
  readonly onZoneRequest?: (targetZoneCode: string) => void;
  readonly onWebGLFallback?: (reason: string) => void;
  readonly onControlsReady?: (handle: ShowroomCameraControlHandle | null) => void;
}

export interface ShowroomDiagnosticsSnapshot {
  readonly experience: 'showroom';
  readonly activeZoneCode: string;
  readonly residentZoneCodes: string[];
  readonly activeTier: DeviceQualityTier;
  readonly frameloop: 'demand';
  readonly geometries: number;
  readonly textures: number;
  readonly disposedResources: number;
  readonly loadState: 'loading' | 'ready' | 'error' | 'recovering' | 'fallback';
  readonly contextLostCount: number;
  readonly reducedMotion: boolean;
  readonly updatedAt: string;
}

interface OrbitControlsLike {
  target: THREE.Vector3;
  update: () => void;
}

interface ResidentZoneEntry {
  readonly code: string;
  readonly scene: THREE.Group;
  readonly tracker: ResourceTracker;
}

/**
 * Enforces ARVEN's max-2-zone GPU residency rule (`SHOWROOM_POLICY.MAX_RESIDENT_ZONES = 2`),
 * immediately detaching evicted zone graphs and calling `ResourceTracker.disposeAll()`.
 */
export class ShowroomZoneResidencyManager {
  private readonly maxResident: number;
  private readonly zones = new Map<string, ResidentZoneEntry>();
  private totalDisposed = 0;

  constructor(maxResident = SHOWROOM_MAX_RESIDENT_ZONES) {
    this.maxResident = Math.max(1, maxResident);
  }

  has(code: string): boolean {
    return this.zones.has(code);
  }

  get(code: string): THREE.Group | null {
    return this.zones.get(code)?.scene ?? null;
  }

  getResidentCodes(): string[] {
    return Array.from(this.zones.keys());
  }

  getTotalDisposedCount(): number {
    return this.totalDisposed;
  }

  registerZone(
    code: string,
    scene: THREE.Group,
    desiredCodes: ReadonlyArray<string>,
  ): number {
    const existing = this.zones.get(code);
    if (existing) {
      existing.scene.removeFromParent();
      const summary = existing.tracker.disposeAll();
      this.totalDisposed +=
        summary.geometriesDisposed +
        summary.materialsDisposed +
        summary.texturesDisposed;
      this.zones.delete(code);
    }

    scene.traverse((obj) => {
      obj.frustumCulled = true;
    });

    const tracker = new ResourceTracker();
    tracker.trackObject3D(scene);
    this.zones.set(code, { code, scene, tracker });

    return this.reconcile([code, ...desiredCodes]);
  }

  reconcile(desiredCodes: ReadonlyArray<string>): number {
    const allowed = new Set<string>();
    for (const code of desiredCodes) {
      if (code && !allowed.has(code)) {
        allowed.add(code);
        if (allowed.size >= this.maxResident) {
          break;
        }
      }
    }

    let disposedNow = 0;
    for (const [code, entry] of Array.from(this.zones.entries())) {
      if (!allowed.has(code)) {
        entry.scene.removeFromParent();
        const summary = entry.tracker.disposeAll();
        const count =
          summary.geometriesDisposed +
          summary.materialsDisposed +
          summary.texturesDisposed;
        this.totalDisposed += count;
        disposedNow += count;
        this.zones.delete(code);
      }
    }

    // Defensive cap in case desiredCodes wasn't fully satisfied yet
    while (this.zones.size > this.maxResident) {
      const oldestKey = this.zones.keys().next().value;
      if (!oldestKey) break;
      const entry = this.zones.get(oldestKey);
      if (entry) {
        entry.scene.removeFromParent();
        const summary = entry.tracker.disposeAll();
        const count =
          summary.geometriesDisposed +
          summary.materialsDisposed +
          summary.texturesDisposed;
        this.totalDisposed += count;
        disposedNow += count;
      }
      this.zones.delete(oldestKey);
    }

    return disposedNow;
  }

  disposeAll(): number {
    let disposedNow = 0;
    for (const entry of this.zones.values()) {
      entry.scene.removeFromParent();
      const summary = entry.tracker.disposeAll();
      const count =
        summary.geometriesDisposed +
        summary.materialsDisposed +
        summary.texturesDisposed;
      this.totalDisposed += count;
      disposedNow += count;
    }
    this.zones.clear();
    return disposedNow;
  }
}

function writeShowroomDiagnostics(snapshot: ShowroomDiagnosticsSnapshot): void {
  if (typeof window === 'undefined') return;
  (
    window as unknown as {
      __ARVEN_3D_DIAGNOSTICS__?: ShowroomDiagnosticsSnapshot;
    }
  ).__ARVEN_3D_DIAGNOSTICS__ = snapshot;
}

interface ErrorBoundaryProps {
  readonly onError: (reason: string) => void;
  readonly fallback: ReactNode;
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

class ShowroomCanvasErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onError(error.message || 'webgl_render_error');
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

interface InnerShowroomSceneProps {
  readonly zones: ReadonlyArray<ShowroomZonePublicDto>;
  readonly activeZone: ShowroomZonePublicDto;
  readonly selectedHotspotId: string | null;
  readonly activeTier: DeviceQualityTier;
  readonly reducedMotion: boolean;
  readonly interactionEnabled: boolean;
  readonly dracoPath: string;
  readonly ktx2Path: string;
  readonly onHotspotSelect?: (hotspot: ShowroomHotspotPublicDto) => void;
  readonly onZoneRequest?: (targetZoneCode: string) => void;
  readonly onControlsReady?: (handle: ShowroomCameraControlHandle | null) => void;
  readonly onFallbackTriggered: (reason: string) => void;
  readonly onLoadStateChange: (
    state: ShowroomDiagnosticsSnapshot['loadState'],
    errorMsg?: string | null,
  ) => void;
}

function ShowroomSceneContent({
  zones,
  activeZone,
  selectedHotspotId,
  activeTier,
  reducedMotion,
  interactionEnabled,
  dracoPath,
  ktx2Path,
  onHotspotSelect,
  onZoneRequest,
  onControlsReady,
  onFallbackTriggered,
  onLoadStateChange,
}: InnerShowroomSceneProps) {
  const { gl, camera, invalidate } = useThree();
  const orbitRef = useRef<OrbitControlsLike | null>(null);
  const residencyRef = useRef<ShowroomZoneResidencyManager | null>(null);
  const glideRafRef = useRef<number | null>(null);
  const contextLossCountRef = useRef(0);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadersRef = useRef<{
    draco: DRACOLoader;
    ktx2: KTX2Loader;
    gltf: GLTFLoader;
  } | null>(null);

  const [hoveredPortalCode, setHoveredPortalCode] = useState<string | null>(null);
  const [hoveredHotspotId, setHoveredHotspotId] = useState<string | null>(null);
  const [activeZoneScene, setActiveZoneScene] = useState<THREE.Group | null>(null);
  const loadStateRef = useRef<ShowroomDiagnosticsSnapshot['loadState']>('loading');

  if (!residencyRef.current) {
    residencyRef.current = new ShowroomZoneResidencyManager(SHOWROOM_MAX_RESIDENT_ZONES);
  }

  const preloadTargetCode = useMemo(() => {
    if (
      hoveredPortalCode &&
      hoveredPortalCode !== activeZone.code &&
      zones.some((z) => z.code === hoveredPortalCode)
    ) {
      return hoveredPortalCode;
    }
    const primaryPortal = activeZone.portals[0]?.targetZoneCode;
    if (
      primaryPortal &&
      primaryPortal !== activeZone.code &&
      zones.some((z) => z.code === primaryPortal)
    ) {
      return primaryPortal;
    }
    return null;
  }, [activeZone, hoveredPortalCode, zones]);

  const desiredResidentCodes = useMemo(() => {
    return preloadTargetCode
      ? [activeZone.code, preloadTargetCode]
      : [activeZone.code];
  }, [activeZone.code, preloadTargetCode]);

  const emitDiagnostics = useCallback(
    (state: ShowroomDiagnosticsSnapshot['loadState']) => {
      loadStateRef.current = state;
      writeShowroomDiagnostics({
        experience: 'showroom',
        activeZoneCode: activeZone.code,
        residentZoneCodes: residencyRef.current?.getResidentCodes() ?? [],
        activeTier,
        frameloop: 'demand',
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        disposedResources: residencyRef.current?.getTotalDisposedCount() ?? 0,
        loadState: state,
        contextLostCount: contextLossCountRef.current,
        reducedMotion,
        updatedAt: new Date().toISOString(),
      });
    },
    [activeTier, activeZone.code, gl, reducedMotion],
  );

  const cancelActiveGlide = useCallback(() => {
    if (glideRafRef.current !== null) {
      cancelAnimationFrame(glideRafRef.current);
      glideRafRef.current = null;
    }
  }, []);

  const moveCameraTo = useCallback(
    (nextPosition: THREE.Vector3, nextTarget: THREE.Vector3) => {
      cancelActiveGlide();
      const applyImmediate = () => {
        camera.position.copy(nextPosition);
        camera.lookAt(nextTarget);
        if (orbitRef.current) {
          orbitRef.current.target.copy(nextTarget);
          orbitRef.current.update();
        }
        invalidate();
      };

      if (reducedMotion || typeof requestAnimationFrame !== 'function') {
        applyImmediate();
        return;
      }

      const startPos = camera.position.clone();
      const startTarget =
        orbitRef.current?.target.clone() ??
        new THREE.Vector3(...activeZone.cameraBaseline.target);
      const startTime = performance.now();
      const durationMs = 320;

      const step = (now: number) => {
        const rawT = Math.min(1, (now - startTime) / durationMs);
        const eased = 1 - Math.pow(1 - rawT, 3);
        camera.position.lerpVectors(startPos, nextPosition, eased);
        const interpTarget = startTarget.clone().lerp(nextTarget, eased);
        camera.lookAt(interpTarget);
        if (orbitRef.current) {
          orbitRef.current.target.copy(interpTarget);
          orbitRef.current.update();
        }
        invalidate();

        if (rawT < 1) {
          glideRafRef.current = requestAnimationFrame(step);
        } else {
          glideRafRef.current = null;
        }
      };

      glideRafRef.current = requestAnimationFrame(step);
    },
    [activeZone.cameraBaseline.target, camera, cancelActiveGlide, invalidate, reducedMotion],
  );

  // Initialize self-hosted decoders once per canvas mount and dispose on unmount
  useEffect(() => {
    const draco = new DRACOLoader();
    draco.setDecoderPath(dracoPath);

    const ktx2 = new KTX2Loader();
    ktx2.setTranscoderPath(ktx2Path);
    ktx2.detectSupport(gl);

    const gltf = new GLTFLoader();
    gltf.setDRACOLoader(draco);
    gltf.setKTX2Loader(ktx2);
    gltf.setMeshoptDecoder(MeshoptDecoder);

    loadersRef.current = { draco, ktx2, gltf };
    const residency = residencyRef.current;

    return () => {
      cancelActiveGlide();
      residency?.disposeAll();
      draco.dispose();
      ktx2.dispose();
      loadersRef.current = null;
    };
  }, [cancelActiveGlide, dracoPath, gl, ktx2Path]);

  // WebGL context loss & restoration lifecycle
  useEffect(() => {
    const canvasEl = gl.domElement;
    const handleLost = (event: Event) => {
      event.preventDefault();
      contextLossCountRef.current += 1;
      onLoadStateChange('recovering', null);
      emitDiagnostics('recovering');

      if (contextLossCountRef.current >= 2) {
        onFallbackTriggered('webgl_context_lost_twice');
        return;
      }

      if (recoveryTimerRef.current) {
        clearTimeout(recoveryTimerRef.current);
      }
      recoveryTimerRef.current = setTimeout(() => {
        onFallbackTriggered('webgl_context_restore_timeout');
      }, 3000);
    };

    const handleRestored = () => {
      if (recoveryTimerRef.current) {
        clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = null;
      }
      loadersRef.current?.ktx2.detectSupport(gl);
      onLoadStateChange('ready', null);
      emitDiagnostics('ready');
      invalidate();
    };

    canvasEl.addEventListener('webglcontextlost', handleLost, false);
    canvasEl.addEventListener('webglcontextrestored', handleRestored, false);

    return () => {
      canvasEl.removeEventListener('webglcontextlost', handleLost, false);
      canvasEl.removeEventListener('webglcontextrestored', handleRestored, false);
      if (recoveryTimerRef.current) {
        clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = null;
      }
    };
  }, [emitDiagnostics, gl, invalidate, onFallbackTriggered, onLoadStateChange]);

  // Load active zone + optional primary/hovered portal target, strictly bounded to max 2 zones
  useEffect(() => {
    const residency = residencyRef.current;
    const loaders = loadersRef.current;
    if (!residency || !loaders) return;

    let cancelled = false;
    const abortController = new AbortController();

    const loadZoneByDto = async (
      zone: ShowroomZonePublicDto,
      isPrimary: boolean,
    ): Promise<void> => {
      if (residency.has(zone.code)) {
        if (isPrimary) {
          residency.reconcile(desiredResidentCodes);
          setActiveZoneScene(residency.get(zone.code));
          onLoadStateChange('ready', null);
          emitDiagnostics('ready');
          invalidate();
        }
        return;
      }

      const url =
        activeTier === 'lite' && zone.liteSceneUrl
          ? zone.liteSceneUrl
          : zone.sceneUrl;

      try {
        if (isPrimary) {
          onLoadStateChange('loading', null);
          emitDiagnostics('loading');
        }
        const response = await fetch(url, {
          signal: abortController.signal,
          cache: 'force-cache',
        });
        if (!response.ok) {
          throw new Error(`HTTP_${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        if (cancelled) return;

        await new Promise<void>((resolve, reject) => {
          loaders.gltf.parse(
            buffer,
            '',
            (gltf) => {
              if (cancelled) {
                const tempTracker = new ResourceTracker();
                tempTracker.trackObject3D(gltf.scene);
                tempTracker.disposeAll();
                resolve();
                return;
              }
              residency.registerZone(zone.code, gltf.scene, desiredResidentCodes);
              if (isPrimary) {
                setActiveZoneScene(residency.get(zone.code));
                onLoadStateChange('ready', null);
                emitDiagnostics('ready');
                invalidate();
                requestAnimationFrame(() => invalidate());
              } else {
                emitDiagnostics(loadStateRef.current);
              }
              resolve();
            },
            (err) => reject(err instanceof Error ? err : new Error('gltf_parse_failed')),
          );
        });
      } catch (err) {
        if (cancelled || abortController.signal.aborted) return;
        if (isPrimary) {
          const reason = err instanceof Error ? err.message : 'zone_load_failed';
          onLoadStateChange('error', reason);
          emitDiagnostics('error');
        }
      }
    };

    const run = async () => {
      await loadZoneByDto(activeZone, true);
      if (cancelled) return;
      if (preloadTargetCode) {
        const targetZone = zones.find((z) => z.code === preloadTargetCode);
        if (targetZone) {
          await loadZoneByDto(targetZone, false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    activeTier,
    activeZone,
    desiredResidentCodes,
    emitDiagnostics,
    invalidate,
    onLoadStateChange,
    preloadTargetCode,
    zones,
  ]);

  // Snap or glide camera to zone baseline whenever activeZone changes
  useEffect(() => {
    const pos = new THREE.Vector3(...activeZone.cameraBaseline.position);
    const target = new THREE.Vector3(...activeZone.cameraBaseline.target);
    moveCameraTo(pos, target);
  }, [activeZone, moveCameraTo]);

  // Expose imperative handle for external 44x44px DOM navigation controls
  useEffect(() => {
    const handle: ShowroomCameraControlHandle = {
      rotateBy: (deltaAzimuthRad: number, deltaPolarRad = 0) => {
        const target =
          orbitRef.current?.target.clone() ??
          new THREE.Vector3(...activeZone.cameraBaseline.target);
        const offset = camera.position.clone().sub(target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        spherical.theta += deltaAzimuthRad;
        spherical.phi = Math.max(
          0.25,
          Math.min(Math.PI * 0.48, spherical.phi + deltaPolarRad),
        );
        offset.setFromSpherical(spherical);
        camera.position.copy(target).add(offset);
        camera.lookAt(target);
        orbitRef.current?.update();
        invalidate();
      },
      moveForward: (stepMeters: number) => {
        const target =
          orbitRef.current?.target.clone() ??
          new THREE.Vector3(...activeZone.cameraBaseline.target);
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() < 1e-6) {
          forward.set(0, 0, -1);
        } else {
          forward.normalize();
        }
        const delta = forward.multiplyScalar(stepMeters);
        const nextTarget = target.clone().add(delta);
        nextTarget.x = Math.max(-4.5, Math.min(4.5, nextTarget.x));
        nextTarget.z = Math.max(-4.5, Math.min(4.5, nextTarget.z));
        const clampedDelta = nextTarget.clone().sub(target);
        const nextPos = camera.position.clone().add(clampedDelta);
        moveCameraTo(nextPos, nextTarget);
      },
      focusHotspot: (hotspotId: string) => {
        const hotspot = activeZone.hotspots.find((h) => h.id === hotspotId);
        if (!hotspot) return;
        const target = new THREE.Vector3(...hotspot.position);
        const viewOffset = new THREE.Vector3(0.45, 0.75, 1.95);
        const nextPos = target.clone().add(viewOffset);
        moveCameraTo(nextPos, target);
      },
      resetView: () => {
        const pos = new THREE.Vector3(...activeZone.cameraBaseline.position);
        const target = new THREE.Vector3(...activeZone.cameraBaseline.target);
        moveCameraTo(pos, target);
      },
    };

    onControlsReady?.(handle);
    return () => {
      onControlsReady?.(null);
    };
  }, [activeZone, camera, invalidate, moveCameraTo, onControlsReady]);

  const warm = activeZone.lightingPreset === 'arven_warm_editorial_v1';

  return (
    <>
      <color attach="background" args={['#17191B']} />
      <ambientLight intensity={warm ? 0.85 : 0.78} color={warm ? '#FFF4E6' : '#F8F7F3'} />
      <hemisphereLight
        args={[warm ? '#FFF4E6' : '#F8F7F3', '#222528', 0.65]}
      />

      <group dispose={null}>
        {activeZoneScene ? <primitive object={activeZoneScene} /> : null}
      </group>

      {activeZone.hotspots.map((hotspot) => {
        const selected = selectedHotspotId === hotspot.id;
        const hovered = hoveredHotspotId === hotspot.id;
        const pinColor = selected || hovered ? '#C5A572' : '#9E9C92';
        return (
          <group
            key={hotspot.id}
            position={[
              hotspot.position[0],
              Math.max(0.95, hotspot.position[1]),
              hotspot.position[2],
            ]}
          >
            <mesh
              frustumCulled
              onClick={(e) => {
                e.stopPropagation();
                onHotspotSelect?.(hotspot);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredHotspotId(hotspot.id);
                document.body.style.cursor = 'pointer';
                invalidate();
              }}
              onPointerOut={() => {
                setHoveredHotspotId((curr) => (curr === hotspot.id ? null : curr));
                document.body.style.cursor = 'auto';
                invalidate();
              }}
            >
              <cylinderGeometry args={[0.14, 0.14, 0.04, 18]} />
              <meshStandardMaterial
                color="#17191B"
                roughness={0.55}
                metalness={0.2}
              />
            </mesh>
            <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled>
              <ringGeometry args={[0.1, 0.145, 24]} />
              <meshBasicMaterial color={pinColor} side={THREE.DoubleSide} />
            </mesh>
          </group>
        );
      })}

      {activeZone.portals.map((portal) => {
        const hovered = hoveredPortalCode === portal.targetZoneCode;
        return (
          <mesh
            key={portal.targetZoneCode}
            position={[portal.position[0], portal.position[1] + 1.25, portal.position[2]]}
            frustumCulled
            onClick={(e) => {
              e.stopPropagation();
              onZoneRequest?.(portal.targetZoneCode);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoveredPortalCode(portal.targetZoneCode);
              document.body.style.cursor = 'pointer';
              invalidate();
            }}
            onPointerOut={() => {
              setHoveredPortalCode((curr) =>
                curr === portal.targetZoneCode ? null : curr,
              );
              document.body.style.cursor = 'auto';
              invalidate();
            }}
          >
            <boxGeometry args={[1.1, 2.3, 0.18]} />
            <meshBasicMaterial
              color={hovered ? '#C5A572' : '#82B0DC'}
              transparent
              opacity={hovered ? 0.24 : 0.08}
            />
          </mesh>
        );
      })}

      <OrbitControls
        ref={orbitRef as never}
        makeDefault
        enabled={interactionEnabled}
        enablePan
        enableDamping={!reducedMotion}
        dampingFactor={0.08}
        minDistance={activeZone.cameraBaseline.minDistance}
        maxDistance={activeZone.cameraBaseline.maxDistance}
        minPolarAngle={0.22}
        maxPolarAngle={Math.PI * 0.48}
        target={activeZone.cameraBaseline.target}
      />
    </>
  );
}

/**
 * Progressive WebGL Virtual Showroom experience (`@arven/three-engine/showroom`).
 * Enforces demand rendering (`frameloop="demand"`), max-2-zone GPU residency with
 * immediate `ResourceTracker` disposal, baked lighting, and WebGL recovery fallback.
 */
export function ShowroomExperience({
  zones,
  activeZoneCode,
  selectedHotspotId = null,
  tierOverride,
  reducedMotion,
  interactionEnabled = true,
  dracoDecoderPath = '/decoders/draco/',
  ktx2TranscoderPath = '/decoders/basis/',
  onHotspotSelect,
  onZoneRequest,
  onWebGLFallback,
  onControlsReady,
}: ShowroomExperienceProps) {
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [detectedTier, setDetectedTier] = useState<DeviceQualityTier>('default');
  const [detectedReducedMotion, setDetectedReducedMotion] = useState(false);
  const [loadState, setLoadState] =
    useState<ShowroomDiagnosticsSnapshot['loadState']>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const cap = detectWebGLCapabilities();
    const tier = tierOverride ?? resolveDeviceQualityTier();
    const reduced = reducedMotion ?? prefersReducedMotion();

    setWebglSupported(cap.supported);
    setDetectedTier(tier);
    setDetectedReducedMotion(reduced);

    if (!cap.supported) {
      setLoadState('fallback');
      onWebGLFallback?.(cap.reason ?? 'webgl_unavailable');
    }
  }, [onWebGLFallback, reducedMotion, tierOverride]);

  const resolvedTier = tierOverride ?? detectedTier;
  const resolvedReducedMotion = reducedMotion ?? detectedReducedMotion;

  const activeZone = useMemo(
    () => zones.find((z) => z.code === activeZoneCode) ?? zones[0] ?? null,
    [activeZoneCode, zones],
  );

  const handleLoadStateChange = useCallback(
    (nextState: ShowroomDiagnosticsSnapshot['loadState'], msg?: string | null) => {
      setLoadState(nextState);
      setErrorMsg(msg ?? null);
    },
    [],
  );

  const handleFallbackTriggered = useCallback(
    (reason: string) => {
      setLoadState('fallback');
      setErrorMsg(reason);
      onWebGLFallback?.(reason);
    },
    [onWebGLFallback],
  );

  if (!activeZone) {
    return (
      <div
        data-theme="dark"
        className="flex h-full min-h-[300px] w-full items-center justify-center bg-[#17191B] p-6 text-center text-[#F8F7F3]"
      >
        <p className="text-sm text-[#B2B0A6]">
          Belum ada zona ruang pamer yang tersedia.
        </p>
      </div>
    );
  }

  const posterFallback = (
    <div
      data-theme="dark"
      className="relative h-full min-h-[300px] w-full overflow-hidden bg-[#17191B] text-[#F8F7F3]"
      data-testid="arven-showroom-fallback"
    >
      <img
        src={activeZone.posterUrl}
        alt={`Poster zona ${activeZone.title}`}
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 border-t border-[#46494C] bg-[#17191B]/95 p-4">
        <p className="text-sm text-[#F8F7F3]">
          Mode poster 2D aktif untuk zona {activeZone.title}.
        </p>
      </div>
    </div>
  );

  if (webglSupported === false || loadState === 'fallback') {
    return posterFallback;
  }

  return (
    <div
      data-theme="dark"
      className="relative h-full min-h-[300px] w-full overflow-hidden bg-[#17191B] text-[#F8F7F3]"
      data-testid="arven-showroom-canvas-host"
    >
      {webglSupported ? (
        <ShowroomCanvasErrorBoundary
          onError={handleFallbackTriggered}
          fallback={posterFallback}
        >
          <Canvas
            frameloop="demand"
            dpr={resolvedTier === 'lite' ? [1, 1.5] : [1, 2]}
            shadows={false}
            fallback={posterFallback}
            gl={{
              antialias: true,
              powerPreference: 'high-performance',
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.0,
            }}
            camera={{
              fov: activeZone.cameraBaseline.fovDeg,
              position: activeZone.cameraBaseline.position,
              near: 0.05,
              far: 80,
            }}
          >
            <ShowroomSceneContent
              zones={zones}
              activeZone={activeZone}
              selectedHotspotId={selectedHotspotId}
              activeTier={resolvedTier}
              reducedMotion={resolvedReducedMotion}
              interactionEnabled={interactionEnabled}
              dracoPath={dracoDecoderPath}
              ktx2Path={ktx2TranscoderPath}
              onHotspotSelect={onHotspotSelect}
              onZoneRequest={onZoneRequest}
              onControlsReady={onControlsReady}
              onFallbackTriggered={handleFallbackTriggered}
              onLoadStateChange={handleLoadStateChange}
            />
          </Canvas>
        </ShowroomCanvasErrorBoundary>
      ) : (
        <div className="flex h-full min-h-[300px] w-full items-center justify-center bg-[#17191B] p-6 text-center">
          <span className="font-mono text-xs uppercase tracking-[0.06em] text-[#B2B0A6]">
            Menginisialisasi Ruang Pamer 3D...
          </span>
        </div>
      )}

      {loadState === 'loading' || loadState === 'recovering' ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
          <span className="border border-[#46494C] bg-[#17191B]/90 px-3 py-1.5 font-mono text-xs text-[#F8F7F3]">
            {loadState === 'recovering'
              ? 'Memulihkan tampilan 3D...'
              : `Memuat zona ${activeZone.title}...`}
          </span>
        </div>
      ) : null}

      {loadState === 'error' && errorMsg ? (
        <div
          role="alert"
          className="absolute inset-x-3 bottom-3 border border-[#E48966] bg-[#35231E] px-3 py-2 text-xs text-[#F8F7F3]"
        >
          Zona 3D tidak dapat dimuat ({errorMsg}). Anda dapat beralih ke zona lain atau menelusuri katalog di bawah.
        </div>
      ) : null}
    </div>
  );
}
