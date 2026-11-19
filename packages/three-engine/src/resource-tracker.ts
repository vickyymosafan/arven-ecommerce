import * as THREE from 'three';

const TEXTURE_KEYS = [
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'lightMap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
] as const;

export interface ResourceDisposalSummary {
  readonly geometriesDisposed: number;
  readonly materialsDisposed: number;
  readonly texturesDisposed: number;
  readonly totalDisposed: number;
}

/**
 * Tracks GPU geometries, materials, and textures created for a 3D experience and
 * disposes them deterministically on unmount or model/asset replacement.
 */
export class ResourceTracker {
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textures = new Set<THREE.Texture>();
  private totalDisposed = 0;

  trackObject3D(root: THREE.Object3D): void {
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
        if (obj.geometry instanceof THREE.BufferGeometry) {
          this.geometries.add(obj.geometry);
        }
        const matOrList = obj.material;
        const mats = Array.isArray(matOrList) ? matOrList : matOrList ? [matOrList] : [];
        for (const mat of mats) {
          if (mat instanceof THREE.Material) {
            this.materials.add(mat);
            this.trackMaterialTextures(mat);
          }
        }
      }
    });
  }

  private trackMaterialTextures(mat: THREE.Material): void {
    const record = mat as unknown as Record<string, unknown>;
    for (const key of TEXTURE_KEYS) {
      const candidate = record[key];
      if (candidate instanceof THREE.Texture) {
        this.textures.add(candidate);
      }
    }
  }

  disposeAll(): ResourceDisposalSummary {
    let geometriesDisposed = 0;
    let materialsDisposed = 0;
    let texturesDisposed = 0;

    for (const texture of this.textures) {
      texture.dispose();
      texturesDisposed += 1;
    }
    this.textures.clear();

    for (const material of this.materials) {
      material.dispose();
      materialsDisposed += 1;
    }
    this.materials.clear();

    for (const geometry of this.geometries) {
      geometry.dispose();
      geometriesDisposed += 1;
    }
    this.geometries.clear();

    this.totalDisposed += geometriesDisposed + materialsDisposed + texturesDisposed;

    return {
      geometriesDisposed,
      materialsDisposed,
      texturesDisposed,
      totalDisposed: this.totalDisposed,
    };
  }

  getTotalDisposedCount(): number {
    return this.totalDisposed;
  }
}

export function disposeSceneGraph(root: THREE.Object3D): ResourceDisposalSummary {
  const tracker = new ResourceTracker();
  tracker.trackObject3D(root);
  return tracker.disposeAll();
}
