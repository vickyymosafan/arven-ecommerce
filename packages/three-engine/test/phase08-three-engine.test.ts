import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  MANNEQUIN_DEFAULT_MAX_TRIANGLES,
  MANNEQUIN_LITE_MAX_TRIANGLES,
  SHOWROOM_ZONE_DEFAULT_MAX_BYTES,
  SHOWROOM_ZONE_LITE_MAX_BYTES,
  buildArvenMannequinGlbBuffer,
  buildArvenShowroomZoneGlbBuffer,
  buildStudioPosterSvg,
  inspectAndValidateGlbBuffer,
  validateGlbBuffer,
} from '../src/glb-binary.js';
import {
  SHOWROOM_MAX_RESIDENT_ZONES,
  ShowroomZoneResidencyManager,
} from '../src/showroom.js';
import {
  OUTFIT_SLOTS,
  OUTFIT_STUDIO_RIG_ID,
  OUTFIT_STUDIO_SKELETON_VERSION,
  OutfitSlotResourceManager,
  acquireSharedStudioEnv,
  evaluateOutfitCompatibility,
  getSharedStudioEnvRefCount,
  releaseSharedStudioEnv,
} from '../src/outfit-studio.js';

function extractGlbJson(glb: Uint8Array): Record<string, unknown> {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const jsonBytes = glb.subarray(20, 20 + jsonLength);
  return JSON.parse(new TextDecoder('utf-8').decode(jsonBytes)) as Record<
    string,
    unknown
  >;
}

describe('Phase 08 Three Engine: GLB Builders, Residency, Disposal & Compatibility', () => {
  it('builds deterministic mannequin GLB with all 6 anchor nodes, Y=0 ground, and triangle caps', () => {
    const defaultGlb = buildArvenMannequinGlbBuffer({ profile: 'default' });
    const liteGlb = buildArvenMannequinGlbBuffer({ profile: 'lite' });

    expect(Buffer.isBuffer(defaultGlb)).toBe(true);
    expect(Buffer.isBuffer(liteGlb)).toBe(true);
    expect(defaultGlb.readUInt32LE(0)).toBe(0x46546c67);
    expect(liteGlb.readUInt32LE(0)).toBe(0x46546c67);

    const defaultValidation = validateGlbBuffer(defaultGlb, { profile: 'default' });
    const liteValidation = inspectAndValidateGlbBuffer(liteGlb, { profile: 'lite' });

    expect(defaultValidation.valid).toBe(true);
    expect(liteValidation.valid).toBe(true);
    expect(defaultValidation.triangleCount).toBeGreaterThan(0);
    expect(defaultValidation.triangleCount).toBeLessThanOrEqual(
      MANNEQUIN_DEFAULT_MAX_TRIANGLES,
    );
    expect(liteValidation.triangleCount).toBeGreaterThan(0);
    expect(liteValidation.triangleCount).toBeLessThanOrEqual(
      MANNEQUIN_LITE_MAX_TRIANGLES,
    );
    expect(liteValidation.triangleCount).toBeLessThan(defaultValidation.triangleCount);
    expect(defaultValidation.boundsMin[1]).toBe(0);
    expect(liteValidation.boundsMin[1]).toBe(0);

    const gltf = extractGlbJson(defaultGlb);
    const nodes = (gltf['nodes'] as Array<{ name?: string }>) ?? [];
    const nodeNames = new Set(nodes.map((n) => n.name));
    for (const anchor of [
      'spine_upper',
      'pelvis',
      'feet',
      'shoulder_left',
      'shoulder_right',
      'wrist_left',
    ]) {
      expect(nodeNames.has(anchor)).toBe(true);
    }

    // Deterministic output across identical calls
    expect(defaultGlb.equals(buildArvenMannequinGlbBuffer({ profile: 'default' }))).toBe(
      true,
    );
  });

  it('builds deterministic showroom zone GLB with baked COLOR_0 attributes and strict byte caps', () => {
    const defaultZone = buildArvenShowroomZoneGlbBuffer({
      code: 'atrium-entrance',
      title: 'Atrium',
      lightingPreset: 'arven_studio_neutral_v1',
      profile: 'default',
      pedestals: [
        { label: 'Tee', position: [-1.8, 0, -1.2] },
        { label: 'Poplin Shirt', position: [1.8, 0, -1.2] },
      ],
      portals: [{ targetZoneCode: 'tailoring-gallery', position: [3.6, 0, -3.5] }],
    });

    const liteZone = buildArvenShowroomZoneGlbBuffer({
      code: 'atrium-entrance',
      title: 'Atrium',
      lightingPreset: 'arven_warm_editorial_v1',
      profile: 'lite',
      portals: [{ targetZoneCode: 'tailoring-gallery', position: [3.6, 0, -3.5] }],
    });

    expect(defaultZone.byteLength).toBeGreaterThan(0);
    expect(defaultZone.byteLength).toBeLessThanOrEqual(SHOWROOM_ZONE_DEFAULT_MAX_BYTES);
    expect(liteZone.byteLength).toBeGreaterThan(0);
    expect(liteZone.byteLength).toBeLessThanOrEqual(SHOWROOM_ZONE_LITE_MAX_BYTES);
    expect(liteZone.byteLength).toBeLessThan(defaultZone.byteLength);

    const defaultCheck = validateGlbBuffer(defaultZone, { profile: 'default' });
    const liteCheck = validateGlbBuffer(liteZone, { profile: 'lite' });
    expect(defaultCheck.valid).toBe(true);
    expect(liteCheck.valid).toBe(true);

    const gltf = extractGlbJson(defaultZone);
    const meshes =
      (gltf['meshes'] as Array<{
        primitives?: Array<{ attributes?: Record<string, number> }>;
      }>) ?? [];
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      for (const prim of mesh.primitives ?? []) {
        expect(typeof prim.attributes?.['COLOR_0']).toBe('number');
        expect(typeof prim.attributes?.['POSITION']).toBe('number');
        expect(typeof prim.attributes?.['NORMAL']).toBe('number');
      }
    }

    const poster = buildStudioPosterSvg({
      title: 'Atrium',
      subtitle: 'Virtual Showroom ARVEN',
    });
    expect(poster).toContain('<svg');
    expect(poster).toContain('Atrium');
  });

  it('enforces max-2-zone residency and disposes evicted zones immediately via ResourceTracker', () => {
    const parent = new THREE.Group();
    const residency = new ShowroomZoneResidencyManager(SHOWROOM_MAX_RESIDENT_ZONES);

    const makeZoneGroup = (name: string) => {
      const group = new THREE.Group();
      group.name = name;
      const geom = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({ color: '#35383A' });
      const mesh = new THREE.Mesh(geom, mat);
      group.add(mesh);
      parent.add(group);
      return { group, geom, mat };
    };

    const z1 = makeZoneGroup('atrium-entrance');
    const z2 = makeZoneGroup('tailoring-gallery');
    const z3 = makeZoneGroup('movement-annex');

    const geomDispose1 = vi.spyOn(z1.geom, 'dispose');
    const matDispose1 = vi.spyOn(z1.mat, 'dispose');

    residency.registerZone('atrium-entrance', z1.group, [
      'atrium-entrance',
      'tailoring-gallery',
    ]);
    residency.registerZone('tailoring-gallery', z2.group, [
      'atrium-entrance',
      'tailoring-gallery',
    ]);
    expect(residency.getResidentCodes()).toEqual([
      'atrium-entrance',
      'tailoring-gallery',
    ]);
    expect(residency.getTotalDisposedCount()).toBe(0);

    // Navigating to movement-annex (portal back to tailoring-gallery) must evict atrium-entrance
    const disposedOnSwitch = residency.registerZone('movement-annex', z3.group, [
      'movement-annex',
      'tailoring-gallery',
    ]);
    expect(disposedOnSwitch).toBeGreaterThanOrEqual(2);
    expect(residency.getResidentCodes()).toHaveLength(2);
    expect(residency.has('atrium-entrance')).toBe(false);
    expect(z1.group.parent).toBeNull();
    expect(geomDispose1).toHaveBeenCalledTimes(1);
    expect(matDispose1).toHaveBeenCalledTimes(1);

    const disposedOnUnmount = residency.disposeAll();
    expect(disposedOnUnmount).toBeGreaterThanOrEqual(4);
    expect(residency.getResidentCodes()).toEqual([]);
  });

  it('manages shared studio environment refcounting and disposes only when refcount reaches 0', () => {
    const envKey = 'test_studio_env_refcount';
    expect(getSharedStudioEnvRefCount(envKey)).toBe(0);

    const first = acquireSharedStudioEnv(envKey);
    expect(first.refCount).toBe(1);
    expect(getSharedStudioEnvRefCount(envKey)).toBe(1);

    const second = acquireSharedStudioEnv(envKey);
    expect(second.refCount).toBe(2);
    expect(getSharedStudioEnvRefCount(envKey)).toBe(2);

    const rel1 = releaseSharedStudioEnv(envKey);
    expect(rel1.refCount).toBe(1);
    expect(rel1.disposed).toBe(false);

    const rel2 = releaseSharedStudioEnv(envKey);
    expect(rel2.refCount).toBe(0);
    expect(rel2.disposed).toBe(true);
    expect(getSharedStudioEnvRefCount(envKey)).toBe(0);
  });

  it('isolates per-slot ResourceTrackers and disposes cleanly across 10 garment swaps', () => {
    const rig = new THREE.Group();
    const spine = new THREE.Group();
    spine.name = 'spine_upper';
    const pelvis = new THREE.Group();
    pelvis.name = 'pelvis';
    rig.add(spine, pelvis);

    const mgr = new OutfitSlotResourceManager();

    // Attach persistent trouser in bottom slot
    const trouserGroup = new THREE.Group();
    const trouserGeom = new THREE.BoxGeometry(0.5, 1, 0.2);
    const trouserMat = new THREE.MeshStandardMaterial({ color: '#17191B' });
    trouserGroup.add(new THREE.Mesh(trouserGeom, trouserMat));
    const trouserGeomDispose = vi.spyOn(trouserGeom, 'dispose');
    mgr.attachSlot('bottom', 'asset-trouser', 'pelvis', trouserGroup, rig);

    // Swap top slot 10 times
    const topDisposals: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const topGroup = new THREE.Group();
      const geom = new THREE.BoxGeometry(0.5, 0.7, 0.2);
      const mat = new THREE.MeshStandardMaterial({ color: '#E9E4DA' });
      topGroup.add(new THREE.Mesh(geom, mat));
      mgr.attachSlot('top', `asset-top-${i}`, 'spine_upper', topGroup, rig);
      topDisposals.push(mgr.getSlotDisposedCount('top'));
    }

    // 9 swaps disposed previous top meshes (2 resources per swap: 1 geom + 1 mat = 18)
    expect(topDisposals[0]).toBe(0);
    expect(topDisposals[9]).toBe(18);
    expect(trouserGeomDispose).not.toHaveBeenCalled();
    expect(mgr.getActiveSlots()).toEqual(['top', 'bottom']);
    expect(spine.children).toHaveLength(1);
    expect(pelvis.children).toHaveLength(1);

    // Clearing top slot disposes top #10 without touching bottom
    const clearedTop = mgr.disposeSlot('top');
    expect(clearedTop).toBe(2);
    expect(spine.children).toHaveLength(0);
    expect(pelvis.children).toHaveLength(1);
    expect(trouserGeomDispose).not.toHaveBeenCalled();

    // Unmount cleanup disposes remaining bottom slot
    const unmountDisposed = mgr.disposeAllSlots();
    expect(unmountDisposed).toBe(2);
    expect(trouserGeomDispose).toHaveBeenCalledTimes(1);
    expect(mgr.getActiveSlots()).toEqual([]);
    expect(OUTFIT_SLOTS).toHaveLength(5);
  });

  it('evaluates Outfit Studio compatibility across valid, symmetric layer conflict, version, slot, anchor, and availability cases', () => {
    const validResult = evaluateOutfitCompatibility({
      rigId: OUTFIT_STUDIO_RIG_ID,
      items: [
        {
          requestedSlot: 'top',
          productId: 'prod-tee',
          compatibility: {
            rigId: OUTFIT_STUDIO_RIG_ID,
            skeletonVersion: OUTFIT_STUDIO_SKELETON_VERSION,
            slot: 'top',
            anchor: 'spine_upper',
            incompatibleSlots: [],
          },
        },
        {
          requestedSlot: 'outerwear',
          productId: 'prod-overshirt',
          compatibility: {
            rigId: OUTFIT_STUDIO_RIG_ID,
            skeletonVersion: OUTFIT_STUDIO_SKELETON_VERSION,
            slot: 'outerwear',
            anchor: 'spine_upper',
            incompatibleSlots: [],
          },
        },
      ],
    });
    expect(validResult.valid).toBe(true);
    expect(validResult.violations).toEqual([]);

    // Symmetric LAYER_CONFLICT regardless of order
    const poplinCompat = {
      rigId: OUTFIT_STUDIO_RIG_ID,
      skeletonVersion: OUTFIT_STUDIO_SKELETON_VERSION,
      slot: 'top' as const,
      anchor: 'spine_upper' as const,
      incompatibleSlots: ['outerwear' as const],
    };
    const overshirtCompat = {
      rigId: OUTFIT_STUDIO_RIG_ID,
      skeletonVersion: OUTFIT_STUDIO_SKELETON_VERSION,
      slot: 'outerwear' as const,
      anchor: 'spine_upper' as const,
      incompatibleSlots: [],
    };

    const conflictOrderA = evaluateOutfitCompatibility({
      rigId: OUTFIT_STUDIO_RIG_ID,
      items: [
        { requestedSlot: 'top', productId: 'prod-poplin', compatibility: poplinCompat },
        {
          requestedSlot: 'outerwear',
          productId: 'prod-overshirt',
          compatibility: overshirtCompat,
        },
      ],
    });
    const conflictOrderB = evaluateOutfitCompatibility({
      rigId: OUTFIT_STUDIO_RIG_ID,
      items: [
        {
          requestedSlot: 'outerwear',
          productId: 'prod-overshirt',
          compatibility: overshirtCompat,
        },
        { requestedSlot: 'top', productId: 'prod-poplin', compatibility: poplinCompat },
      ],
    });

    expect(conflictOrderA.valid).toBe(false);
    expect(conflictOrderB.valid).toBe(false);
    expect(conflictOrderA.violations[0]?.reason).toBe('LAYER_CONFLICT');
    expect(conflictOrderB.violations[0]?.reason).toBe('LAYER_CONFLICT');

    // Skeleton version mismatch (e.g. seeded 0.9.0 field jacket)
    const versionMismatch = evaluateOutfitCompatibility({
      rigId: OUTFIT_STUDIO_RIG_ID,
      items: [
        {
          requestedSlot: 'outerwear',
          productId: 'prod-field-jacket',
          compatibility: {
            rigId: OUTFIT_STUDIO_RIG_ID,
            skeletonVersion: '0.9.0',
            slot: 'outerwear',
            anchor: 'spine_upper',
            incompatibleSlots: [],
          },
        },
      ],
    });
    expect(versionMismatch.valid).toBe(false);
    expect(versionMismatch.violations[0]?.reason).toBe('SKELETON_VERSION_MISMATCH');

    // Slot mismatch (crossbody placed in top), anchor invalid, duplicate slot, unavailable & variant/preset mismatch
    const multiFailure = evaluateOutfitCompatibility({
      rigId: OUTFIT_STUDIO_RIG_ID,
      items: [
        {
          requestedSlot: 'top',
          productId: 'prod-crossbody',
          compatibility: {
            rigId: OUTFIT_STUDIO_RIG_ID,
            skeletonVersion: OUTFIT_STUDIO_SKELETON_VERSION,
            slot: 'accessory',
            anchor: 'shoulder_left',
            incompatibleSlots: [],
          },
        },
        {
          requestedSlot: 'top',
          productId: 'prod-tee',
          compatibility: {
            rigId: OUTFIT_STUDIO_RIG_ID,
            skeletonVersion: OUTFIT_STUDIO_SKELETON_VERSION,
            slot: 'top',
            anchor: 'spine_upper',
            incompatibleSlots: [],
          },
        },
        {
          requestedSlot: 'footwear',
          productId: 'prod-sneaker',
          compatibility: {
            rigId: OUTFIT_STUDIO_RIG_ID,
            skeletonVersion: OUTFIT_STUDIO_SKELETON_VERSION,
            slot: 'footwear',
            anchor: 'spine_upper',
            incompatibleSlots: [],
          },
        },
        {
          requestedSlot: 'bottom',
          productId: 'prod-trouser',
          available: false,
          compatibility: {
            rigId: OUTFIT_STUDIO_RIG_ID,
            skeletonVersion: OUTFIT_STUDIO_SKELETON_VERSION,
            slot: 'bottom',
            anchor: 'pelvis',
            incompatibleSlots: [],
          },
        },
        {
          requestedSlot: 'accessory',
          productId: 'prod-bag',
          presetId: 'preset-invalid',
          presetMatchesAsset: false,
          compatibility: {
            rigId: OUTFIT_STUDIO_RIG_ID,
            skeletonVersion: OUTFIT_STUDIO_SKELETON_VERSION,
            slot: 'accessory',
            anchor: 'shoulder_left',
            incompatibleSlots: [],
          },
        },
      ],
    });
    expect(multiFailure.valid).toBe(false);
    const reasons = multiFailure.violations.map((v) => v.reason);
    expect(reasons).toContain('SLOT_MISMATCH');
    expect(reasons).toContain('DUPLICATE_SLOT');
    expect(reasons).toContain('ANCHOR_INVALID');
    expect(reasons).toContain('GARMENT_UNAVAILABLE');
    expect(reasons).toContain('PRESET_ASSET_MISMATCH');

    const rigMismatch = evaluateOutfitCompatibility({
      rigId: 'arven_mannequin_unknown_v9',
      items: [
        {
          requestedSlot: 'top',
          productId: 'prod-tee',
          compatibility: {
            rigId: OUTFIT_STUDIO_RIG_ID,
            skeletonVersion: OUTFIT_STUDIO_SKELETON_VERSION,
            slot: 'top',
            anchor: 'spine_upper',
            incompatibleSlots: [],
          },
        },
      ],
    });
    expect(rigMismatch.valid).toBe(false);
    expect(rigMismatch.violations.map((v) => v.reason)).toContain('RIG_MISMATCH');
  });
});
