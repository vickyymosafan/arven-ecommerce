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
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type {
  GarmentSilhouetteInput,
  MaterialOverrideEntryInput,
  MaterialSlotSpecDto,
  OutfitAnchorInput,
  OutfitSlotInput,
} from '@arven/contracts';
import {
  detectWebGLCapabilities,
  prefersReducedMotion,
  resolveDeviceQualityTier,
  type DeviceQualityTier,
} from '../capabilities.js';
import { inferSilhouetteFromSlug } from '../glb-binary.js';
import { applyMaterialPresetToScene } from '../material-preset-controller.js';
import {
  acquireAtelierStudioEnv,
  getAtelierStudioEnvRefCount,
  releaseAtelierStudioEnv,
  upgradeGarmentSceneToAtelierPbr,
  upgradeMannequinSceneToAtelierPbr,
} from '../materials/atelier-pbr-materials.js';
import { OUTFIT_SLOTS } from '../outfit-compatibility.js';
import { ResourceTracker } from '../resource-tracker.js';

export const DEFAULT_STUDIO_ENV_KEY = 'arven_outfit_studio_neutral_v1';

export interface OutfitSlotRenderItem {
  readonly slot: OutfitSlotInput;
  readonly productId: string;
  readonly productSlug?: string;
  readonly variantId: string;
  readonly assetId: string;
  readonly modelUrl: string;
  readonly mobileModelUrl: string | null;
  readonly anchor: OutfitAnchorInput;
  readonly materialSlots: ReadonlyArray<MaterialSlotSpecDto>;
  readonly presetId: string | null;
  readonly materialOverrides: Readonly<
    Record<string, MaterialOverrideEntryInput>
  > | null;
}

export interface OutfitStudioExperienceProps {
  readonly rigId: string;
  readonly rigModelUrl: string;
  readonly rigMobileModelUrl: string | null;
  readonly rigPosterUrl: string;
  readonly slots: Partial<Record<OutfitSlotInput, OutfitSlotRenderItem>>;
  readonly tierOverride?: DeviceQualityTier;
  readonly reducedMotion?: boolean;
  readonly interactionEnabled?: boolean;
  readonly dracoDecoderPath?: string;
  readonly ktx2TranscoderPath?: string;
  readonly onSlotLoaded?: (slot: OutfitSlotInput, assetId: string) => void;
  readonly onSlotError?: (slot: OutfitSlotInput, reason: string) => void;
  readonly onWebGLFallback?: (reason: string) => void;
}

export interface OutfitStudioDiagnosticsSnapshot {
  readonly experience: 'outfit-studio';
  readonly rigId: string;
  readonly activeSlots: OutfitSlotInput[];
  readonly activeTier: DeviceQualityTier;
  readonly frameloop: 'demand';
  readonly geometries: number;
  readonly textures: number;
  readonly disposedResources: number;
  readonly sharedEnvRefCount: number;
  readonly loadState: 'loading' | 'ready' | 'error' | 'recovering' | 'fallback';
  readonly contextLostCount: number;
  readonly reducedMotion: boolean;
  readonly updatedAt: string;
}

/**
 * Reference-counted shared Atelier Studio PMREM environment (`<group dispose={null}>` companion).
 * Guarantees garment swaps never tear down or reallocate the studio environment.
 */
export function acquireSharedStudioEnv(
  envKey = DEFAULT_STUDIO_ENV_KEY,
  gl?: THREE.WebGLRenderer,
): {
  readonly envKey: string;
  readonly refCount: number;
  readonly texture: THREE.Texture | null;
} {
  return acquireAtelierStudioEnv(envKey, gl, false);
}

/**
 * Decrements the shared studio environment refcount and disposes the PMREM render target
 * strictly when the refcount reaches 0.
 */
export function releaseSharedStudioEnv(envKey = DEFAULT_STUDIO_ENV_KEY): {
  readonly envKey: string;
  readonly refCount: number;
  readonly disposed: boolean;
} {
  return releaseAtelierStudioEnv(envKey);
}

export function getSharedStudioEnvRefCount(
  envKey = DEFAULT_STUDIO_ENV_KEY,
): number {
  return getAtelierStudioEnvRefCount(envKey);
}

function inferSilhouetteForOutfitItem(item: OutfitSlotRenderItem): GarmentSilhouetteInput {
  if (item.productSlug) {
    return inferSilhouetteFromSlug(item.productSlug);
  }
  switch (item.slot) {
    case 'bottom':
      return 'trouser';
    case 'outerwear':
      return 'overshirt';
    case 'footwear':
      return 'sneaker';
    case 'accessory':
      return 'crossbody';
    case 'top':
    default:
      return 'tee';
  }
}

interface SlotTrackerEntry {
  readonly tracker: ResourceTracker;
  object: THREE.Object3D | null;
  assetId: string | null;
  anchor: OutfitAnchorInput | null;
}

/**
 * Owns 5 independent `ResourceTracker` instances (one per Outfit Studio slot).
 * Swapping or clearing one slot detaches and disposes ONLY that slot's GPU resources.
 */
export class OutfitSlotResourceManager {
  private readonly slotMap = new Map<OutfitSlotInput, SlotTrackerEntry>();
  private totalDisposed = 0;

  constructor() {
    for (const slot of OUTFIT_SLOTS) {
      this.slotMap.set(slot, {
        tracker: new ResourceTracker(),
        object: null,
        assetId: null,
        anchor: null,
      });
    }
  }

  attachSlot(
    slot: OutfitSlotInput,
    assetId: string,
    anchor: OutfitAnchorInput,
    garmentObject: THREE.Object3D,
    rigRoot: THREE.Object3D,
  ): number {
    const disposedPrevious = this.disposeSlot(slot);
    const entry = this.slotMap.get(slot);
    if (!entry) return disposedPrevious;

    garmentObject.traverse((obj) => {
      obj.frustumCulled = true;
    });

    entry.tracker.trackObject3D(garmentObject);
    entry.object = garmentObject;
    entry.assetId = assetId;
    entry.anchor = anchor;

    const anchorNode = rigRoot.getObjectByName(anchor) ?? rigRoot;
    anchorNode.add(garmentObject);

    return disposedPrevious;
  }

  disposeSlot(slot: OutfitSlotInput): number {
    const entry = this.slotMap.get(slot);
    if (!entry) return 0;

    if (entry.object) {
      entry.object.removeFromParent();
      entry.object = null;
    }
    entry.assetId = null;
    entry.anchor = null;

    const summary = entry.tracker.disposeAll();
    const count =
      summary.geometriesDisposed +
      summary.materialsDisposed +
      summary.texturesDisposed;
    this.totalDisposed += count;
    return count;
  }

  getSlotEntry(slot: OutfitSlotInput): {
    readonly object: THREE.Object3D | null;
    readonly assetId: string | null;
    readonly anchor: OutfitAnchorInput | null;
  } {
    const entry = this.slotMap.get(slot);
    return {
      object: entry?.object ?? null,
      assetId: entry?.assetId ?? null,
      anchor: entry?.anchor ?? null,
    };
  }

  getActiveSlots(): OutfitSlotInput[] {
    const active: OutfitSlotInput[] = [];
    for (const slot of OUTFIT_SLOTS) {
      const entry = this.slotMap.get(slot);
      if (entry?.object) {
        active.push(slot);
      }
    }
    return active;
  }

  getSlotDisposedCount(slot: OutfitSlotInput): number {
    return this.slotMap.get(slot)?.tracker.getTotalDisposedCount() ?? 0;
  }

  getTotalDisposedCount(): number {
    return this.totalDisposed;
  }

  disposeAllSlots(): number {
    let total = 0;
    for (const slot of OUTFIT_SLOTS) {
      total += this.disposeSlot(slot);
    }
    return total;
  }
}

function writeOutfitDiagnostics(snapshot: OutfitStudioDiagnosticsSnapshot): void {
  if (typeof window === 'undefined') return;
  (
    window as unknown as {
      __ARVEN_3D_DIAGNOSTICS__?: OutfitStudioDiagnosticsSnapshot;
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

class OutfitCanvasErrorBoundary extends Component<
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

interface InnerOutfitSceneProps {
  readonly rigId: string;
  readonly resolvedRigUrl: string;
  readonly slots: Partial<Record<OutfitSlotInput, OutfitSlotRenderItem>>;
  readonly activeTier: DeviceQualityTier;
  readonly reducedMotion: boolean;
  readonly interactionEnabled: boolean;
  readonly dracoPath: string;
  readonly ktx2Path: string;
  readonly onSlotLoaded?: (slot: OutfitSlotInput, assetId: string) => void;
  readonly onSlotError?: (slot: OutfitSlotInput, reason: string) => void;
  readonly onLoadStateChange: (
    state: OutfitStudioDiagnosticsSnapshot['loadState'],
    errorMsg?: string | null,
  ) => void;
  readonly onFallbackTriggered: (reason: string) => void;
}

function OutfitStudioSceneContent({
  rigId,
  resolvedRigUrl,
  slots,
  activeTier,
  reducedMotion,
  interactionEnabled,
  dracoPath,
  ktx2Path,
  onSlotLoaded,
  onSlotError,
  onLoadStateChange,
  onFallbackTriggered,
}: InnerOutfitSceneProps) {
  const { gl, scene, invalidate } = useThree();
  const rigTrackerRef = useRef<ResourceTracker | null>(null);
  const slotManagerRef = useRef<OutfitSlotResourceManager | null>(null);
  const loadersRef = useRef<{
    draco: DRACOLoader;
    ktx2: KTX2Loader;
    gltf: GLTFLoader;
  } | null>(null);

  const [rigScene, setRigScene] = useState<THREE.Group | null>(null);
  const [shadowRev, setShadowRev] = useState(0);
  const contextLossCountRef = useRef(0);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!rigTrackerRef.current) {
    rigTrackerRef.current = new ResourceTracker();
  }
  if (!slotManagerRef.current) {
    slotManagerRef.current = new OutfitSlotResourceManager();
  }

  const emitDiagnostics = useCallback(
    (state: OutfitStudioDiagnosticsSnapshot['loadState']) => {
      const rigDisposed = rigTrackerRef.current?.getTotalDisposedCount() ?? 0;
      const slotsDisposed = slotManagerRef.current?.getTotalDisposedCount() ?? 0;
      writeOutfitDiagnostics({
        experience: 'outfit-studio',
        rigId,
        activeSlots: slotManagerRef.current?.getActiveSlots() ?? [],
        activeTier,
        frameloop: 'demand',
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        disposedResources: rigDisposed + slotsDisposed,
        sharedEnvRefCount: getSharedStudioEnvRefCount(DEFAULT_STUDIO_ENV_KEY),
        loadState: state,
        contextLostCount: contextLossCountRef.current,
        reducedMotion,
        updatedAt: new Date().toISOString(),
      });
    },
    [activeTier, gl, reducedMotion, rigId],
  );

  const scheduleDualInvalidate = useCallback((): (() => void) => {
    invalidate();
    if (typeof requestAnimationFrame !== 'function') {
      return () => undefined;
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      invalidate();
      raf2 = requestAnimationFrame(() => {
        invalidate();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [invalidate]);

  // Mount refcounted shared Atelier Studio PMREM environment & self-hosted decoders
  useEffect(() => {
    const sharedEnv = acquireSharedStudioEnv(DEFAULT_STUDIO_ENV_KEY, gl);
    if (sharedEnv.texture) {
      scene.environment = sharedEnv.texture;
    }

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
    const slotMgr = slotManagerRef.current;
    const rigTracker = rigTrackerRef.current;

    return () => {
      slotMgr?.disposeAllSlots();
      rigTracker?.disposeAll();
      draco.dispose();
      ktx2.dispose();
      loadersRef.current = null;
      scene.environment = null;
      releaseSharedStudioEnv(DEFAULT_STUDIO_ENV_KEY);
    };
  }, [dracoPath, gl, ktx2Path, scene]);

  // WebGL context loss & restoration handlers
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
      scheduleDualInvalidate();
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
  }, [
    emitDiagnostics,
    gl,
    onFallbackTriggered,
    onLoadStateChange,
    scheduleDualInvalidate,
  ]);

  // Load sculpted unisex mannequin rig GLB & upgrade to tailor-form charcoal linen + bronze PBR
  useEffect(() => {
    const loaders = loadersRef.current;
    const rigTracker = rigTrackerRef.current;
    const slotMgr = slotManagerRef.current;
    if (!loaders || !rigTracker || !slotMgr) return;

    let cancelled = false;
    const abortController = new AbortController();

    const loadRig = async () => {
      try {
        onLoadStateChange('loading', null);
        emitDiagnostics('loading');
        const response = await fetch(resolvedRigUrl, {
          signal: abortController.signal,
          cache: 'no-cache',
        });
        if (!response.ok) {
          throw new Error(`HTTP_${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        if (cancelled) return;

        loaders.gltf.parse(
          buffer,
          '',
          (gltf) => {
            if (cancelled) {
              const tempTracker = new ResourceTracker();
              tempTracker.trackObject3D(gltf.scene);
              tempTracker.disposeAll();
              return;
            }
            slotMgr.disposeAllSlots();
            rigTracker.disposeAll();
            upgradeMannequinSceneToAtelierPbr(gltf.scene, activeTier === 'lite');
            gltf.scene.traverse((obj) => {
              obj.frustumCulled = true;
            });
            rigTracker.trackObject3D(gltf.scene);
            setRigScene(gltf.scene);
            setShadowRev((r) => r + 1);
            onLoadStateChange('ready', null);
            emitDiagnostics('ready');
            scheduleDualInvalidate();
          },
          (err) => {
            if (cancelled) return;
            const reason =
              err instanceof Error ? err.message : 'rig_gltf_parse_failed';
            onLoadStateChange('error', reason);
            emitDiagnostics('error');
          },
        );
      } catch (err) {
        if (cancelled || abortController.signal.aborted) return;
        const reason = err instanceof Error ? err.message : 'rig_load_failed';
        onLoadStateChange('error', reason);
        emitDiagnostics('error');
      }
    };

    void loadRig();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    activeTier,
    emitDiagnostics,
    onLoadStateChange,
    resolvedRigUrl,
    scheduleDualInvalidate,
  ]);

  // Reconcile 5 garment slots independently: upgrade each garment to Atelier PBR & dispose per slot
  useEffect(() => {
    const slotMgr = slotManagerRef.current;
    const loaders = loadersRef.current;
    if (!rigScene || !slotMgr || !loaders) return;

    let cancelled = false;
    const abortController = new AbortController();
    const cancelRafs: Array<() => void> = [];

    for (const slot of OUTFIT_SLOTS) {
      const nextItem = slots[slot];
      const existing = slotMgr.getSlotEntry(slot);

      if (!nextItem) {
        if (existing.object) {
          slotMgr.disposeSlot(slot);
          setShadowRev((r) => r + 1);
          emitDiagnostics('ready');
          cancelRafs.push(scheduleDualInvalidate());
        }
        continue;
      }

      if (
        existing.object &&
        existing.assetId === nextItem.assetId &&
        existing.anchor === nextItem.anchor
      ) {
        applyMaterialPresetToScene(
          existing.object,
          nextItem.materialSlots,
          nextItem.materialOverrides,
        );
        emitDiagnostics('ready');
        cancelRafs.push(scheduleDualInvalidate());
        continue;
      }

      const garmentUrl =
        activeTier === 'lite' && nextItem.mobileModelUrl
          ? nextItem.mobileModelUrl
          : nextItem.modelUrl;

      const loadSlotGarment = async () => {
        try {
          const response = await fetch(garmentUrl, {
            signal: abortController.signal,
            cache: 'no-cache',
          });
          if (!response.ok) {
            throw new Error(`HTTP_${response.status}`);
          }
          const buffer = await response.arrayBuffer();
          if (cancelled) return;

          loaders.gltf.parse(
            buffer,
            '',
            (gltf) => {
              if (cancelled) {
                const tempTracker = new ResourceTracker();
                tempTracker.trackObject3D(gltf.scene);
                tempTracker.disposeAll();
                return;
              }

              upgradeGarmentSceneToAtelierPbr(gltf.scene, {
                silhouette: inferSilhouetteForOutfitItem(nextItem),
                productSlug: nextItem.productSlug,
                lite: activeTier === 'lite',
              });

              applyMaterialPresetToScene(
                gltf.scene,
                nextItem.materialSlots,
                nextItem.materialOverrides,
              );
              slotMgr.attachSlot(
                slot,
                nextItem.assetId,
                nextItem.anchor,
                gltf.scene,
                rigScene,
              );
              setShadowRev((r) => r + 1);
              onSlotLoaded?.(slot, nextItem.assetId);
              emitDiagnostics('ready');
              cancelRafs.push(scheduleDualInvalidate());
            },
            (parseErr) => {
              if (cancelled) return;
              const reason =
                parseErr instanceof Error
                  ? parseErr.message
                  : 'garment_parse_failed';
              onSlotError?.(slot, reason);
            },
          );
        } catch (err) {
          if (cancelled || abortController.signal.aborted) return;
          const reason = err instanceof Error ? err.message : 'garment_load_failed';
          onSlotError?.(slot, reason);
        }
      };

      void loadSlotGarment();
    }

    return () => {
      cancelled = true;
      abortController.abort();
      for (const cancel of cancelRafs) {
        cancel();
      }
    };
  }, [
    activeTier,
    emitDiagnostics,
    onSlotError,
    onSlotLoaded,
    rigScene,
    scheduleDualInvalidate,
    slots,
  ]);

  return (
    <>
      <color attach="background" args={['#1B1D20']} />
      <fog attach="fog" args={['#1B1D20', 5.2, 12.5]} />

      {/* Atelier Fitting Studio 3-point + bronze rim lighting */}
      <hemisphereLight args={['#FAF8F3', '#24272B', 0.56]} />
      <directionalLight
        position={[2.4, 3.6, 2.8]}
        intensity={1.85}
        color="#FFFDF8"
      />
      <directionalLight
        position={[-2.6, 2.1, 1.4]}
        intensity={0.85}
        color="#DCE6F0"
      />
      <directionalLight
        position={[-0.6, 2.2, -3.2]}
        intensity={1.35}
        color="#DFC496"
      />

      <group dispose={null}>
        {rigScene ? <primitive object={rigScene} /> : null}
      </group>

      <ContactShadows
        key={`outfit-shadow-${shadowRev}`}
        position={[0, -0.001, 0]}
        opacity={0.78}
        scale={2.4}
        blur={1.7}
        far={2.0}
        frames={1}
        resolution={activeTier === 'lite' ? 128 : 256}
        color="#070809"
      />

      <OrbitControls
        makeDefault
        enabled={interactionEnabled}
        enablePan={false}
        enableDamping={!reducedMotion}
        dampingFactor={0.08}
        minDistance={1.25}
        maxDistance={4.0}
        minPolarAngle={0.32}
        maxPolarAngle={Math.PI * 0.52}
        target={[0, 0.9, 0]}
      />
    </>
  );
}

/**
 * Progressive WebGL Outfit Studio experience (`@arven/three-engine/outfit-studio`).
 * Renders the sculpted unisex mannequin rig (`arven_mannequin_unisex_v1`) with
 * refcounted shared Atelier Studio PMREM lighting and per-slot `ResourceTracker` disposal.
 */
export function OutfitStudioExperience({
  rigId,
  rigModelUrl,
  rigMobileModelUrl,
  rigPosterUrl,
  slots,
  tierOverride,
  reducedMotion,
  interactionEnabled = true,
  dracoDecoderPath = '/decoders/draco/',
  ktx2TranscoderPath = '/decoders/basis/',
  onSlotLoaded,
  onSlotError,
  onWebGLFallback,
}: OutfitStudioExperienceProps) {
  const [webglSupported, setWebglSupported] = useState<boolean | null>(null);
  const [detectedTier, setDetectedTier] = useState<DeviceQualityTier>('default');
  const [detectedReducedMotion, setDetectedReducedMotion] = useState(false);
  const [loadState, setLoadState] =
    useState<OutfitStudioDiagnosticsSnapshot['loadState']>('loading');
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

  const resolvedRigUrl = useMemo(() => {
    if (resolvedTier === 'lite' && rigMobileModelUrl) {
      return rigMobileModelUrl;
    }
    return rigModelUrl;
  }, [resolvedTier, rigMobileModelUrl, rigModelUrl]);

  const handleLoadStateChange = useCallback(
    (nextState: OutfitStudioDiagnosticsSnapshot['loadState'], msg?: string | null) => {
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

  const posterFallback = (
    <div
      data-testid="arven-outfit-studio-fallback"
      className="relative h-full min-h-[360px] w-full overflow-hidden bg-[#17191B]"
    >
      <img
        src={rigPosterUrl}
        alt={`Poster Manekin Standar ${rigId}`}
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 border-t border-[#46494C] bg-[#17191B]/95 p-4">
        <p className="text-sm font-medium text-[#F8F7F3]">
          Tampilan Manekin 3D tidak tersedia saat ini. Mode poster 2D aktif.
        </p>
        {errorMsg ? (
          <p className="mt-1 font-mono text-xs text-[#B2B0A6]">({errorMsg})</p>
        ) : null}
      </div>
    </div>
  );

  if (webglSupported === false || loadState === 'fallback') {
    return posterFallback;
  }

  return (
    <div
      data-testid="arven-outfit-studio-canvas-shell"
      className="relative h-full w-full bg-[#1B1D20]"
    >
      {webglSupported ? (
        <OutfitCanvasErrorBoundary
          onError={handleFallbackTriggered}
          fallback={posterFallback}
        >
          <Canvas
            frameloop="demand"
            dpr={resolvedTier === 'lite' ? [1, 1.5] : [1, 2]}
            shadows={false}
            gl={{
              antialias: true,
              powerPreference: 'high-performance',
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.08,
            }}
            camera={{
              fov: 38,
              position: [0.56, 1.04, 3.28],
              near: 0.05,
              far: 60,
            }}
          >
            <OutfitStudioSceneContent
              rigId={rigId}
              resolvedRigUrl={resolvedRigUrl}
              slots={slots}
              activeTier={resolvedTier}
              reducedMotion={resolvedReducedMotion}
              interactionEnabled={interactionEnabled}
              dracoPath={dracoDecoderPath}
              ktx2Path={ktx2TranscoderPath}
              onSlotLoaded={onSlotLoaded}
              onSlotError={onSlotError}
              onLoadStateChange={handleLoadStateChange}
              onFallbackTriggered={handleFallbackTriggered}
            />
          </Canvas>
        </OutfitCanvasErrorBoundary>
      ) : (
        <div className="flex h-full min-h-[360px] w-full items-center justify-center bg-[#17191B] p-6 text-center">
          <span className="font-mono text-xs uppercase tracking-[0.06em] text-[#B2B0A6]">
            Menginisialisasi Manekin Studio 3D...
          </span>
        </div>
      )}

      {loadState === 'loading' || loadState === 'recovering' ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
          <span className="border border-[#46494C] bg-[#17191B]/90 px-3 py-1.5 font-mono text-xs text-[#F8F7F3]">
            {loadState === 'recovering'
              ? 'Memulihkan tampilan Manekin 3D...'
              : 'Memuat manekin & garmen 3D...'}
          </span>
        </div>
      ) : null}

      {loadState === 'error' ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
          <span className="border border-[#E48966] bg-[#17191B]/95 px-3 py-1.5 font-mono text-xs text-[#F8F7F3]">
            Gagal memuat manekin 3D ({errorMsg ?? 'error'}). Kontrol pemilihan slot tetap aktif.
          </span>
        </div>
      ) : null}
    </div>
  );
}
