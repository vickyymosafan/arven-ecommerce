import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ARVEN_MATERIAL_SLOTS,
  ResourceTracker,
  applyMaterialPresetToScene,
  buildArvenGarmentGlbBuffer,
  disposeSceneGraph,
  inspectAndValidateGlbBuffer,
  upgradeGarmentSceneToAtelierPbr,
} from '../src/index.js';

describe('ARVEN Three Engine GLB, Presets & Resource Disposal', () => {
  it('builds a valid GLB 2.0 binary passing Threat T-06 validation and slot checks', () => {
    const glbBytes = buildArvenGarmentGlbBuffer({
      silhouette: 'overshirt',
      primaryHex: '#1D1E20',
      secondaryHex: '#5E5C54',
      accentHex: '#C5A572',
      profile: 'default',
    });

    const validation = inspectAndValidateGlbBuffer(glbBytes, {
      profile: 'default',
      expectedMaterialSlots: DEFAULT_ARVEN_MATERIAL_SLOTS,
    });

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.triangleCount).toBeGreaterThan(0);
    expect(validation.materialNames).toEqual([
      'mat_fabric_primary',
      'mat_fabric_secondary',
      'mat_hardware_accent',
    ]);
    expect(validation.meshNames).toEqual([
      'mesh_garment_body',
      'mesh_collar_rib',
      'mesh_buttons',
    ]);
  });

  it('rejects malformed GLB headers, HTML polyglots, SSRF URIs, and missing slots', () => {
    const htmlPayload = new TextEncoder().encode('<!DOCTYPE html><script>alert(1)</script>');
    const htmlResult = inspectAndValidateGlbBuffer(htmlPayload);
    expect(htmlResult.valid).toBe(false);
    expect(htmlResult.errors.some((e) => e.toLowerCase().includes('polyglot') || e.toLowerCase().includes('magic'))).toBe(true);

    const ssrfJson = JSON.stringify({
      asset: { version: '2.0' },
      buffers: [{ uri: 'http://169.254.169.254/latest/meta-data/', byteLength: 16 }],
      meshes: [{ name: 'mesh_garment_body', primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [{ count: 3 }],
      materials: [{ name: 'mat_fabric_primary' }],
    });
    const jsonBytes = new TextEncoder().encode(ssrfJson);
    const alignedLen = Math.ceil(jsonBytes.length / 4) * 4;
    const totalLen = 20 + alignedLen;
    const ssrfGlb = new Uint8Array(totalLen);
    const view = new DataView(ssrfGlb.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, totalLen, true);
    view.setUint32(12, alignedLen, true);
    view.setUint32(16, 0x4e4f534a, true);
    ssrfGlb.set(jsonBytes, 20);
    for (let i = 20 + jsonBytes.length; i < totalLen; i += 1) {
      ssrfGlb[i] = 0x20;
    }

    const ssrfResult = inspectAndValidateGlbBuffer(ssrfGlb, {
      expectedMaterialSlots: DEFAULT_ARVEN_MATERIAL_SLOTS,
    });
    expect(ssrfResult.valid).toBe(false);
    expect(ssrfResult.errors.some((e) => e.includes('External/script buffer URI rejected'))).toBe(true);
    expect(ssrfResult.errors.some((e) => e.includes('mat_hardware_accent'))).toBe(true);
  });

  it('applies material presets only to customizable slots and disposes GPU resources cleanly', () => {
    const group = new THREE.Group();
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const primaryMat = new THREE.MeshStandardMaterial({
      name: 'mat_fabric_primary',
      color: '#17191B',
      roughness: 0.85,
    });
    const hardwareMat = new THREE.MeshStandardMaterial({
      name: 'mat_hardware_accent',
      color: '#C5A572',
      metalness: 0.72,
    });
    const meshA = new THREE.Mesh(geom, primaryMat);
    meshA.name = 'mesh_garment_body';
    const meshB = new THREE.Mesh(geom, hardwareMat);
    meshB.name = 'mesh_buttons';
    group.add(meshA, meshB);

    const outcomes = applyMaterialPresetToScene(group, [...DEFAULT_ARVEN_MATERIAL_SLOTS], {
      mat_fabric_primary: {
        baseColorHex: '#F8F7F3',
        roughness: 0.9,
      },
      mat_hardware_accent: {
        baseColorHex: '#FF00FF', // non-customizable slot must be ignored
      },
    });

    expect(outcomes).toHaveLength(2);
    expect(primaryMat.color.getHexString().toUpperCase()).toBe('F8F7F3');
    expect(primaryMat.roughness).toBe(0.9);
    expect(hardwareMat.color.getHexString().toUpperCase()).not.toBe('FF00FF');

    const tracker = new ResourceTracker();
    tracker.trackObject3D(group);
    const summary = tracker.disposeAll();
    expect(summary.geometriesDisposed).toBe(1);
    expect(summary.materialsDisposed).toBe(2);
    expect(summary.totalDisposed).toBe(3);

    const emptySummary = disposeSceneGraph(group);
    expect(emptySummary.geometriesDisposed).toBe(1);
  });

  it('builds distinct sculpted UV-mapped glTF 2.0 binaries for all 7 ARVEN garments within LOD budgets', () => {
    const cases: ReadonlyArray<{
      readonly silhouette: 'tee' | 'shirt' | 'trouser' | 'overshirt' | 'sneaker' | 'crossbody';
      readonly slug: string;
    }> = [
      { silhouette: 'tee', slug: 'essentials-heavyweight-crew-tee' },
      { silhouette: 'shirt', slug: 'atelier-oversized-poplin-shirt' },
      { silhouette: 'trouser', slug: 'form-wide-leg-tailored-trouser' },
      { silhouette: 'overshirt', slug: 'atelier-boxy-wool-overshirt' },
      { silhouette: 'overshirt', slug: 'atelier-archive-field-jacket' },
      { silhouette: 'sneaker', slug: 'movement-minimalist-leather-sneaker' },
      { silhouette: 'crossbody', slug: 'form-structured-calfskin-crossbody' },
    ];

    for (const item of cases) {
      const defBytes = buildArvenGarmentGlbBuffer({
        silhouette: item.silhouette,
        productSlug: item.slug,
        profile: 'default',
      });
      const liteBytes = buildArvenGarmentGlbBuffer({
        silhouette: item.silhouette,
        productSlug: item.slug,
        profile: 'lite',
      });

      const defReport = inspectAndValidateGlbBuffer(defBytes, {
        profile: 'default',
        expectedMaterialSlots: DEFAULT_ARVEN_MATERIAL_SLOTS,
      });
      const liteReport = inspectAndValidateGlbBuffer(liteBytes, {
        profile: 'lite',
        expectedMaterialSlots: DEFAULT_ARVEN_MATERIAL_SLOTS,
      });

      expect(defReport.valid).toBe(true);
      expect(liteReport.valid).toBe(true);
      expect(defReport.triangleCount).toBeGreaterThan(800);
      expect(liteReport.triangleCount).toBeLessThan(defReport.triangleCount);

      // Verify TEXCOORD_0 and COLOR_0 are embedded inside glTF JSON
      const view = new DataView(defBytes.buffer, defBytes.byteOffset, defBytes.byteLength);
      const jsonLen = view.getUint32(12, true);
      const gltf = JSON.parse(
        new TextDecoder('utf-8').decode(defBytes.subarray(20, 20 + jsonLen)),
      ) as {
        meshes: Array<{ primitives: Array<{ attributes: Record<string, number> }> }>;
      };
      for (const mesh of gltf.meshes) {
        for (const prim of mesh.primitives) {
          expect(typeof prim.attributes['TEXCOORD_0']).toBe('number');
          expect(typeof prim.attributes['COLOR_0']).toBe('number');
        }
      }
    }
  });

  it('upgrades garment materials to MeshPhysicalMaterial with procedural PBR textures and disposes cleanly', () => {
    const group = new THREE.Group();
    const geom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const bodyMesh = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({ name: 'mat_fabric_primary', color: '#1D1E20' }),
    );
    bodyMesh.name = 'mesh_garment_body';
    const buttonMesh = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({ name: 'mat_hardware_accent', color: '#C5A572' }),
    );
    buttonMesh.name = 'mesh_buttons';
    group.add(bodyMesh, buttonMesh);

    upgradeGarmentSceneToAtelierPbr(group, {
      silhouette: 'overshirt',
      productSlug: 'atelier-boxy-wool-overshirt',
      lite: true,
    });

    expect(bodyMesh.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    const physBody = bodyMesh.material as THREE.MeshPhysicalMaterial;
    expect(physBody.normalMap).toBeInstanceOf(THREE.DataTexture);
    expect(physBody.roughnessMap).toBeInstanceOf(THREE.DataTexture);
    expect(physBody.sheen).toBeGreaterThan(0.5);

    const tracker = new ResourceTracker();
    tracker.trackObject3D(group);
    const summary = tracker.disposeAll();
    expect(summary.texturesDisposed).toBe(4);
    expect(summary.materialsDisposed).toBe(2);
    expect(summary.geometriesDisposed).toBe(1);
  });
});
