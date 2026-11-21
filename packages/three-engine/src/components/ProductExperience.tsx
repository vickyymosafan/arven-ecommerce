'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type {
  CustomizationPresetDto,
  Product3DAssetConfigDto,
} from '@arven/contracts';
import {
  detectWebGLCapabilities,
  prefersReducedMotion,
  resolveDeviceQualityTier,
  type DeviceQualityTier,
} from '../capabilities.js';
import { inferSilhouetteFromSlug } from '../glb-binary.js';
import {
  applyMaterialPresetToScene,
  type AppliedSlotOutcome,
} from '../material-preset-controller.js';
import {
  acquireAtelierStudioEnv,
  releaseAtelierStudioEnv,
  upgradeGarmentSceneToAtelierPbr,
} from '../materials/atelier-pbr-materials.js';
import { ResourceTracker } from '../resource-tracker.js';
import {
  AccessibleProductControls,
  type CameraPresetKey,
} from './AccessibleProductControls.js';

interface OrbitControlsHandle {
  target: THREE.Vector3;
  update: () => void;
}

export interface Arven3DDiagnosticsSnapshot {
  readonly productId: string;
  readonly assetId: string;
  readonly version: number;
  readonly frameloop: 'demand';
  readonly activeTier: DeviceQualityTier;
  readonly activePresetCode: string | null;
  readonly cameraPreset: CameraPresetKey;
  readonly geometries: number;
  readonly textures: number;
  readonly disposedResources: number;
  readonly appliedSlots: ReadonlyArray<AppliedSlotOutcome>;
  readonly loadState: 'loading' | 'ready' | 'error' | 'recovering' | 'fallback';
  readonly contextLostCount: number;
  readonly reducedMotion: boolean;
  readonly updatedAt: string;
}

declare global {
  interface Window {
    __ARVEN_3D_DIAGNOSTICS__?: Arven3DDiagnosticsSnapshot;
  }
}

export interface ProductExperienceProps {
  readonly productId: string;
  readonly assetId: string;
  readonly version: number;
  readonly productName: string;
  readonly productSlug?: string;
  readonly modelUrl: string;
  readonly mobileModelUrl: string | null;
  readonly posterUrl: string;
  readonly config: Product3DAssetConfigDto;
  readonly presets: ReadonlyArray<CustomizationPresetDto>;
  readonly activePresetId: string | null;
  readonly dracoDecoderPath?: string;
  readonly ktx2TranscoderPath?: string;
  readonly onFallbackTo2D?: (reason: string) => void;
  readonly onTelemetryEvent?: (event: {
    eventType:
      | 'viewer_opened'
      | 'preset_selected'
      | 'camera_preset'
      | 'fallback_triggered'
      | 'load_error'
      | 'context_lost';
    deviceTier: DeviceQualityTier;
    errorCode?: string;
    cameraPreset?: string;
    durationMs?: number;
  }) => void;
}

interface CameraCommandRef {
  applyPreset: (preset: CameraPresetKey) => void;
  rotateBy: (deltaAzimuthRad: number, deltaPolarRad?: number) => void;
  zoomBy: (scaleFactor: number) => void;
}

function getCameraOffsetForPreset(
  preset: CameraPresetKey,
  config: Product3DAssetConfigDto,
): THREE.Vector3 {
  const baseline = config.coordinateSystem.cameraBaseline;
  const basePos = new THREE.Vector3(...baseline.position);
  const target = new THREE.Vector3(...baseline.target);
  const baseDistance = Math.max(0.55, basePos.distanceTo(target));

  if (preset === 'front') {
    return new THREE.Vector3(0, baseDistance * 0.06, baseDistance);
  }
  if (preset === 'back') {
    return new THREE.Vector3(0, baseDistance * 0.06, -baseDistance);
  }
  if (preset === 'side') {
    return new THREE.Vector3(baseDistance * 0.98, baseDistance * 0.08, baseDistance * 0.14);
  }
  if (preset === 'detail') {
    const minDist = Math.max(baseline.minDistance, baseDistance * 0.68);
    return new THREE.Vector3(minDist * 0.36, minDist * 0.22, minDist * 0.9);
  }
  return basePos.sub(target);
}

interface InnerSceneProps {
  readonly productId: string;
  readonly assetId: string;
  readonly version: number;
  readonly productSlugOrName: string;
  readonly resolvedModelUrl: string;
  readonly activeTier: DeviceQualityTier;
  readonly config: Product3DAssetConfigDto;
  readonly activePreset: CustomizationPresetDto | null;
  readonly activeCameraPreset: CameraPresetKey;
  readonly reducedMotion: boolean;
  readonly dracoPath: string;
  readonly ktx2Path: string;
  readonly interactionEnabled: boolean;
  readonly controlsCommandRef: React.MutableRefObject<CameraCommandRef | null>;
  readonly onSceneReady: (outcomes: AppliedSlotOutcome[]) => void;
  readonly onSceneError: (errorCode: string) => void;
  readonly onContextLostCountChange: (count: number, recovering: boolean) => void;
  readonly onFallbackTriggered: (reason: string) => void;
}

function ProductSceneContent({
  productId,
  assetId,
  version,
  productSlugOrName,
  resolvedModelUrl,
  activeTier,
  config,
  activePreset,
  activeCameraPreset,
  reducedMotion,
  dracoPath,
  ktx2Path,
  interactionEnabled,
  controlsCommandRef,
  onSceneReady,
  onSceneError,
  onContextLostCountChange,
  onFallbackTriggered,
}: InnerSceneProps) {
  const { gl, scene, camera, invalidate } = useThree();
  const orbitRef = useRef<OrbitControlsHandle | null>(null);
  const [loadedScene, setLoadedScene] = useState<THREE.Group | null>(null);
  const [sceneRevision, setSceneRevision] = useState(0);
  const trackerRef = useRef<ResourceTracker | null>(null);
  const lastAppliedSlotsRef = useRef<AppliedSlotOutcome[]>([]);
  const contextLossCountRef = useRef(0);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!trackerRef.current) {
    trackerRef.current = new ResourceTracker();
  }

  const lightingWarm = config.lightingPreset === 'arven_warm_editorial_v1';
  const envKey = lightingWarm
    ? 'arven_product_studio_warm_v2'
    : 'arven_product_studio_neutral_v2';

  const resolvedSilhouette = useMemo(
    () => config.silhouette ?? inferSilhouetteFromSlug(productSlugOrName),
    [config.silhouette, productSlugOrName],
  );

  // Mount ref-counted procedural Atelier Studio PMREM IBL (zero CDN dependencies!)
  useEffect(() => {
    const sharedEnv = acquireAtelierStudioEnv(envKey, gl, lightingWarm);
    if (sharedEnv.texture) {
      scene.environment = sharedEnv.texture;
    }
    invalidate();
    return () => {
      scene.environment = null;
      releaseAtelierStudioEnv(envKey);
    };
  }, [envKey, gl, invalidate, lightingWarm, scene]);

  const updateDiagnostics = useCallback(
    (
      loadState: Arven3DDiagnosticsSnapshot['loadState'],
      appliedSlots: ReadonlyArray<AppliedSlotOutcome> = lastAppliedSlotsRef.current,
    ) => {
      if (typeof window === 'undefined') return;
      const tracker = trackerRef.current;
      window.__ARVEN_3D_DIAGNOSTICS__ = {
        productId,
        assetId,
        version,
        frameloop: 'demand',
        activeTier,
        activePresetCode: activePreset?.code ?? null,
        cameraPreset: activeCameraPreset,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        disposedResources: tracker?.getTotalDisposedCount() ?? 0,
        appliedSlots,
        loadState,
        contextLostCount: contextLossCountRef.current,
        reducedMotion,
        updatedAt: new Date().toISOString(),
      };
    },
    [
      activeCameraPreset,
      activePreset?.code,
      activeTier,
      assetId,
      gl,
      productId,
      reducedMotion,
      version,
    ],
  );

  // Bind WebGL context loss / restoration recovery
  useEffect(() => {
    const canvasEl = gl.domElement;
    const handleLost = (event: Event) => {
      event.preventDefault();
      contextLossCountRef.current += 1;
      onContextLostCountChange(contextLossCountRef.current, true);
      updateDiagnostics('recovering');

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
      onContextLostCountChange(contextLossCountRef.current, false);
      updateDiagnostics('ready');
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
  }, [gl, invalidate, onContextLostCountChange, onFallbackTriggered, updateDiagnostics]);

  // Load & parse GLB via self-hosted decoders, upgrade to MeshPhysicalMaterial PBR weave/leather,
  // and track every geometry, material & procedural texture cleanly for deterministic disposal.
  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(dracoPath);

    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath(ktx2Path);
    ktx2Loader.detectSupport(gl);

    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);
    gltfLoader.setKTX2Loader(ktx2Loader);
    gltfLoader.setMeshoptDecoder(MeshoptDecoder);

    const loadBinary = async () => {
      try {
        updateDiagnostics('loading');
        const response = await fetch(resolvedModelUrl, {
          signal: abortController.signal,
          cache: 'no-cache',
        });
        if (!response.ok) {
          throw new Error(`HTTP_${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        if (cancelled) return;

        gltfLoader.parse(
          buffer,
          '',
          (gltf) => {
            if (cancelled) {
              const tempTracker = new ResourceTracker();
              tempTracker.trackObject3D(gltf.scene);
              tempTracker.disposeAll();
              return;
            }
            // Dispose any previous model before binding new scene
            trackerRef.current?.disposeAll();

            // Upgrade baseline glTF materials to calibrated MeshPhysicalMaterial PBR fabric/leather
            upgradeGarmentSceneToAtelierPbr(gltf.scene, {
              silhouette: resolvedSilhouette,
              productSlug: productSlugOrName,
              lite: activeTier === 'lite',
            });

            // Track all geometries, upgraded physical materials, and procedural PBR DataTextures
            trackerRef.current?.trackObject3D(gltf.scene);

            const outcomes = applyMaterialPresetToScene(
              gltf.scene,
              config.materialSlots,
              activePreset?.materialOverrides ?? null,
            );
            lastAppliedSlotsRef.current = outcomes;
            setLoadedScene(gltf.scene);
            setSceneRevision((rev) => rev + 1);
            updateDiagnostics('ready', outcomes);
            onSceneReady(outcomes);
            invalidate();
            requestAnimationFrame(() => invalidate());
          },
          (parseError) => {
            if (cancelled) return;
            const code =
              parseError instanceof Error ? parseError.message : 'gltf_parse_failed';
            updateDiagnostics('error');
            onSceneError(code);
          },
        );
      } catch (err) {
        if (cancelled || abortController.signal.aborted) return;
        const code = err instanceof Error ? err.message : 'gltf_network_failed';
        updateDiagnostics('error');
        onSceneError(code);
      }
    };

    void loadBinary();

    return () => {
      cancelled = true;
      abortController.abort();
      trackerRef.current?.disposeAll();
      dracoLoader.dispose();
      ktx2Loader.dispose();
      updateDiagnostics('fallback', []);
    };
  }, [resolvedModelUrl, gl, dracoPath, ktx2Path, resolvedSilhouette, productSlugOrName, activeTier]);

  // Apply customization presets deterministically without re-fetching geometry
  useEffect(() => {
    if (!loadedScene) return;
    const outcomes = applyMaterialPresetToScene(
      loadedScene,
      config.materialSlots,
      activePreset?.materialOverrides ?? null,
    );
    lastAppliedSlotsRef.current = outcomes;
    updateDiagnostics('ready', outcomes);
    onSceneReady(outcomes);
    invalidate();
    const rafId = requestAnimationFrame(() => invalidate());
    return () => cancelAnimationFrame(rafId);
  }, [activePreset, config.materialSlots, invalidate, loadedScene, onSceneReady, updateDiagnostics]);

  // Bind deterministic camera presets and step commands
  const applyCameraPreset = useCallback(
    (preset: CameraPresetKey) => {
      const target = new THREE.Vector3(...config.coordinateSystem.cameraBaseline.target);
      const offset = getCameraOffsetForPreset(preset, config);
      camera.position.copy(target).add(offset);
      camera.lookAt(target);
      if (orbitRef.current) {
        orbitRef.current.target.copy(target);
        orbitRef.current.update();
      }
      updateDiagnostics(loadedScene ? 'ready' : 'loading');
      invalidate();
    },
    [camera, config, invalidate, loadedScene, updateDiagnostics],
  );

  useEffect(() => {
    controlsCommandRef.current = {
      applyPreset: applyCameraPreset,
      rotateBy: (deltaAzimuthRad: number, deltaPolarRad = 0) => {
        const target =
          orbitRef.current?.target.clone() ??
          new THREE.Vector3(...config.coordinateSystem.cameraBaseline.target);
        const offset = camera.position.clone().sub(target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        spherical.theta += deltaAzimuthRad;
        spherical.phi = Math.max(
          0.32,
          Math.min(Math.PI * 0.49, spherical.phi + deltaPolarRad),
        );
        offset.setFromSpherical(spherical);
        camera.position.copy(target).add(offset);
        camera.lookAt(target);
        orbitRef.current?.update();
        invalidate();
      },
      zoomBy: (scaleFactor: number) => {
        const target =
          orbitRef.current?.target.clone() ??
          new THREE.Vector3(...config.coordinateSystem.cameraBaseline.target);
        const minDistance = config.coordinateSystem.cameraBaseline.minDistance;
        const maxDistance = config.coordinateSystem.cameraBaseline.maxDistance;
        const offset = camera.position.clone().sub(target);
        const currentDist = offset.length();
        const nextDist = Math.max(minDistance, Math.min(maxDistance, currentDist * scaleFactor));
        offset.normalize().multiplyScalar(nextDist);
        camera.position.copy(target).add(offset);
        camera.lookAt(target);
        orbitRef.current?.update();
        invalidate();
      },
    };
  }, [applyCameraPreset, camera, config, controlsCommandRef, invalidate]);

  const plinthRadius =
    resolvedSilhouette === 'sneaker'
      ? 0.32
      : resolvedSilhouette === 'crossbody'
        ? 0.28
        : 0.46;

  return (
    <>
      <color attach="background" args={['#1B1D20']} />
      <fog attach="fog" args={['#1B1D20', 4.5, 11.5]} />

      {/* Calibrated 3-point fashion photography studio lighting rig */}
      <hemisphereLight
        args={[lightingWarm ? '#FFF3E4' : '#FAF8F3', '#232629', 0.58]}
      />
      {/* Key studio softbox light (front-right elevated) */}
      <directionalLight
        position={[2.4, 3.4, 2.8]}
        intensity={1.9}
        color={lightingWarm ? '#FFEED8' : '#FFFDF8'}
      />
      {/* Cool architectural fill light (front-left) */}
      <directionalLight
        position={[-2.6, 2.0, 1.4]}
        intensity={0.85}
        color="#DDE6F0"
      />
      {/* Warm Atelier Gold / bronze rim backlight (separates dark Charcoal/Obsidian garments crisply) */}
      <directionalLight
        position={[-0.6, 2.1, -3.0]}
        intensity={1.35}
        color="#DFC496"
      />
      <directionalLight
        position={[1.4, 1.4, -2.6]}
        intensity={0.75}
        color="#EFE6D6"
      />

      {/* Sculpted editorial exhibition studio plinth beneath Y = 0 */}
      <group position={[0, -0.018, 0]}>
        <mesh receiveShadow>
          <cylinderGeometry args={[plinthRadius, plinthRadius * 1.03, 0.032, 48]} />
          <meshStandardMaterial color="#1D1F22" roughness={0.86} metalness={0.02} />
        </mesh>
        <mesh position={[0, 0.0175, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[plinthRadius - 0.014, plinthRadius, 48]} />
          <meshStandardMaterial color="#C5A572" roughness={0.28} metalness={0.86} />
        </mesh>
      </group>

      {loadedScene ? <primitive object={loadedScene} /> : null}

      <ContactShadows
        key={`product-shadow-${sceneRevision}`}
        position={[0, -0.001, 0]}
        opacity={0.76}
        scale={plinthRadius * 3.8}
        blur={1.8}
        far={1.5}
        frames={1}
        resolution={activeTier === 'lite' ? 128 : 256}
        color="#070809"
      />

      <OrbitControls
        ref={orbitRef as never}
        makeDefault
        enabled={interactionEnabled}
        enablePan={false}
        enableDamping={!reducedMotion}
        dampingFactor={0.08}
        minDistance={config.coordinateSystem.cameraBaseline.minDistance}
        maxDistance={config.coordinateSystem.cameraBaseline.maxDistance}
        minPolarAngle={0.28}
        maxPolarAngle={Math.PI * 0.49}
        target={config.coordinateSystem.cameraBaseline.target}
      />
    </>
  );
}

export function ProductExperience({
  productId,
  assetId,
  version,
  productName,
  productSlug,
  modelUrl,
  mobileModelUrl,
  posterUrl,
  config,
  presets,
  activePresetId,
  dracoDecoderPath = '/decoders/draco/',
  ktx2TranscoderPath = '/decoders/basis/',
  onFallbackTo2D,
  onTelemetryEvent,
}: ProductExperienceProps) {
  const [webglReady, setWebglReady] = useState<boolean | null>(null);
  const [activeTier, setActiveTier] = useState<DeviceQualityTier>('default');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [touchOrbitActive, setTouchOrbitActive] = useState(false);
  const [activeCameraPreset, setActiveCameraPreset] =
    useState<CameraPresetKey>('three_quarter');
  const [loadState, setLoadState] = useState<
    'loading' | 'ready' | 'error' | 'recovering' | 'fallback'
  >('loading');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const controlsCommandRef = useRef<CameraCommandRef | null>(null);

  useEffect(() => {
    const cap = detectWebGLCapabilities();
    const tier = resolveDeviceQualityTier();
    const reduced = prefersReducedMotion();
    const mobile = typeof window !== 'undefined' && window.innerWidth < 768;

    setWebglReady(cap.supported);
    setActiveTier(tier);
    setReducedMotion(reduced);
    setIsMobileViewport(mobile);

    if (!cap.supported) {
      setLoadState('fallback');
      setErrorCode(cap.reason ?? 'webgl_unavailable');
      onTelemetryEvent?.({
        eventType: 'fallback_triggered',
        deviceTier: tier,
        errorCode: cap.reason ?? 'webgl_unavailable',
      });
      onFallbackTo2D?.(cap.reason ?? 'webgl_unavailable');
    } else {
      onTelemetryEvent?.({
        eventType: 'viewer_opened',
        deviceTier: tier,
      });
    }
  }, [onFallbackTo2D, onTelemetryEvent]);

  const activePreset = useMemo(() => {
    if (!activePresetId) {
      return presets[0] ?? null;
    }
    return presets.find((p) => p.id === activePresetId) ?? presets[0] ?? null;
  }, [activePresetId, presets]);

  const resolvedModelUrl = useMemo(() => {
    const base =
      activeTier === 'lite' && mobileModelUrl ? mobileModelUrl : modelUrl;
    if (reloadNonce === 0) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}retry=${reloadNonce}`;
  }, [activeTier, mobileModelUrl, modelUrl, reloadNonce]);

  const handleSelectCameraPreset = useCallback(
    (preset: CameraPresetKey) => {
      setActiveCameraPreset(preset);
      controlsCommandRef.current?.applyPreset(preset);
      setLiveAnnouncement(`Sudut kamera ${preset.replace('_', ' ')} diaktifkan.`);
      onTelemetryEvent?.({
        eventType: 'camera_preset',
        deviceTier: activeTier,
        cameraPreset: preset,
      });
    },
    [activeTier, onTelemetryEvent],
  );

  const handleRotateLeft = useCallback(() => {
    controlsCommandRef.current?.rotateBy(-Math.PI / 4);
    setLiveAnnouncement('Model diputar ke kiri 45 derajat.');
  }, []);

  const handleRotateRight = useCallback(() => {
    controlsCommandRef.current?.rotateBy(Math.PI / 4);
    setLiveAnnouncement('Model diputar ke kanan 45 derajat.');
  }, []);

  const handleZoomIn = useCallback(() => {
    controlsCommandRef.current?.zoomBy(0.84);
    setLiveAnnouncement('Model 3D diperbesar.');
  }, []);

  const handleZoomOut = useCallback(() => {
    controlsCommandRef.current?.zoomBy(1.18);
    setLiveAnnouncement('Model 3D diperkecil.');
  }, []);

  const handleResetCamera = useCallback(() => {
    setActiveCameraPreset('three_quarter');
    controlsCommandRef.current?.applyPreset('three_quarter');
    setLiveAnnouncement('Tampilan kamera 3D direset ke posisi default.');
  }, []);

  const handleCanvasKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        controlsCommandRef.current?.rotateBy(-Math.PI / 12);
        setLiveAnnouncement('Model diputar ke kiri.');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        controlsCommandRef.current?.rotateBy(Math.PI / 12);
        setLiveAnnouncement('Model diputar ke kanan.');
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        controlsCommandRef.current?.rotateBy(0, -0.12);
        setLiveAnnouncement('Model dimiringkan ke atas.');
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        controlsCommandRef.current?.rotateBy(0, 0.12);
        setLiveAnnouncement('Model dimiringkan ke bawah.');
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        handleZoomIn();
      } else if (event.key === '-') {
        event.preventDefault();
        handleZoomOut();
      } else if (event.key === 'Home' || event.key === 'r' || event.key === 'R') {
        event.preventDefault();
        handleResetCamera();
      }
    },
    [handleResetCamera, handleZoomIn, handleZoomOut],
  );

  const handleSceneReady = useCallback(() => {
    setLoadState('ready');
    setErrorCode(null);
  }, []);

  const handleSceneError = useCallback(
    (code: string) => {
      setLoadState('error');
      setErrorCode(code);
      onTelemetryEvent?.({
        eventType: 'load_error',
        deviceTier: activeTier,
        errorCode: code,
      });
    },
    [activeTier, onTelemetryEvent],
  );

  const handleContextLostCountChange = useCallback(
    (_count: number, recovering: boolean) => {
      if (recovering) {
        setLoadState('recovering');
        setLiveAnnouncement('Memulihkan tampilan 3D...');
        onTelemetryEvent?.({
          eventType: 'context_lost',
          deviceTier: activeTier,
        });
      } else {
        setLoadState('ready');
        setLiveAnnouncement('Tampilan 3D berhasil dipulihkan.');
      }
    },
    [activeTier, onTelemetryEvent],
  );

  const handleFallbackTriggered = useCallback(
    (reason: string) => {
      setLoadState('fallback');
      setErrorCode(reason);
      onTelemetryEvent?.({
        eventType: 'fallback_triggered',
        deviceTier: activeTier,
        errorCode: reason,
      });
      onFallbackTo2D?.(reason);
    },
    [activeTier, onFallbackTo2D, onTelemetryEvent],
  );

  if (webglReady === false || loadState === 'fallback' || loadState === 'error') {
    return (
      <div
        data-theme="dark"
        className="overflow-hidden border border-[#35383A] bg-[#17191B] text-[#F8F7F3]"
        data-testid="arven-3d-fallback"
      >
        <div className="relative aspect-[3/4] w-full bg-[#17191B]">
          <img
            src={posterUrl}
            alt={`${productName} tampilan studio 2D`}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 border-t border-[#46494C] bg-[#17191B]/95 p-4 space-y-2">
            <p className="text-sm font-medium text-[#F8F7F3]">
              {loadState === 'error'
                ? 'Model 3D tidak dapat dimuat saat ini.'
                : 'Mode 2D Studio aktif (WebGL tidak tersedia pada perangkat ini).'}
            </p>
            <p className="font-mono text-xs text-[#B2B0A6]">
              Pemilihan varian warna, ukuran, dan Tambah ke Tas tetap berfungsi penuh.
              {errorCode ? ` (${errorCode})` : ''}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const cap = detectWebGLCapabilities();
                  setWebglReady(cap.supported);
                  if (cap.supported) {
                    setErrorCode(null);
                    setLoadState('loading');
                    setReloadNonce((n) => n + 1);
                  } else {
                    onFallbackTo2D?.('webgl_unavailable');
                  }
                }}
                className="inline-flex min-h-11 items-center justify-center border border-[#C5A572] bg-[#35383A] px-4 text-xs font-medium text-[#F8F7F3] transition-[background-color,border-color,color] hover:bg-[#46494C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] cursor-pointer"
              >
                Muat Ulang Model 3D
              </button>
              {onFallbackTo2D ? (
                <button
                  type="button"
                  onClick={() => onFallbackTo2D('user_switched_to_2d')}
                  className="inline-flex min-h-11 items-center justify-center border border-[#9E9C92] bg-[#17191B] px-4 text-xs font-medium text-[#F8F7F3] transition-[background-color,border-color,color] hover:bg-[#35383A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#82B0DC] cursor-pointer"
                >
                  Kembali ke Foto 2D
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const interactionEnabled = !isMobileViewport || touchOrbitActive;

  return (
    <div
      data-theme="dark"
      className="overflow-hidden border border-[#35383A] bg-[#17191B] text-[#F8F7F3]"
      data-testid="arven-3d-experience"
    >
      <div
        role="region"
        tabIndex={0}
        aria-label={`Penampil 3D interaktif ${productName}. Gunakan tombol panah untuk memutar model, tanda plus atau minus untuk zoom, dan Home untuk reset kamera.`}
        onKeyDown={handleCanvasKeyDown}
        style={{
          touchAction: isMobileViewport && !touchOrbitActive ? 'pan-y' : 'none',
        }}
        className="relative aspect-[3/4] w-full bg-[#1B1D20] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#82B0DC] after:pointer-events-none after:absolute after:inset-0 after:z-20 focus-visible:after:border-2 focus-visible:after:border-[#82B0DC]"
      >
        {webglReady ? (
          <Canvas
            frameloop="demand"
            dpr={activeTier === 'lite' ? [1, 1.5] : [1, 2]}
            shadows={false}
            gl={{
              antialias: true,
              powerPreference: 'high-performance',
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.08,
            }}
            camera={{
              fov: config.coordinateSystem.cameraBaseline.fovDeg,
              position: config.coordinateSystem.cameraBaseline.position,
              near: 0.05,
              far: 100,
            }}
          >
            <ProductSceneContent
              productId={productId}
              assetId={assetId}
              version={version}
              productSlugOrName={productSlug ?? productName}
              resolvedModelUrl={resolvedModelUrl}
              activeTier={activeTier}
              config={config}
              activePreset={activePreset}
              activeCameraPreset={activeCameraPreset}
              reducedMotion={reducedMotion}
              dracoPath={dracoDecoderPath}
              ktx2Path={ktx2TranscoderPath}
              interactionEnabled={interactionEnabled}
              controlsCommandRef={controlsCommandRef}
              onSceneReady={handleSceneReady}
              onSceneError={handleSceneError}
              onContextLostCountChange={handleContextLostCountChange}
              onFallbackTriggered={handleFallbackTriggered}
            />
          </Canvas>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#17191B] p-6 text-center">
            <span className="font-mono text-xs uppercase tracking-[0.06em] text-[#B2B0A6]">
              Menginisialisasi Kanvas 3D...
            </span>
          </div>
        )}

        {loadState === 'loading' || loadState === 'recovering' ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
            <span className="border border-[#46494C] bg-[#17191B]/90 px-3 py-1.5 font-mono text-xs text-[#F8F7F3]">
              {loadState === 'recovering'
                ? 'Memulihkan tampilan 3D...'
                : 'Memuat geometri studio 3D...'}
            </span>
          </div>
        ) : null}

        <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-2">
          <span className="border border-[#46494C] bg-[#17191B]/90 px-2.5 py-1 font-mono text-xs tabular-nums text-[#C5A572]">
            3D ATELIER · v{String(version).padStart(4, '0')}
          </span>
          {activePreset ? (
            <span className="border border-[#46494C] bg-[#17191B]/90 px-2.5 py-1 font-mono text-xs text-[#F8F7F3]">
              {activePreset.label}
            </span>
          ) : null}
        </div>
      </div>

      <AccessibleProductControls
        activeCameraPreset={activeCameraPreset}
        onSelectCameraPreset={handleSelectCameraPreset}
        onRotateLeft={handleRotateLeft}
        onRotateRight={handleRotateRight}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetCamera={handleResetCamera}
        activeTier={activeTier}
        isMobileViewport={isMobileViewport}
        touchOrbitActive={touchOrbitActive}
        onToggleTouchOrbit={() => {
          setTouchOrbitActive((prev) => {
            const next = !prev;
            setLiveAnnouncement(
              next
                ? 'Mode putar 3D diaktifkan. Sentuh dan seret untuk memutar model.'
                : 'Mode gulir halaman diaktifkan kembali.',
            );
            return next;
          });
        }}
        reducedMotion={reducedMotion}
        liveAnnouncement={liveAnnouncement}
      />
    </div>
  );
}
