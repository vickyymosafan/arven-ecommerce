import * as THREE from 'three';
import type { GarmentSilhouetteInput } from '@arven/contracts';
import type { ResourceTracker } from '../resource-tracker.js';
import {
  resolveGarmentStyleVariant,
  type GarmentStyleVariant,
} from '../geometry/garment-builders.js';

export type AtelierTextureKind =
  | 'cotton_jersey'
  | 'cotton_poplin'
  | 'wool_twill'
  | 'virgin_wool'
  | 'waxed_twill'
  | 'calfskin_pebble'
  | 'calfskin_vegtan'
  | 'webbing_strap'
  | 'rubber_sole'
  | 'brushed_bronze'
  | 'gallery_stone'
  | 'gallery_floor'
  | 'atelier_linen';

export interface ProceduralPbrMapPair {
  readonly normalMap: THREE.DataTexture;
  readonly roughnessMap: THREE.DataTexture;
}

function hash2D(ix: number, iy: number, period: number, seed: number): number {
  const x = ((ix % period) + period) % period;
  const y = ((iy % period) + period) % period;
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function smoothNoise2D(u: number, v: number, freq: number, seed: number): number {
  const fx = u * freq;
  const fy = v * freq;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);

  const n00 = hash2D(ix, iy, freq, seed);
  const n10 = hash2D(ix + 1, iy, freq, seed);
  const n01 = hash2D(ix, iy + 1, freq, seed);
  const n11 = hash2D(ix + 1, iy + 1, freq, seed);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function fbmPeriodic(u: number, v: number, baseFreq: number, seed: number): number {
  const o1 = smoothNoise2D(u, v, baseFreq, seed);
  const o2 = smoothNoise2D(u, v, baseFreq * 2, seed + 17) * 0.5;
  const o3 = smoothNoise2D(u, v, baseFreq * 4, seed + 31) * 0.25;
  return (o1 + o2 + o3) / 1.75;
}

function sampleHeightField(kind: AtelierTextureKind, u: number, v: number): number {
  const TAU = Math.PI * 2;
  switch (kind) {
    case 'cotton_jersey': {
      // Interlock knit vertical V-loop columns + organic cotton slub
      const wale = Math.cos(u * TAU * 42);
      const chevron = Math.sin((v * 26 + Math.abs(Math.sin(u * Math.PI * 42)) * 0.45) * TAU);
      const slub = fbmPeriodic(u, v, 8, 11) * 0.35;
      return 0.5 + wale * 0.22 + chevron * 0.15 + (slub - 0.175);
    }
    case 'cotton_poplin': {
      // Crisp tight high-twist plain-weave warp & weft grid
      const warp = Math.sin(u * TAU * 56);
      const weft = Math.sin(v * TAU * 56);
      const checker = warp * weft;
      const micro = fbmPeriodic(u, v, 12, 23) * 0.14;
      return 0.5 + warp * 0.12 + weft * 0.12 + checker * 0.18 + micro;
    }
    case 'wool_twill': {
      // Sharp 45° 2/2 tailored suiting diagonal twill + subtle wool yarn grain
      const diag = Math.sin((u * 40 + v * 40) * TAU);
      const cross = Math.cos((u * 40 - v * 40) * TAU) * 0.22;
      const fiber = fbmPeriodic(u, v, 16, 37) * 0.28;
      return 0.5 + diag * 0.26 + cross * 0.1 + (fiber - 0.14);
    }
    case 'virgin_wool': {
      // Rich brushed double-faced wool melton nap
      const nap1 = fbmPeriodic(u, v, 16, 53);
      const nap2 = smoothNoise2D(u, v, 48, 71);
      const subTwill = Math.sin((u * 28 + v * 28) * TAU) * 0.08;
      return 0.2 + nap1 * 0.52 + nap2 * 0.26 + subTwill;
    }
    case 'waxed_twill': {
      // Tight waxed utility twill with subtle wax patina variation
      const twill = Math.sin((u * 44 + v * 44) * TAU) * 0.22;
      const waxPatch = fbmPeriodic(u, v, 6, 89) * 0.42;
      return 0.35 + twill + waxPatch;
    }
    case 'calfskin_pebble': {
      // Organic full-grain pebbled leather cellular pores
      const c1 = smoothNoise2D(u, v, 24, 101);
      const c2 = smoothNoise2D(u, v, 48, 107);
      const cell = Math.pow(Math.sin(c1 * Math.PI), 0.75) * 0.55 + c2 * 0.3;
      const macro = fbmPeriodic(u, v, 6, 113) * 0.15;
      return cell + macro;
    }
    case 'calfskin_vegtan': {
      // Supple smooth-grain vegetable-tanned saddle leather with fine pores
      const fine = smoothNoise2D(u, v, 36, 127) * 0.35;
      const crease = fbmPeriodic(u, v, 8, 131) * 0.45;
      return 0.25 + fine + crease;
    }
    case 'webbing_strap': {
      // Crisp herringbone/chevron woven cotton-nylon webbing
      const chevron = Math.sin((v * 34 + Math.abs(((u * 6) % 1) - 0.5) * 8) * TAU);
      const rib = Math.sin(u * TAU * 40) * 0.16;
      return 0.5 + chevron * 0.3 + rib;
    }
    case 'rubber_sole': {
      // Micro-stippled matte Margom vulcanized natural rubber
      const grain = smoothNoise2D(u, v, 48, 149) * 0.55;
      const base = fbmPeriodic(u, v, 12, 157) * 0.35;
      return 0.15 + grain + base;
    }
    case 'brushed_bronze': {
      // Directional satin brushed metallic grain
      const streaks = smoothNoise2D(u * 0.25, v, 64, 163) * 0.65;
      const sheen = smoothNoise2D(u, v, 16, 173) * 0.2;
      return 0.2 + streaks + sheen;
    }
    case 'gallery_stone': {
      // Honed Roman travertine / architectural limestone with horizontal mineral veins & subtle pores
      const vein = Math.sin((v * 5 + fbmPeriodic(u, v, 6, 181) * 1.6) * TAU) * 0.22;
      const pore = fbmPeriodic(u, v, 20, 191) * 0.45;
      const pit = smoothNoise2D(u, v, 48, 197) < 0.12 ? -0.22 : 0;
      return Math.max(0, Math.min(1, 0.5 + vein + (pore - 0.22) + pit));
    }
    case 'gallery_floor': {
      // Honed architectural concrete / dark terrazzo with micro-aggregate speckles
      const cloud = fbmPeriodic(u, v, 6, 211) * 0.45;
      const speckle = smoothNoise2D(u, v, 44, 223) * 0.32;
      return 0.25 + cloud + speckle;
    }
    case 'atelier_linen':
    default: {
      // Fine unbleached tailor-form linen weave
      const warp = Math.sin(u * TAU * 38) * 0.18;
      const weft = Math.sin(v * TAU * 38) * 0.18;
      const slub = fbmPeriodic(u, v, 10, 229) * 0.28;
      return 0.45 + warp + weft + slub;
    }
  }
}

/**
 * Generates deterministic, zero-network procedural tileable OpenGL tangent-space Normal + Roughness
 * `THREE.DataTexture` pairs tailored to each fashion textile, leather, metal, or gallery stone family.
 */
export function createProceduralPbrTexturePair(
  kind: AtelierTextureKind,
  options: {
    readonly resolution?: number;
    readonly repeat?: readonly [number, number];
    readonly bumpStrength?: number;
    readonly roughnessMin?: number;
    readonly roughnessMax?: number;
  } = {},
): ProceduralPbrMapPair {
  const size = options.resolution ?? 128;
  const repeat = options.repeat ?? [4, 4];
  const strength = options.bumpStrength ?? 2.2;
  const rMin = options.roughnessMin ?? 0.72;
  const rMax = options.roughnessMax ?? 0.94;

  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      height[y * size + x] = sampleHeightField(kind, u, v);
    }
  }

  const normalData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);

  const sampleH = (x: number, y: number): number => {
    const wx = ((x % size) + size) % size;
    const wy = ((y % size) + size) % size;
    return height[wy * size + wx] ?? 0.5;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const hL = sampleH(x - 1, y);
      const hR = sampleH(x + 1, y);
      const hD = sampleH(x, y - 1);
      const hU = sampleH(x, y + 1);

      const dx = (hL - hR) * strength;
      const dy = (hD - hU) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.hypot(dx, dy, dz);

      const idx = (y * size + x) * 4;
      normalData[idx] = Math.round(((dx * invLen) * 0.5 + 0.5) * 255);
      normalData[idx + 1] = Math.round(((dy * invLen) * 0.5 + 0.5) * 255);
      normalData[idx + 2] = Math.round(((dz * invLen) * 0.5 + 0.5) * 255);
      normalData[idx + 3] = 255;

      const h = sampleH(x, y);
      const roughVal = Math.max(0, Math.min(1, rMin + (1 - h) * (rMax - rMin)));
      const rByte = Math.round(roughVal * 255);
      roughData[idx] = rByte;
      roughData[idx + 1] = rByte;
      roughData[idx + 2] = rByte;
      roughData[idx + 3] = 255;
    }
  }

  const normalMap = new THREE.DataTexture(normalData, size, size, THREE.RGBAFormat);
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(repeat[0], repeat[1]);
  normalMap.generateMipmaps = true;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  normalMap.magFilter = THREE.LinearFilter;
  normalMap.needsUpdate = true;

  const roughnessMap = new THREE.DataTexture(roughData, size, size, THREE.RGBAFormat);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(repeat[0], repeat[1]);
  roughnessMap.generateMipmaps = true;
  roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  roughnessMap.magFilter = THREE.LinearFilter;
  roughnessMap.needsUpdate = true;

  return { normalMap, roughnessMap };
}

export interface FabricPhysicalRecipe {
  readonly textureKind: AtelierTextureKind;
  readonly repeat: readonly [number, number];
  readonly normalScale: number;
  readonly bumpStrength: number;
  readonly roughness: number;
  readonly roughnessSpread: number;
  readonly metalness: number;
  readonly sheen: number;
  readonly sheenRoughness: number;
  readonly clearcoat: number;
  readonly clearcoatRoughness: number;
  readonly envMapIntensity: number;
}

export function getGarmentMaterialRecipes(
  silhouette: GarmentSilhouetteInput,
  productSlug?: string,
): {
  readonly primary: FabricPhysicalRecipe;
  readonly secondary: FabricPhysicalRecipe;
  readonly hardware: FabricPhysicalRecipe;
} {
  const variant: GarmentStyleVariant = resolveGarmentStyleVariant(silhouette, productSlug);

  const bronzeHardware: FabricPhysicalRecipe = {
    textureKind: 'brushed_bronze',
    repeat: [3, 3],
    normalScale: 0.25,
    bumpStrength: 1.4,
    roughness: 0.3,
    roughnessSpread: 0.1,
    metalness: 0.84,
    sheen: 0,
    sheenRoughness: 1,
    clearcoat: 0.12,
    clearcoatRoughness: 0.25,
    envMapIntensity: 1.35,
  };

  switch (variant) {
    case 'shirt':
      return {
        primary: {
          textureKind: 'cotton_poplin',
          repeat: [6, 6],
          normalScale: 0.38,
          bumpStrength: 1.8,
          roughness: 0.8,
          roughnessSpread: 0.1,
          metalness: 0.0,
          sheen: 0.32,
          sheenRoughness: 0.65,
          clearcoat: 0,
          clearcoatRoughness: 1,
          envMapIntensity: 0.85,
        },
        secondary: {
          textureKind: 'cotton_poplin',
          repeat: [7, 7],
          normalScale: 0.42,
          bumpStrength: 1.9,
          roughness: 0.78,
          roughnessSpread: 0.1,
          metalness: 0.0,
          sheen: 0.34,
          sheenRoughness: 0.62,
          clearcoat: 0,
          clearcoatRoughness: 1,
          envMapIntensity: 0.88,
        },
        hardware: {
          ...bronzeHardware,
          roughness: 0.28,
          metalness: 0.65,
        },
      };
    case 'trouser':
      return {
        primary: {
          textureKind: 'wool_twill',
          repeat: [6, 8],
          normalScale: 0.46,
          bumpStrength: 2.1,
          roughness: 0.84,
          roughnessSpread: 0.1,
          metalness: 0.0,
          sheen: 0.44,
          sheenRoughness: 0.72,
          clearcoat: 0,
          clearcoatRoughness: 1,
          envMapIntensity: 0.9,
        },
        secondary: {
          textureKind: 'wool_twill',
          repeat: [6, 6],
          normalScale: 0.48,
          bumpStrength: 2.2,
          roughness: 0.86,
          roughnessSpread: 0.1,
          metalness: 0.0,
          sheen: 0.42,
          sheenRoughness: 0.74,
          clearcoat: 0,
          clearcoatRoughness: 1,
          envMapIntensity: 0.88,
        },
        hardware: bronzeHardware,
      };
    case 'overshirt':
      return {
        primary: {
          textureKind: 'virgin_wool',
          repeat: [5, 5],
          normalScale: 0.62,
          bumpStrength: 2.6,
          roughness: 0.92,
          roughnessSpread: 0.08,
          metalness: 0.0,
          sheen: 0.68,
          sheenRoughness: 0.78,
          clearcoat: 0,
          clearcoatRoughness: 1,
          envMapIntensity: 0.92,
        },
        secondary: {
          textureKind: 'virgin_wool',
          repeat: [6, 6],
          normalScale: 0.58,
          bumpStrength: 2.4,
          roughness: 0.9,
          roughnessSpread: 0.08,
          metalness: 0.0,
          sheen: 0.62,
          sheenRoughness: 0.76,
          clearcoat: 0,
          clearcoatRoughness: 1,
          envMapIntensity: 0.9,
        },
        hardware: {
          ...bronzeHardware,
          roughness: 0.34,
          metalness: 0.76,
        },
      };
    case 'field_jacket':
      return {
        primary: {
          textureKind: 'waxed_twill',
          repeat: [6, 6],
          normalScale: 0.5,
          bumpStrength: 2.2,
          roughness: 0.64,
          roughnessSpread: 0.16,
          metalness: 0.02,
          sheen: 0.24,
          sheenRoughness: 0.62,
          clearcoat: 0.15,
          clearcoatRoughness: 0.52,
          envMapIntensity: 1.0,
        },
        secondary: {
          textureKind: 'waxed_twill',
          repeat: [7, 7],
          normalScale: 0.52,
          bumpStrength: 2.3,
          roughness: 0.68,
          roughnessSpread: 0.14,
          metalness: 0.02,
          sheen: 0.22,
          sheenRoughness: 0.65,
          clearcoat: 0.12,
          clearcoatRoughness: 0.55,
          envMapIntensity: 0.95,
        },
        hardware: {
          ...bronzeHardware,
          roughness: 0.38,
          metalness: 0.78,
        },
      };
    case 'sneaker':
      return {
        primary: {
          textureKind: 'calfskin_pebble',
          repeat: [5, 5],
          normalScale: 0.36,
          bumpStrength: 1.8,
          roughness: 0.46,
          roughnessSpread: 0.12,
          metalness: 0.02,
          sheen: 0.12,
          sheenRoughness: 0.55,
          clearcoat: 0.2,
          clearcoatRoughness: 0.4,
          envMapIntensity: 1.15,
        },
        secondary: {
          textureKind: 'rubber_sole',
          repeat: [6, 6],
          normalScale: 0.34,
          bumpStrength: 1.7,
          roughness: 0.8,
          roughnessSpread: 0.12,
          metalness: 0.0,
          sheen: 0.05,
          sheenRoughness: 0.9,
          clearcoat: 0,
          clearcoatRoughness: 1,
          envMapIntensity: 0.78,
        },
        hardware: bronzeHardware,
      };
    case 'crossbody':
      return {
        primary: {
          textureKind: 'calfskin_vegtan',
          repeat: [4, 4],
          normalScale: 0.3,
          bumpStrength: 1.6,
          roughness: 0.42,
          roughnessSpread: 0.12,
          metalness: 0.02,
          sheen: 0.14,
          sheenRoughness: 0.52,
          clearcoat: 0.26,
          clearcoatRoughness: 0.36,
          envMapIntensity: 1.2,
        },
        secondary: {
          textureKind: 'webbing_strap',
          repeat: [8, 8],
          normalScale: 0.52,
          bumpStrength: 2.4,
          roughness: 0.86,
          roughnessSpread: 0.1,
          metalness: 0.0,
          sheen: 0.26,
          sheenRoughness: 0.78,
          clearcoat: 0,
          clearcoatRoughness: 1,
          envMapIntensity: 0.82,
        },
        hardware: {
          ...bronzeHardware,
          roughness: 0.24,
          metalness: 0.88,
          envMapIntensity: 1.45,
        },
      };
    case 'tee':
    default:
      return {
        primary: {
          textureKind: 'cotton_jersey',
          repeat: [6, 6],
          normalScale: 0.44,
          bumpStrength: 2.0,
          roughness: 0.9,
          roughnessSpread: 0.08,
          metalness: 0.0,
          sheen: 0.48,
          sheenRoughness: 0.84,
          clearcoat: 0,
          clearcoatRoughness: 1,
          envMapIntensity: 0.88,
        },
        secondary: {
          textureKind: 'cotton_jersey',
          repeat: [8, 8],
          normalScale: 0.52,
          bumpStrength: 2.3,
          roughness: 0.92,
          roughnessSpread: 0.08,
          metalness: 0.0,
          sheen: 0.5,
          sheenRoughness: 0.84,
          clearcoat: 0,
          clearcoatRoughness: 1,
          envMapIntensity: 0.88,
        },
        hardware: bronzeHardware,
      };
  }
}

/**
 * Computes a refined, non-plastic grazing sheen tint derived from a textile's base color.
 * Dark Charcoal/Obsidian textiles receive a subtle warm-stone lift so silhouette folds remain
 * legible and tactile against ARVEN's #17191B dark showcase stage.
 */
export function computeTextileSheenColor(baseColor: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  baseColor.getHSL(hsl);
  const liftedL = Math.min(0.92, Math.max(0.32, hsl.l + (1 - hsl.l) * 0.36));
  const softS = Math.min(0.28, hsl.s * 0.75 + 0.05);
  return new THREE.Color().setHSL(hsl.h || 0.1, softS, liftedL);
}

function buildPhysicalMaterialFromStandard(
  source: THREE.MeshStandardMaterial,
  recipe: FabricPhysicalRecipe,
  resolution: number,
  tracker?: ResourceTracker | null,
): THREE.MeshPhysicalMaterial {
  // Encode normalized micro-variation in roughnessMap so material.roughness carries the
  // exact physical roughness factor and stays compatible with CustomizationPreset overrides.
  const relSpread = Math.min(0.28, recipe.roughnessSpread / Math.max(0.2, recipe.roughness));
  const maps = createProceduralPbrTexturePair(recipe.textureKind, {
    resolution,
    repeat: recipe.repeat,
    bumpStrength: recipe.bumpStrength,
    roughnessMin: Math.max(0.72, 1.0 - relSpread),
    roughnessMax: 1.0,
  });

  const sheenColor =
    recipe.sheen > 0 ? computeTextileSheenColor(source.color) : new THREE.Color(0x000000);

  const mat = new THREE.MeshPhysicalMaterial({
    name: source.name,
    color: source.color.clone(),
    vertexColors: source.vertexColors,
    side: source.side,
    roughness: recipe.roughness,
    roughnessMap: maps.roughnessMap,
    metalness: recipe.metalness,
    normalMap: maps.normalMap,
    normalScale: new THREE.Vector2(recipe.normalScale, recipe.normalScale),
    sheen: recipe.sheen,
    sheenRoughness: recipe.sheenRoughness,
    sheenColor,
    clearcoat: recipe.clearcoat,
    clearcoatRoughness: recipe.clearcoatRoughness,
    envMapIntensity: recipe.envMapIntensity,
  });

  // Preserve metadata so applyMaterialPresetToScene can keep roughness & sheen calibrated
  mat.userData['arvenPbrRecipe'] = recipe;

  if (tracker) {
    void tracker;
  }

  return mat;
}

/**
 * Upgrades all loaded garment meshes inside `root` from baseline glTF MeshStandardMaterial
 * to calibrated ARVEN MeshPhysicalMaterial with procedural weave/leather/metal PBR maps.
 * Disposes displaced standard materials immediately to prevent leaks.
 */
export function upgradeGarmentSceneToAtelierPbr(
  root: THREE.Object3D,
  options: {
    readonly silhouette: GarmentSilhouetteInput;
    readonly productSlug?: string;
    readonly lite?: boolean;
  },
): void {
  const recipes = getGarmentMaterialRecipes(options.silhouette, options.productSlug);
  const res = options.lite ? 96 : 160;

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    obj.receiveShadow = true;

    const mats = Array.isArray(obj.material)
      ? obj.material
      : obj.material
        ? [obj.material]
        : [];

    const upgraded = mats.map((m) => {
      if (!(m instanceof THREE.MeshStandardMaterial)) return m;
      const lowerName = (m.name || obj.name || '').toLowerCase();
      let recipe: FabricPhysicalRecipe = recipes.primary;
      if (lowerName.includes('secondary') || lowerName.includes('collar')) {
        recipe = recipes.secondary;
      } else if (lowerName.includes('hardware') || lowerName.includes('button')) {
        recipe = recipes.hardware;
      }
      const nextMat = buildPhysicalMaterialFromStandard(m, recipe, res);
      m.dispose();
      return nextMat;
    });

    obj.material = Array.isArray(obj.material) ? upgraded : (upgraded[0] ?? obj.material);
  });
}

/**
 * Upgrades the ARVEN Unisex Mannequin GLB to tailor-form charcoal linen + brushed bronze joints.
 */
export function upgradeMannequinSceneToAtelierPbr(
  root: THREE.Object3D,
  lite = false,
): void {
  const res = lite ? 96 : 144;
  const linenRecipe: FabricPhysicalRecipe = {
    textureKind: 'atelier_linen',
    repeat: [6, 8],
    normalScale: 0.34,
    bumpStrength: 1.8,
    roughness: 0.84,
    roughnessSpread: 0.1,
    metalness: 0.04,
    sheen: 0.36,
    sheenRoughness: 0.8,
    clearcoat: 0,
    clearcoatRoughness: 1,
    envMapIntensity: 0.9,
  };
  const jointRecipe: FabricPhysicalRecipe = {
    textureKind: 'brushed_bronze',
    repeat: [3, 3],
    normalScale: 0.24,
    bumpStrength: 1.4,
    roughness: 0.32,
    roughnessSpread: 0.1,
    metalness: 0.84,
    sheen: 0,
    sheenRoughness: 1,
    clearcoat: 0.12,
    clearcoatRoughness: 0.28,
    envMapIntensity: 1.35,
  };

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const mats = Array.isArray(obj.material)
      ? obj.material
      : obj.material
        ? [obj.material]
        : [];
    const upgraded = mats.map((m) => {
      if (!(m instanceof THREE.MeshStandardMaterial)) return m;
      const isJoint =
        m.name.toLowerCase().includes('joint') ||
        m.name.toLowerCase().includes('accent') ||
        obj.name.toLowerCase().includes('accent');
      const nextMat = buildPhysicalMaterialFromStandard(
        m,
        isJoint ? jointRecipe : linenRecipe,
        res,
      );
      m.dispose();
      return nextMat;
    });
    obj.material = Array.isArray(obj.material) ? upgraded : (upgraded[0] ?? obj.material);
  });
}

/**
 * Upgrades Virtual Showroom architectural zone GLB materials to honed travertine stone,
 * subtly reflective architectural concrete floor, brushed gallery bronze, and softly glowing skylight diffusers.
 */
export function upgradeShowroomZoneToAtelierPbr(
  root: THREE.Object3D,
  options: { readonly warm?: boolean; readonly lite?: boolean } = {},
): void {
  const res = options.lite ? 96 : 160;
  const stoneRecipe: FabricPhysicalRecipe = {
    textureKind: 'gallery_stone',
    repeat: [3, 3],
    normalScale: 0.42,
    bumpStrength: 2.1,
    roughness: 0.84,
    roughnessSpread: 0.1,
    metalness: 0.03,
    sheen: 0.08,
    sheenRoughness: 0.9,
    clearcoat: 0,
    clearcoatRoughness: 1,
    envMapIntensity: 0.82,
  };
  const floorRecipe: FabricPhysicalRecipe = {
    textureKind: 'gallery_floor',
    repeat: [5, 5],
    normalScale: 0.2,
    bumpStrength: 1.2,
    roughness: 0.44,
    roughnessSpread: 0.14,
    metalness: 0.06,
    sheen: 0,
    sheenRoughness: 1,
    clearcoat: 0.16,
    clearcoatRoughness: 0.38,
    envMapIntensity: 1.05,
  };
  const bronzeRecipe: FabricPhysicalRecipe = {
    textureKind: 'brushed_bronze',
    repeat: [4, 4],
    normalScale: 0.28,
    bumpStrength: 1.5,
    roughness: 0.3,
    roughnessSpread: 0.1,
    metalness: 0.86,
    sheen: 0,
    sheenRoughness: 1,
    clearcoat: 0.14,
    clearcoatRoughness: 0.25,
    envMapIntensity: 1.35,
  };

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.receiveShadow = true;
    const mats = Array.isArray(obj.material)
      ? obj.material
      : obj.material
        ? [obj.material]
        : [];
    const upgraded = mats.map((m) => {
      if (!(m instanceof THREE.MeshStandardMaterial)) return m;
      const lower = (m.name || obj.name || '').toLowerCase();

      if (lower.includes('skylight')) {
        const emissiveHex = options.warm ? '#FFEBD2' : '#F4F1EA';
        const skylightMat = new THREE.MeshStandardMaterial({
          name: m.name,
          color: new THREE.Color(emissiveHex),
          emissive: new THREE.Color(emissiveHex),
          emissiveIntensity: 1.15,
          roughness: 0.25,
          metalness: 0.0,
          vertexColors: m.vertexColors,
        });
        m.dispose();
        return skylightMat;
      }

      const recipe = lower.includes('bronze') || lower.includes('accent')
        ? bronzeRecipe
        : lower.includes('floor')
          ? floorRecipe
          : stoneRecipe;
      const nextMat = buildPhysicalMaterialFromStandard(m, recipe, res);
      m.dispose();
      return nextMat;
    });

    obj.material = Array.isArray(obj.material) ? upgraded : (upgraded[0] ?? obj.material);
  });
}

// ============================================================================
// Procedural Atelier Photography Studio PMREM IBL Environment (Zero CDN!)
// ============================================================================

interface AtelierEnvEntry {
  refCount: number;
  renderTarget: THREE.WebGLRenderTarget | null;
}

const atelierEnvCache = new Map<string, AtelierEnvEntry>();

function buildAtelierStudioLightBoxScene(warm: boolean): THREE.Scene {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(warm ? '#1E1C19' : '#1A1C1F');

  const panelGeom = new THREE.PlaneGeometry(1, 1);
  const createdMaterials: THREE.Material[] = [];

  const addSoftbox = (
    pos: readonly [number, number, number],
    lookAt: readonly [number, number, number],
    scale: readonly [number, number],
    hex: string,
    intensity: number,
  ) => {
    const color = new THREE.Color(hex).multiplyScalar(intensity);
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    createdMaterials.push(mat);
    const mesh = new THREE.Mesh(panelGeom, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.scale.set(scale[0], scale[1], 1);
    mesh.lookAt(lookAt[0], lookAt[1], lookAt[2]);
    envScene.add(mesh);
  };

  // 1. Overhead flagship gallery diffused daylight softbox
  addSoftbox([0, 6.5, 0.5], [0, 0, 0], [8.5, 6.0], warm ? '#FFF3E2' : '#FAF8F2', 2.6);
  // 2. Front-right key studio softbox (sculpts folds & leather clearcoat highlights)
  addSoftbox([5.5, 3.2, 4.5], [0, 0.7, 0], [4.5, 5.2], warm ? '#FFEAD0' : '#FFFDF8', 2.4);
  // 3. Front-left cool architectural fill bounce panel (preserves shadow detail without washing out)
  addSoftbox([-6.0, 2.4, 3.5], [0, 0.7, 0], [5.2, 4.4], '#DCE5EE', 1.35);
  // 4. Rear Atelier Gold / warm bronze rim strips (outlines dark Charcoal/Obsidian silhouettes!)
  addSoftbox([-3.6, 2.8, -5.2], [0, 0.8, 0], [2.4, 5.0], '#D8BC8E', 1.9);
  addSoftbox([3.6, 2.8, -5.2], [0, 0.8, 0], [2.4, 5.0], '#E5D9C4', 1.6);
  // 5. Soft neutral floor bounce absorber (subtle lift under hems and trouser legs)
  addSoftbox([0, -4.5, 0], [0, 0, 0], [10, 10], '#35383A', 0.45);

  envScene.userData['disposeEnvHelpers'] = () => {
    panelGeom.dispose();
    for (const m of createdMaterials) m.dispose();
  };

  return envScene;
}

/**
 * Reference-counted procedural Atelier Photography Studio PMREM environment map.
 * Produces rich metallic reflections on brass/horn hardware and grazing light wrap on wool/cotton/leather
 * with zero external HDRI downloads and deterministic disposal when refCount reaches 0.
 */
export function acquireAtelierStudioEnv(
  envKey: string,
  gl?: THREE.WebGLRenderer,
  warm = false,
): {
  readonly envKey: string;
  readonly refCount: number;
  readonly texture: THREE.Texture | null;
} {
  let entry = atelierEnvCache.get(envKey);
  if (!entry) {
    entry = { refCount: 0, renderTarget: null };
    atelierEnvCache.set(envKey, entry);
  }
  entry.refCount += 1;

  if (gl && !entry.renderTarget) {
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const lightBox = buildAtelierStudioLightBoxScene(warm);
    entry.renderTarget = pmrem.fromScene(lightBox, 0.035);
    const cleanup = lightBox.userData['disposeEnvHelpers'] as (() => void) | undefined;
    cleanup?.();
    pmrem.dispose();
  }

  return {
    envKey,
    refCount: entry.refCount,
    texture: entry.renderTarget?.texture ?? null,
  };
}

export function releaseAtelierStudioEnv(envKey: string): {
  readonly envKey: string;
  readonly refCount: number;
  readonly disposed: boolean;
} {
  const entry = atelierEnvCache.get(envKey);
  if (!entry) {
    return { envKey, refCount: 0, disposed: false };
  }
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    entry.renderTarget?.dispose();
    entry.renderTarget = null;
    atelierEnvCache.delete(envKey);
    return { envKey, refCount: 0, disposed: true };
  }
  return { envKey, refCount: entry.refCount, disposed: false };
}

export function getAtelierStudioEnvRefCount(envKey: string): number {
  return atelierEnvCache.get(envKey)?.refCount ?? 0;
}
