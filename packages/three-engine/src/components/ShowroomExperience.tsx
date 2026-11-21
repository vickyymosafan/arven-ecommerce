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
  ShowroomHotspotPublicDto,
  ShowroomZonePublicDto,
} from '@arven/contracts';
import {
  detectWebGLCapabilities,
  prefersReducedMotion,
  resolveDeviceQualityTier,
  type DeviceQualityTier,
} from '../capabilities.js';
import {
  buildSculptedGarmentParts,
  resolveGarmentStyleVariant,
} from '../geometry/garment-builders.js';
import type { SculptMeshAccumulator } from '../geometry/mesh-sculptor.js';
import { inferSilhouetteFromSlug } from '../glb-binary.js';
import {
  acquireAtelierStudioEnv,
  releaseAtelierStudioEnv,
  upgradeGarmentSceneToAtelierPbr,
  upgradeShowroomZoneToAtelierPbr,
} from '../materials/atelier-pbr-materials.js';
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

function accumulatorToBufferGeometry(acc: SculptMeshAccumulator): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(acc.positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(acc.normals, 3));
  if (acc.uvs.length === (acc.positions.length / 3) * 2) {
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uvs, 2));
  }
  if (acc.colors.length === (acc.positions.length / 3) * 4) {
    geom.setAttribute('color', new THREE.Float32BufferAttribute(acc.colors, 4));
  }
  geom.setIndex(acc.indices);
  geom.computeBoundingSphere();
  return geom;
}

function resolveShowroomProductPalette(
  slug: string,
  silhouette: GarmentSilhouetteInput,
): { readonly primaryHex: string; readonly secondaryHex: string; readonly accentHex: string } {
  const lower = slug.toLowerCase();
  if (lower.includes('field') || lower.includes('jacket')) {
    return { primaryHex: '#4A4841', secondaryHex: '#35342F', accentHex: '#C5A572' };
  }
  if (lower.includes('overshirt') || silhouette === 'overshirt') {
    return { primaryHex: '#1F2225', secondaryHex: '#31353A', accentHex: '#C5A572' };
  }
  if (lower.includes('poplin') || lower.includes('shirt')) {
    return { primaryHex: '#F8F7F3', secondaryHex: '#E9E4DA', accentHex: '#C5A572' };
  }
  if (lower.includes('sneaker')) {
    return { primaryHex: '#F2EEE5', secondaryHex: '#DCD6C9', accentHex: '#C5A572' };
  }
  if (lower.includes('crossbody')) {
    return { primaryHex: '#5E5C54', secondaryHex: '#35383A', accentHex: '#C5A572' };
  }
  if (lower.includes('trouser')) {
    return { primaryHex: '#35383A', secondaryHex: '#282B2E', accentHex: '#C5A572' };
  }
  return { primaryHex: '#1B1E21', secondaryHex: '#2E3236', accentHex: '#C5A572' };
}

/**
 * Builds a complete sculpted 3D exhibition garment + bespoke brushed-bronze museum stand
 * for a Virtual Showroom pedestal, with full procedural PBR textile/leather materials.
 */
function buildShowroomPedestalGarmentExhibit(
  hotspot: ShowroomHotspotPublicDto,
  lite: boolean,
): THREE.Group {
  const silhouette = inferSilhouetteFromSlug(hotspot.productSlug);
  const styleVariant = resolveGarmentStyleVariant(silhouette, hotspot.productSlug);
  const palette = resolveShowroomProductPalette(hotspot.productSlug, silhouette);
  const parts = buildSculptedGarmentParts(silhouette, lite, hotspot.productSlug);

  const exhibitGroup = new THREE.Group();
  exhibitGroup.name = `showroom_exhibit_${hotspot.productSlug}`;

  const garmentGroup = new THREE.Group();

  const bodyMesh = new THREE.Mesh(
    accumulatorToBufferGeometry(parts.body),
    new THREE.MeshStandardMaterial({
      name: 'mat_fabric_primary',
      color: palette.primaryHex,
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.02,
    }),
  );
  bodyMesh.name = 'mesh_garment_body';

  const secondaryMesh = new THREE.Mesh(
    accumulatorToBufferGeometry(parts.secondary),
    new THREE.MeshStandardMaterial({
      name: 'mat_fabric_secondary',
      color: palette.secondaryHex,
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.02,
    }),
  );
  secondaryMesh.name = 'mesh_collar_rib';

  const hardwareMesh = new THREE.Mesh(
    accumulatorToBufferGeometry(parts.hardware),
    new THREE.MeshStandardMaterial({
      name: 'mat_hardware_accent',
      color: palette.accentHex,
      vertexColors: true,
      roughness: 0.3,
      metalness: 0.85,
    }),
  );
  hardwareMesh.name = 'mesh_buttons';

  garmentGroup.add(bodyMesh, secondaryMesh, hardwareMesh);

  // Upgrade to physically based MeshPhysicalMaterial with weave/leather normal & roughness maps
  upgradeGarmentSceneToAtelierPbr(garmentGroup, {
    silhouette,
    productSlug: hotspot.productSlug,
    lite,
  });

  // Orient gently toward the central visitor sightline
  const x = hotspot.position[0];
  const editorialYaw = x < -0.5 ? 0.32 : x > 0.5 ? -0.32 : 0.08;
  garmentGroup.rotation.y = editorialYaw;

  const bronzeStandMat = new THREE.MeshStandardMaterial({
    name: 'mat_pedestal_stand_bronze',
    color: '#C5A572',
    roughness: 0.3,
    metalness: 0.86,
  });

  if (styleVariant === 'sneaker') {
    // Minimalist Leather Sneaker pair displayed at an iconic 3/4 editorial gallery angle
    // on a chamfered dark honed-slate & bronze museum footwear riser block
    const riserMat = new THREE.MeshStandardMaterial({
      name: 'mat_sneaker_riser_slate',
      color: '#1E2023',
      roughness: 0.78,
      metalness: 0.05,
    });
    const riserBlock = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.085, 0.44), riserMat);
    riserBlock.position.set(0, 0.0425, 0);
    const riserTrim = new THREE.Mesh(new THREE.BoxGeometry(0.59, 0.01, 0.45), bronzeStandMat);
    riserTrim.position.set(0, 0.086, 0);
    garmentGroup.scale.setScalar(1.52);
    garmentGroup.rotation.y = editorialYaw + 0.42;
    garmentGroup.position.set(0, 0.091, 0);
    exhibitGroup.add(riserBlock, riserTrim, garmentGroup);
  } else if (styleVariant === 'crossbody') {
    // Structured Calfskin Crossbody sits cleanly upright on the pedestal pad
    // with a slender brushed-bronze museum handbag hook rod supporting the top strap arch
    garmentGroup.scale.setScalar(1.32);
    garmentGroup.rotation.y = editorialYaw - 0.18;
    garmentGroup.position.set(0, 0.01, 0);
    exhibitGroup.add(garmentGroup);

    const baseDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.014, 20), bronzeStandMat);
    baseDisc.position.set(0, 0.007, -0.095);
    const hookRod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.885, 12), bronzeStandMat);
    hookRod.position.set(0, 0.448, -0.095);
    const hookArm = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.115, 10), bronzeStandMat);
    hookArm.rotation.x = Math.PI / 2;
    hookArm.position.set(0, 0.88, -0.042);
    const hookCap = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.022, 12), bronzeStandMat);
    hookCap.rotation.x = Math.PI / 2;
    hookCap.position.set(0, 0.88, 0.015);
    exhibitGroup.add(baseDisc, hookRod, hookArm, hookCap);
  } else if (styleVariant === 'trouser') {
    // Tailored Trouser displayed on an architectural brushed-bronze museum waist stand
    garmentGroup.scale.setScalar(1.0);
    garmentGroup.position.set(0, 0.06, 0);
    exhibitGroup.add(garmentGroup);

    const baseDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.016, 20), bronzeStandMat);
    baseDisc.position.set(0, 0.008, 0);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 1.04, 14), bronzeStandMat);
    pole.position.set(0, 0.52, -0.02);
    const waistBar = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.34, 12), bronzeStandMat);
    waistBar.rotation.z = Math.PI / 2;
    waistBar.rotation.y = editorialYaw;
    waistBar.position.set(0, 1.07, 0);
    exhibitGroup.add(baseDisc, pole, waistBar);
  } else {
    // Tops & Outerwear (Tee, Poplin Shirt, Wool Overshirt, Archive Field Jacket)
    // Poised cleanly on a sleek brushed-bronze couture atelier tailor stand (no floating!)
    const standLiftY = 0.24;
    garmentGroup.scale.setScalar(1.04);
    garmentGroup.position.set(0, standLiftY, 0);
    exhibitGroup.add(garmentGroup);

    const baseDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.135, 0.018, 22), bronzeStandMat);
    baseDisc.position.set(0, 0.009, 0);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 1.15, 14), bronzeStandMat);
    pole.position.set(0, 0.585, 0);
    const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.045, 18), bronzeStandMat);
    finial.position.set(0, 1.16, 0);
    exhibitGroup.add(baseDisc, pole, finial);
  }

  return exhibitGroup;
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
  const { gl, scene, camera, invalidate } = useThree();
  const orbitRef = useRef<OrbitControlsLike | null>(null);
  const residencyRef = useRef<ShowroomZoneResidencyManager | null>(null);
  const exhibitTrackerRef = useRef<ResourceTracker | null>(null);
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
  const [pedestalExhibits, setPedestalExhibits] = useState<
    ReadonlyArray<{ readonly hotspot: ShowroomHotspotPublicDto; readonly group: THREE.Group }>
  >([]);
  const loadStateRef = useRef<ShowroomDiagnosticsSnapshot['loadState']>('loading');

  if (!residencyRef.current) {
    residencyRef.current = new ShowroomZoneResidencyManager(SHOWROOM_MAX_RESIDENT_ZONES);
  }
  if (!exhibitTrackerRef.current) {
    exhibitTrackerRef.current = new ResourceTracker();
  }

  const warm = activeZone.lightingPreset === 'arven_warm_editorial_v1';
  const envKey = warm
    ? 'arven_showroom_gallery_warm_v2'
    : 'arven_showroom_gallery_neutral_v2';

  // Mount ref-counted procedural Gallery PMREM IBL for realistic stone, concrete, brass & fabric shading
  useEffect(() => {
    const env = acquireAtelierStudioEnv(envKey, gl, warm);
    if (env.texture) {
      scene.environment = env.texture;
    }
    invalidate();
    return () => {
      scene.environment = null;
      releaseAtelierStudioEnv(envKey);
    };
  }, [envKey, gl, invalidate, scene, warm]);

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
      const zoneDisposed = residencyRef.current?.getTotalDisposedCount() ?? 0;
      const exhibitDisposed = exhibitTrackerRef.current?.getTotalDisposedCount() ?? 0;
      writeShowroomDiagnostics({
        experience: 'showroom',
        activeZoneCode: activeZone.code,
        residentZoneCodes: residencyRef.current?.getResidentCodes() ?? [],
        activeTier,
        frameloop: 'demand',
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        disposedResources: zoneDisposed + exhibitDisposed,
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
      const durationMs = 340;

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

  // Build & track sculpted 3D pedestal garment exhibits for the active zone,
  // deterministically disposing all previous zone garment GPU resources on zone swap/unmount.
  useEffect(() => {
    const tracker = exhibitTrackerRef.current;
    if (!tracker) return;
    tracker.disposeAll();

    const built = activeZone.hotspots.map((hotspot) => {
      const group = buildShowroomPedestalGarmentExhibit(hotspot, activeTier === 'lite');
      tracker.trackObject3D(group);
      return { hotspot, group };
    });

    setPedestalExhibits(built);
    invalidate();
    const rafId = requestAnimationFrame(() => invalidate());

    return () => {
      cancelAnimationFrame(rafId);
      tracker.disposeAll();
      setPedestalExhibits([]);
    };
  }, [activeTier, activeZone.code, activeZone.hotspots, invalidate]);

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
    const exhibitTracker = exhibitTrackerRef.current;

    return () => {
      cancelActiveGlide();
      exhibitTracker?.disposeAll();
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
          cache: 'no-cache',
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
              // Upgrade gallery travertine, honed concrete floor, bronze, and skylight diffusers
              upgradeShowroomZoneToAtelierPbr(gltf.scene, {
                warm: zone.lightingPreset === 'arven_warm_editorial_v1',
                lite: activeTier === 'lite',
              });
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
        const silhouette = inferSilhouetteFromSlug(hotspot.productSlug);
        const targetY =
          silhouette === 'sneaker'
            ? 1.0
            : silhouette === 'crossbody'
              ? 1.16
              : 1.48;
        const target = new THREE.Vector3(hotspot.position[0], targetY, hotspot.position[2]);
        const viewOffset = new THREE.Vector3(
          hotspot.position[0] < -0.5 ? 0.55 : hotspot.position[0] > 0.5 ? -0.55 : 0.35,
          0.32,
          silhouette === 'sneaker' || silhouette === 'crossbody' ? 1.55 : 2.15,
        );
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

  const bgHex = warm ? '#181614' : '#15171A';

  return (
    <>
      <color attach="background" args={[bgHex]} />
      <fog attach="fog" args={[bgHex, 9.5, 22.0]} />

      {/* Architectural Gallery Lighting: Diffused skylight + directional key + cross-fill */}
      <hemisphereLight
        args={[warm ? '#FFF2E0' : '#F8F7F3', '#23262A', 0.62]}
      />
      <directionalLight
        position={[2.8, 5.2, 3.6]}
        intensity={1.65}
        color={warm ? '#FFECD4' : '#FFFDF8'}
      />
      <directionalLight
        position={[-3.4, 3.6, 2.2]}
        intensity={0.78}
        color="#D8E2EC"
      />
      <directionalLight
        position={[0, 3.4, -4.6]}
        intensity={0.95}
        color="#DFC496"
      />

      {/* Active Architectural Showroom Zone GLB */}
      <group dispose={null}>
        {activeZoneScene ? <primitive object={activeZoneScene} /> : null}
      </group>

      {/* Live Sculpted 3D Garments Exhibited on Pedestals + Museum Pin-Spots + Interactive Rings */}
      {pedestalExhibits.map(({ hotspot, group }) => {
        const selected = selectedHotspotId === hotspot.id;
        const hovered = hoveredHotspotId === hotspot.id;
        const ringColor = selected || hovered ? '#E5C996' : '#C5A572';
        const px = hotspot.position[0];
        const pz = hotspot.position[2];
        const pedestalTopY = 0.878;

        return (
          <group key={hotspot.id} position={[px, pedestalTopY, pz]}>
            {/* Museum gallery overhead spotlight pool illuminating this garment & pedestal */}
            <pointLight
              position={[0, 2.15, 0.55]}
              intensity={selected || hovered ? 3.8 : 2.6}
              distance={5.4}
              decay={1.8}
              color={warm ? '#FFEBD0' : '#FAF6EE'}
            />

            {/* Clickable Sculpted 3D Garment Exhibit */}
            <group
              dispose={null}
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
              <primitive object={group} />
            </group>

            {/* Interactive Brushed-Bronze Museum Pedestal Selection Ring */}
            <mesh
              position={[0, 0.005, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
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
              <ringGeometry args={[0.24, selected || hovered ? 0.3 : 0.275, 36]} />
              <meshBasicMaterial
                color={ringColor}
                transparent
                opacity={selected ? 0.92 : hovered ? 0.82 : 0.42}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}

      {/* Sculpted Architectural Portal Arch Interactive Light Veils */}
      {activeZone.portals.map((portal) => {
        const hovered = hoveredPortalCode === portal.targetZoneCode;
        const px = portal.position[0];
        const py = portal.position[1];
        const pz = portal.position[2];
        const yaw = px > 1.0 ? -0.35 : px < -1.0 ? 0.35 : 0;

        return (
          <group
            key={portal.targetZoneCode}
            position={[px, py + 1.25, pz]}
            rotation={[0, yaw, 0]}
          >
            <mesh
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
              <planeGeometry args={[1.18, 2.38]} />
              <meshBasicMaterial
                color={hovered ? '#E2C693' : '#C5A572'}
                transparent
                opacity={hovered ? 0.24 : 0.08}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}

      <ContactShadows
        key={`showroom-shadow-${activeZone.code}`}
        position={[0, 0.048, -1.25]}
        opacity={0.55}
        scale={10.5}
        blur={2.0}
        far={2.8}
        frames={1}
        resolution={activeTier === 'lite' ? 128 : 256}
        color="#050607"
      />

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
 * immediate `ResourceTracker` disposal, procedural Gallery PMREM IBL, live sculpted 3D
 * garments exhibited on travertine pedestals, and WebGL recovery fallback.
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
        data-testid="arven-showroom-empty"
        className="flex h-full min-h-[300px] w-full items-center justify-center bg-[#17191B] p-6 text-center text-sm text-[#B2B0A6]"
      >
        Belum ada zona ruang pamer aktif yang tersedia.
      </div>
    );
  }

  const posterFallback = (
    <div
      data-testid="arven-showroom-fallback"
      className="relative h-full min-h-[300px] w-full overflow-hidden bg-[#17191B]"
    >
      <img
        src={activeZone.posterUrl}
        alt={`Poster Ruang Pamer ${activeZone.title}`}
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 border-t border-[#46494C] bg-[#17191B]/95 p-4">
        <p className="text-sm font-medium text-[#F8F7F3]">
          Tampilan Ruang Pamer 3D tidak tersedia saat ini. Mode poster 2D aktif.
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
      data-testid="arven-showroom-canvas-shell"
      className="relative h-full w-full bg-[#15171A]"
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
            gl={{
              antialias: true,
              powerPreference: 'high-performance',
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.08,
            }}
            camera={{
              fov: activeZone.cameraBaseline.fovDeg,
              position: activeZone.cameraBaseline.position,
              near: 0.08,
              far: 120,
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
              ? 'Memulihkan tampilan Ruang Pamer 3D...'
              : `Memuat galeri arsitektural ${activeZone.title}...`}
          </span>
        </div>
      ) : null}

      {loadState === 'error' ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
          <span className="border border-[#E48966] bg-[#17191B]/95 px-3 py-1.5 font-mono text-xs text-[#F8F7F3]">
            Gagal memuat zona 3D ({errorMsg ?? 'error'}). Produk tetap dapat diakses di katalog bawah.
          </span>
        </div>
      ) : null}
    </div>
  );
}
