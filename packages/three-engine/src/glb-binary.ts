import type {
  AssetProvenanceDto,
  GarmentSilhouetteInput,
  LightingPresetInput,
  MaterialSlotSpecDto,
  Product3DAssetConfigDto,
} from '@arven/contracts';
import {
  buildSculptedGarmentParts,
  resolveGarmentStyleVariant,
} from './geometry/garment-builders.js';
import {
  buildSculptedMannequinParts,
  buildSculptedShowroomParts,
  type ShowroomZoneGlbBuildOptions,
  type ShowroomZonePedestalSpec,
  type ShowroomZonePortalSpec,
} from './geometry/mannequin-and-showroom-builders.js';
import {
  hexToLinearRgba,
  type SculptMeshAccumulator,
} from './geometry/mesh-sculptor.js';

export {
  hexToLinearRgba,
  type ShowroomZoneGlbBuildOptions,
  type ShowroomZonePedestalSpec,
  type ShowroomZonePortalSpec,
};

const GLB_MAGIC_UINT32 = 0x46546c67; // 'glTF'
const GLB_VERSION_2 = 2;
const GLB_CHUNK_JSON = 0x4e4f534a; // 'JSON'
const GLB_CHUNK_BIN = 0x004e4942; // 'BIN\0'

export const GLB_DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
export const GLB_LITE_MAX_BYTES = Math.floor(3.5 * 1024 * 1024);
export const GLB_DEFAULT_MAX_TRIANGLES = 80_000;
export const GLB_LITE_MAX_TRIANGLES = 25_000;
export const MANNEQUIN_DEFAULT_MAX_TRIANGLES = 30_000;
export const MANNEQUIN_LITE_MAX_TRIANGLES = 12_000;
export const SHOWROOM_ZONE_DEFAULT_MAX_BYTES = 6_291_456;
export const SHOWROOM_ZONE_LITE_MAX_BYTES = 3_670_016;

export const DEFAULT_ARVEN_MATERIAL_SLOTS: readonly MaterialSlotSpecDto[] = [
  {
    slotId: 'mat_fabric_primary',
    meshNames: ['mesh_garment_body'],
    materialName: 'mat_fabric_primary',
    customizable: true,
    defaultBaseColorHex: '#17191B',
    roughnessRange: [0.35, 0.96],
    metalnessRange: [0.0, 0.1],
  },
  {
    slotId: 'mat_fabric_secondary',
    meshNames: ['mesh_collar_rib'],
    materialName: 'mat_fabric_secondary',
    customizable: true,
    defaultBaseColorHex: '#35383A',
    roughnessRange: [0.4, 0.96],
    metalnessRange: [0.0, 0.1],
  },
  {
    slotId: 'mat_hardware_accent',
    meshNames: ['mesh_buttons'],
    materialName: 'mat_hardware_accent',
    customizable: false,
    defaultBaseColorHex: '#C5A572',
    roughnessRange: [0.2, 0.55],
    metalnessRange: [0.4, 0.92],
  },
] as const;

export const DEFAULT_ARVEN_PROVENANCE: AssetProvenanceDto = {
  sourceType: 'in_house_cad',
  modelAuthor: 'ARVEN Atelier 3D Fashion Engineering Team',
  modelLicense: 'ARVEN Proprietary Commercial Asset License v1.0',
  textureLicense: 'CC0-1.0',
  hdriLicense: 'CC0-1.0',
  commercialUseVerified: true,
};

export interface GlbBuildOptions {
  readonly silhouette?: GarmentSilhouetteInput;
  readonly productSlug?: string;
  readonly primaryHex?: string;
  readonly secondaryHex?: string;
  readonly accentHex?: string;
  readonly profile?: 'default' | 'lite';
}

export interface MannequinGlbBuildOptions {
  readonly profile?: 'default' | 'lite';
}

export interface GlbValidationOptions {
  readonly profile?: 'default' | 'lite';
  readonly expectedMaterialSlots?: ReadonlyArray<
    Pick<MaterialSlotSpecDto, 'slotId' | 'meshNames' | 'materialName'>
  >;
}

export interface GlbValidationResult {
  readonly valid: boolean;
  readonly bytes: number;
  readonly triangleCount: number;
  readonly vertexCount: number;
  readonly meshNames: string[];
  readonly materialNames: string[];
  readonly boundsMin: [number, number, number];
  readonly boundsMax: [number, number, number];
  readonly errors: string[];
}

function alignToFourBytes(len: number): number {
  return Math.ceil(len / 4) * 4;
}

function computePositionMinMax(positions: readonly number[]): {
  readonly min: [number, number, number];
  readonly max: [number, number, number];
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    const z = positions[i + 2] ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}

interface GlbPartSpec {
  readonly nodeName: string;
  readonly meshName: string;
  readonly materialName: string;
  readonly baseColorFactor: readonly [number, number, number, number];
  readonly roughnessFactor: number;
  readonly metallicFactor: number;
  readonly emissiveFactor?: readonly [number, number, number];
  readonly doubleSided?: boolean;
  readonly acc: SculptMeshAccumulator;
}

interface GlbExtraNodeSpec {
  readonly name: string;
  readonly translation?: readonly [number, number, number];
  readonly childNames?: ReadonlyArray<string>;
}

function packGlbParts(options: {
  readonly sceneName: string;
  readonly generator: string;
  readonly parts: ReadonlyArray<GlbPartSpec>;
  readonly extraNodes?: ReadonlyArray<GlbExtraNodeSpec>;
  readonly rootNodeNames?: ReadonlyArray<string>;
}): Buffer {
  const bufferViews: Array<Record<string, unknown>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  const materials: Array<Record<string, unknown>> = [];
  const meshes: Array<Record<string, unknown>> = [];
  const nodes: Array<Record<string, unknown>> = [];
  const nodeIndexByName = new Map<string, number>();

  const binChunks: Uint8Array[] = [];
  let binOffset = 0;

  const appendBinSegment = (data: Uint8Array): { offset: number; length: number } => {
    const startOffset = binOffset;
    binChunks.push(data);
    binOffset += data.byteLength;
    const aligned = alignToFourBytes(binOffset);
    if (aligned > binOffset) {
      binChunks.push(new Uint8Array(aligned - binOffset));
      binOffset = aligned;
    }
    return { offset: startOffset, length: data.byteLength };
  };

  for (const [index, entry] of options.parts.entries()) {
    const vertexCount = entry.acc.positions.length / 3;
    const posArray = new Float32Array(entry.acc.positions);
    const normArray = new Float32Array(entry.acc.normals);
    const hasUvs = entry.acc.uvs.length === vertexCount * 2;
    const uvArray = hasUvs ? new Float32Array(entry.acc.uvs) : null;
    const hasColors = entry.acc.colors.length === vertexCount * 4;
    const colorArray = hasColors ? new Float32Array(entry.acc.colors) : null;
    const useUint32 = vertexCount > 65_535;
    const idxArray = useUint32
      ? new Uint32Array(entry.acc.indices)
      : new Uint16Array(entry.acc.indices);

    const posSeg = appendBinSegment(
      new Uint8Array(posArray.buffer, posArray.byteOffset, posArray.byteLength),
    );
    const normSeg = appendBinSegment(
      new Uint8Array(normArray.buffer, normArray.byteOffset, normArray.byteLength),
    );
    const uvSeg = uvArray
      ? appendBinSegment(new Uint8Array(uvArray.buffer, uvArray.byteOffset, uvArray.byteLength))
      : null;
    const colorSeg = colorArray
      ? appendBinSegment(
          new Uint8Array(colorArray.buffer, colorArray.byteOffset, colorArray.byteLength),
        )
      : null;
    const idxSeg = appendBinSegment(
      new Uint8Array(idxArray.buffer, idxArray.byteOffset, idxArray.byteLength),
    );

    const posViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: posSeg.offset,
      byteLength: posSeg.length,
      target: 34962,
    });

    const normViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: normSeg.offset,
      byteLength: normSeg.length,
      target: 34962,
    });

    const uvViewIdx = uvSeg
      ? (() => {
          const viewIdx = bufferViews.length;
          bufferViews.push({
            buffer: 0,
            byteOffset: uvSeg.offset,
            byteLength: uvSeg.length,
            target: 34962,
          });
          return viewIdx;
        })()
      : null;

    const colorViewIdx = colorSeg
      ? (() => {
          const viewIdx = bufferViews.length;
          bufferViews.push({
            buffer: 0,
            byteOffset: colorSeg.offset,
            byteLength: colorSeg.length,
            target: 34962,
          });
          return viewIdx;
        })()
      : null;

    const idxViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: idxSeg.offset,
      byteLength: idxSeg.length,
      target: 34963,
    });

    const { min, max } = computePositionMinMax(entry.acc.positions);
    const posAccIdx = accessors.length;
    accessors.push({
      bufferView: posViewIdx,
      byteOffset: 0,
      componentType: 5126, // FLOAT
      count: vertexCount,
      type: 'VEC3',
      min,
      max,
    });

    const normAccIdx = accessors.length;
    accessors.push({
      bufferView: normViewIdx,
      byteOffset: 0,
      componentType: 5126,
      count: entry.acc.normals.length / 3,
      type: 'VEC3',
    });

    const uvAccIdx =
      uvViewIdx !== null
        ? (() => {
            const accIdx = accessors.length;
            accessors.push({
              bufferView: uvViewIdx,
              byteOffset: 0,
              componentType: 5126,
              count: entry.acc.uvs.length / 2,
              type: 'VEC2',
            });
            return accIdx;
          })()
        : null;

    const colorAccIdx =
      colorViewIdx !== null
        ? (() => {
            const accIdx = accessors.length;
            accessors.push({
              bufferView: colorViewIdx,
              byteOffset: 0,
              componentType: 5126,
              count: entry.acc.colors.length / 4,
              type: 'VEC4',
            });
            return accIdx;
          })()
        : null;

    const idxAccIdx = accessors.length;
    accessors.push({
      bufferView: idxViewIdx,
      byteOffset: 0,
      componentType: useUint32 ? 5125 : 5123, // UNSIGNED_INT or UNSIGNED_SHORT
      count: entry.acc.indices.length,
      type: 'SCALAR',
    });

    const matRecord: Record<string, unknown> = {
      name: entry.materialName,
      doubleSided: entry.doubleSided ?? false,
      pbrMetallicRoughness: {
        baseColorFactor: entry.baseColorFactor,
        metallicFactor: entry.metallicFactor,
        roughnessFactor: entry.roughnessFactor,
      },
    };
    if (entry.emissiveFactor) {
      matRecord['emissiveFactor'] = [...entry.emissiveFactor];
    }
    materials.push(matRecord);

    const attributes: Record<string, number> = {
      POSITION: posAccIdx,
      NORMAL: normAccIdx,
    };
    if (uvAccIdx !== null) {
      attributes['TEXCOORD_0'] = uvAccIdx;
    }
    if (colorAccIdx !== null) {
      attributes['COLOR_0'] = colorAccIdx;
    }

    meshes.push({
      name: entry.meshName,
      primitives: [
        {
          attributes,
          indices: idxAccIdx,
          material: index,
        },
      ],
    });

    const nodeIdx = nodes.length;
    nodes.push({
      name: entry.nodeName,
      mesh: index,
    });
    nodeIndexByName.set(entry.nodeName, nodeIdx);
  }

  if (options.extraNodes) {
    for (const extra of options.extraNodes) {
      const nodeIdx = nodes.length;
      const nodeRecord: Record<string, unknown> = {
        name: extra.name,
      };
      if (extra.translation) {
        nodeRecord['translation'] = [...extra.translation];
      }
      nodes.push(nodeRecord);
      nodeIndexByName.set(extra.name, nodeIdx);
    }

    for (const extra of options.extraNodes) {
      if (extra.childNames && extra.childNames.length > 0) {
        const parentIdx = nodeIndexByName.get(extra.name);
        if (parentIdx !== undefined) {
          const childIndices = extra.childNames
            .map((name) => nodeIndexByName.get(name))
            .filter((idx): idx is number => idx !== undefined);
          if (childIndices.length > 0) {
            nodes[parentIdx]!['children'] = childIndices;
          }
        }
      }
    }
  }

  const sceneNodes = options.rootNodeNames
    ? options.rootNodeNames
        .map((name) => nodeIndexByName.get(name))
        .filter((idx): idx is number => idx !== undefined)
    : nodes.map((_, idx) => idx);

  const gltfJson = {
    asset: {
      version: '2.0',
      generator: options.generator,
    },
    scene: 0,
    scenes: [
      {
        name: options.sceneName,
        nodes: sceneNodes,
      },
    ],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [
      {
        byteLength: binOffset,
      },
    ],
  };

  const jsonRawBytes = new TextEncoder().encode(JSON.stringify(gltfJson));
  const jsonAlignedLength = alignToFourBytes(jsonRawBytes.byteLength);
  const jsonChunkBytes = new Uint8Array(jsonAlignedLength);
  jsonChunkBytes.set(jsonRawBytes);
  for (let i = jsonRawBytes.byteLength; i < jsonAlignedLength; i += 1) {
    jsonChunkBytes[i] = 0x20;
  }

  const totalLength = 12 + 8 + jsonChunkBytes.byteLength + 8 + binOffset;
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);

  view.setUint32(0, GLB_MAGIC_UINT32, true);
  view.setUint32(4, GLB_VERSION_2, true);
  view.setUint32(8, totalLength, true);

  view.setUint32(12, jsonChunkBytes.byteLength, true);
  view.setUint32(16, GLB_CHUNK_JSON, true);
  output.set(jsonChunkBytes, 20);

  const binHeaderOffset = 20 + jsonChunkBytes.byteLength;
  view.setUint32(binHeaderOffset, binOffset, true);
  view.setUint32(binHeaderOffset + 4, GLB_CHUNK_BIN, true);

  let writeCursor = binHeaderOffset + 8;
  for (const chunk of binChunks) {
    output.set(chunk, writeCursor);
    writeCursor += chunk.byteLength;
  }

  return Buffer.from(output.buffer, output.byteOffset, output.byteLength);
}

function getGlbBaselinePbrFactors(
  silhouette: GarmentSilhouetteInput,
  productSlug?: string,
): {
  readonly primaryRoughness: number;
  readonly primaryMetalness: number;
  readonly secondaryRoughness: number;
  readonly secondaryMetalness: number;
  readonly hardwareRoughness: number;
  readonly hardwareMetalness: number;
} {
  const variant = resolveGarmentStyleVariant(silhouette, productSlug);
  switch (variant) {
    case 'sneaker':
      return {
        primaryRoughness: 0.46,
        primaryMetalness: 0.02,
        secondaryRoughness: 0.8,
        secondaryMetalness: 0.0,
        hardwareRoughness: 0.3,
        hardwareMetalness: 0.84,
      };
    case 'crossbody':
      return {
        primaryRoughness: 0.42,
        primaryMetalness: 0.02,
        secondaryRoughness: 0.86,
        secondaryMetalness: 0.0,
        hardwareRoughness: 0.24,
        hardwareMetalness: 0.88,
      };
    case 'shirt':
      return {
        primaryRoughness: 0.78,
        primaryMetalness: 0.0,
        secondaryRoughness: 0.76,
        secondaryMetalness: 0.0,
        hardwareRoughness: 0.28,
        hardwareMetalness: 0.65,
      };
    case 'trouser':
      return {
        primaryRoughness: 0.84,
        primaryMetalness: 0.0,
        secondaryRoughness: 0.86,
        secondaryMetalness: 0.0,
        hardwareRoughness: 0.32,
        hardwareMetalness: 0.78,
      };
    case 'field_jacket':
      return {
        primaryRoughness: 0.64,
        primaryMetalness: 0.02,
        secondaryRoughness: 0.68,
        secondaryMetalness: 0.02,
        hardwareRoughness: 0.38,
        hardwareMetalness: 0.78,
      };
    case 'overshirt':
      return {
        primaryRoughness: 0.92,
        primaryMetalness: 0.0,
        secondaryRoughness: 0.9,
        secondaryMetalness: 0.0,
        hardwareRoughness: 0.34,
        hardwareMetalness: 0.76,
      };
    case 'tee':
    default:
      return {
        primaryRoughness: 0.9,
        primaryMetalness: 0.0,
        secondaryRoughness: 0.92,
        secondaryMetalness: 0.0,
        hardwareRoughness: 0.3,
        hardwareMetalness: 0.84,
      };
  }
}

const GLB_BUILD_MEMO = new Map<string, Buffer>();
const MAX_GLB_MEMO_ENTRIES = 64;

function getOrBuildMemoizedGlb(cacheKey: string, factory: () => Buffer): Buffer {
  const existing = GLB_BUILD_MEMO.get(cacheKey);
  if (existing) {
    return Buffer.from(existing);
  }
  const built = factory();
  if (GLB_BUILD_MEMO.size >= MAX_GLB_MEMO_ENTRIES) {
    const oldestKey = GLB_BUILD_MEMO.keys().next().value;
    if (typeof oldestKey === 'string') {
      GLB_BUILD_MEMO.delete(oldestKey);
    }
  }
  GLB_BUILD_MEMO.set(cacheKey, built);
  return Buffer.from(built);
}

/**
 * Builds a deterministic, strictly spec-compliant binary glTF 2.0 (.glb) buffer
 * containing anatomically sculpted, UV-mapped, vertex-AO shaded ARVEN garment geometry
 * mapped to canonical slots (`mat_fabric_primary`, `mat_fabric_secondary`, `mat_hardware_accent`).
 */
export function buildArvenGarmentGlbBuffer(options: GlbBuildOptions = {}): Uint8Array {
  const silhouette = options.silhouette ?? 'tee';
  const lite = options.profile === 'lite';
  const primaryHex = options.primaryHex ?? '#17191B';
  const secondaryHex = options.secondaryHex ?? '#35383A';
  const accentHex = options.accentHex ?? '#C5A572';
  const cacheKey = `garment|${silhouette}|${options.productSlug ?? ''}|${lite ? 'lite' : 'default'}|${primaryHex}|${secondaryHex}|${accentHex}`;

  return getOrBuildMemoizedGlb(cacheKey, () => {
    const parts = buildSculptedGarmentParts(silhouette, lite, options.productSlug);
    const pbr = getGlbBaselinePbrFactors(silhouette, options.productSlug);

    return packGlbParts({
      sceneName: 'arven_garment_stage',
      generator: 'ARVEN Atelier Sculpted Garment GLB Builder v2.0',
      parts: [
        {
          nodeName: 'mesh_garment_body',
          meshName: 'mesh_garment_body',
          materialName: 'mat_fabric_primary',
          baseColorFactor: hexToLinearRgba(primaryHex),
          roughnessFactor: pbr.primaryRoughness,
          metallicFactor: pbr.primaryMetalness,
          acc: parts.body,
        },
        {
          nodeName: 'mesh_collar_rib',
          meshName: 'mesh_collar_rib',
          materialName: 'mat_fabric_secondary',
          baseColorFactor: hexToLinearRgba(secondaryHex),
          roughnessFactor: pbr.secondaryRoughness,
          metallicFactor: pbr.secondaryMetalness,
          acc: parts.secondary,
        },
        {
          nodeName: 'mesh_buttons',
          meshName: 'mesh_buttons',
          materialName: 'mat_hardware_accent',
          baseColorFactor: hexToLinearRgba(accentHex),
          roughnessFactor: pbr.hardwareRoughness,
          metallicFactor: pbr.hardwareMetalness,
          acc: parts.hardware,
        },
      ],
    });
  });
}

/**
 * Builds the standardized ARVEN sculpted unisex mannequin rig GLB (`arven_mannequin_unisex_v1`)
 * resting squarely at Y = 0.000 (1 unit = 1m, +Y up, +Z forward) with all 6 Outfit Studio anchor nodes.
 */
export function buildArvenMannequinGlbBuffer(
  options: MannequinGlbBuildOptions = {},
): Buffer {
  const lite = options.profile === 'lite';
  const cacheKey = `mannequin|${lite ? 'lite' : 'default'}`;

  return getOrBuildMemoizedGlb(cacheKey, () => {
    const parts = buildSculptedMannequinParts(lite);

    return packGlbParts({
      sceneName: 'arven_mannequin_unisex_v1',
      generator: 'ARVEN Atelier Sculpted Mannequin Rig Builder v2.0',
      parts: [
        {
          nodeName: 'mesh_mannequin_body',
          meshName: 'mesh_mannequin_body',
          materialName: 'mat_mannequin_matte',
          baseColorFactor: hexToLinearRgba('#383B3D'),
          roughnessFactor: 0.84,
          metallicFactor: 0.04,
          acc: parts.body,
        },
        {
          nodeName: 'mesh_mannequin_accents',
          meshName: 'mesh_mannequin_accents',
          materialName: 'mat_mannequin_joint',
          baseColorFactor: hexToLinearRgba('#C5A572'),
          roughnessFactor: 0.32,
          metallicFactor: 0.84,
          acc: parts.accents,
        },
      ],
      extraNodes: [
        { name: 'spine_upper', translation: [0, 0.69, 0] },
        { name: 'pelvis', translation: [0, 0, 0] },
        { name: 'feet', translation: [0, 0, 0] },
        { name: 'shoulder_left', translation: [-0.21, 0.80, 0.015] },
        { name: 'shoulder_right', translation: [0.21, 0.80, 0.015] },
        { name: 'wrist_left', translation: [-0.26, 0.84, 0.024] },
        {
          name: 'arven_mannequin_unisex_v1',
          childNames: [
            'mesh_mannequin_body',
            'mesh_mannequin_accents',
            'spine_upper',
            'pelvis',
            'feet',
            'shoulder_left',
            'shoulder_right',
            'wrist_left',
          ],
        },
      ],
      rootNodeNames: ['arven_mannequin_unisex_v1'],
    });
  });
}

/**
 * Builds a deterministic, richly detailed architectural gallery zone GLB with baked `COLOR_0`
 * vertex AO, `TEXCOORD_0` world-scale UVs, fluted columns/arches/slats, chamfered travertine
 * pedestals, coffered skylight louvers, brushed bronze inlays, and sculpted portal archways.
 */
export function buildArvenShowroomZoneGlbBuffer(
  options: ShowroomZoneGlbBuildOptions,
): Buffer {
  const cacheKey = `showroom|${JSON.stringify(options)}`;
  return getOrBuildMemoizedGlb(cacheKey, () => {
    const built = buildSculptedShowroomParts(options);
    const warm = options.lightingPreset === 'arven_warm_editorial_v1';
    const rootName = `zone_${options.code}`;

    const extraNodes: GlbExtraNodeSpec[] = [
      ...built.portalTranslations.map((p) => ({
        name: p.name,
        translation: p.translation,
      })),
      {
        name: rootName,
        childNames: [
          'mesh_zone_floor',
          'mesh_zone_architecture',
          'mesh_zone_accents',
          'mesh_zone_skylight',
          ...built.portalNodeNames,
        ],
      },
    ];

    return packGlbParts({
      sceneName: rootName,
      generator: 'ARVEN Atelier Architectural Showroom Builder v2.0',
      parts: [
        {
          nodeName: 'mesh_zone_floor',
          meshName: 'mesh_zone_floor',
          materialName: 'mat_gallery_floor',
          baseColorFactor: [1, 1, 1, 1],
          roughnessFactor: 0.44,
          metallicFactor: 0.06,
          acc: built.floor,
        },
        {
          nodeName: 'mesh_zone_architecture',
          meshName: 'mesh_zone_architecture',
          materialName: 'mat_gallery_stone',
          baseColorFactor: [1, 1, 1, 1],
          roughnessFactor: 0.84,
          metallicFactor: 0.03,
          acc: built.architecture,
        },
        {
          nodeName: 'mesh_zone_accents',
          meshName: 'mesh_zone_accents',
          materialName: 'mat_gallery_bronze',
          baseColorFactor: [1, 1, 1, 1],
          roughnessFactor: 0.3,
          metallicFactor: 0.86,
          acc: built.accents,
        },
        {
          nodeName: 'mesh_zone_skylight',
          meshName: 'mesh_zone_skylight',
          materialName: 'mat_gallery_skylight',
          baseColorFactor: [1, 1, 1, 1],
          roughnessFactor: 0.25,
          metallicFactor: 0.0,
          emissiveFactor: warm ? [0.95, 0.85, 0.72] : [0.9, 0.89, 0.85],
          acc: built.skylight,
        },
      ],
      extraNodes,
      rootNodeNames: [rootName],
    });
  });
}

function hasForbiddenPolyglotPrefix(bytes: Uint8Array): string | null {
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) {
    return 'Executable MZ/PE signature rejected';
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x7f &&
    bytes[1] === 0x45 &&
    bytes[2] === 0x4c &&
    bytes[3] === 0x46
  ) {
    return 'Executable ELF signature rejected';
  }
  const headText = new TextDecoder()
    .decode(bytes.subarray(0, Math.min(bytes.length, 512)))
    .toLowerCase();
  if (
    headText.includes('<script') ||
    headText.includes('<!doctype') ||
    headText.includes('<html')
  ) {
    return 'HTML/script polyglot payload rejected';
  }
  return null;
}

function containsExternalUriOrScript(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('file://') ||
    lower.startsWith('ftp://') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('//') ||
    lower.includes('<script')
  );
}

/**
 * Validates raw binary `.glb` payload against Threat T-06 security rules, glTF 2.0
 * chunk framing, triangle/byte profile caps, external URI prohibition, and materialSlots coverage.
 */
export function inspectAndValidateGlbBuffer(
  bytes: Uint8Array,
  options: GlbValidationOptions = {},
): GlbValidationResult {
  const profile = options.profile ?? 'default';
  const maxBytes = profile === 'lite' ? GLB_LITE_MAX_BYTES : GLB_DEFAULT_MAX_BYTES;
  const maxTriangles =
    profile === 'lite' ? GLB_LITE_MAX_TRIANGLES : GLB_DEFAULT_MAX_TRIANGLES;
  const errors: string[] = [];

  const polyglotReason = hasForbiddenPolyglotPrefix(bytes);
  if (polyglotReason) {
    errors.push(polyglotReason);
  }

  if (bytes.byteLength < 20) {
    errors.push('GLB payload is smaller than minimum 20-byte glTF binary header');
    return {
      valid: false,
      bytes: bytes.byteLength,
      triangleCount: 0,
      vertexCount: 0,
      meshNames: [],
      materialNames: [],
      boundsMin: [0, 0, 0],
      boundsMax: [0, 0, 0],
      errors,
    };
  }

  if (bytes.byteLength > maxBytes) {
    errors.push(
      `GLB byte size ${bytes.byteLength} exceeds ${profile} cap of ${maxBytes} bytes`,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const declaredLength = view.getUint32(8, true);

  if (magic !== GLB_MAGIC_UINT32) {
    errors.push('Invalid GLB magic header (expected 0x46546C67 / glTF)');
  }
  if (version !== GLB_VERSION_2) {
    errors.push(`Unsupported GLB version ${version} (expected glTF 2)`);
  }
  if (declaredLength !== bytes.byteLength) {
    errors.push(
      `GLB header length (${declaredLength}) does not match payload byte length (${bytes.byteLength})`,
    );
  }

  if (errors.length > 0 && magic !== GLB_MAGIC_UINT32) {
    return {
      valid: false,
      bytes: bytes.byteLength,
      triangleCount: 0,
      vertexCount: 0,
      meshNames: [],
      materialNames: [],
      boundsMin: [0, 0, 0],
      boundsMax: [0, 0, 0],
      errors,
    };
  }

  let offset = 12;
  let jsonText: string | null = null;
  let binLength = 0;

  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;

    if (chunkLength === 0 && chunkType === GLB_CHUNK_JSON) {
      errors.push('GLB JSON chunk is empty');
      break;
    }
    if (offset + chunkLength > bytes.byteLength) {
      errors.push('GLB chunk overflows file byte boundary');
      break;
    }

    const chunkSlice = bytes.subarray(offset, offset + chunkLength);
    if (chunkType === GLB_CHUNK_JSON) {
      if (jsonText !== null) {
        errors.push('Duplicate GLB JSON chunk detected');
      } else {
        jsonText = new TextDecoder('utf-8', { fatal: false }).decode(chunkSlice);
      }
    } else if (chunkType === GLB_CHUNK_BIN) {
      binLength += chunkLength;
    }
    offset += chunkLength;
  }

  if (!jsonText) {
    errors.push('GLB is missing primary glTF JSON chunk');
    return {
      valid: false,
      bytes: bytes.byteLength,
      triangleCount: 0,
      vertexCount: 0,
      meshNames: [],
      materialNames: [],
      boundsMin: [0, 0, 0],
      boundsMax: [0, 0, 0],
      errors,
    };
  }

  if (
    jsonText.includes('"__proto__"') ||
    jsonText.toLowerCase().includes('<script')
  ) {
    errors.push('Forbidden script or prototype pollution key detected inside glTF JSON');
  }

  let gltf: Record<string, unknown>;
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Root glTF JSON must be an object');
    }
    gltf = parsed as Record<string, unknown>;
  } catch (err) {
    errors.push(
      err instanceof Error ? `Malformed glTF JSON: ${err.message}` : 'Malformed glTF JSON',
    );
    return {
      valid: false,
      bytes: bytes.byteLength,
      triangleCount: 0,
      vertexCount: 0,
      meshNames: [],
      materialNames: [],
      boundsMin: [0, 0, 0],
      boundsMax: [0, 0, 0],
      errors,
    };
  }

  const assetMeta = gltf['asset'] as Record<string, unknown> | undefined;
  const gltfVersion = typeof assetMeta?.['version'] === 'string' ? assetMeta['version'] : '';
  if (!gltfVersion.startsWith('2')) {
    errors.push(`Invalid glTF asset.version "${gltfVersion}"`);
  }

  const buffersList = Array.isArray(gltf['buffers']) ? gltf['buffers'] : [];
  for (const buf of buffersList) {
    if (buf && typeof buf === 'object') {
      const uri = (buf as Record<string, unknown>)['uri'];
      if (typeof uri === 'string' && containsExternalUriOrScript(uri)) {
        errors.push(`External/script buffer URI rejected: ${uri}`);
      }
      const declaredBufLen = (buf as Record<string, unknown>)['byteLength'];
      if (
        typeof uri !== 'string' &&
        typeof declaredBufLen === 'number' &&
        declaredBufLen > binLength
      ) {
        errors.push('Embedded glTF buffer exceeds BIN chunk byte length');
      }
    }
  }

  const imagesList = Array.isArray(gltf['images']) ? gltf['images'] : [];
  for (const img of imagesList) {
    if (img && typeof img === 'object') {
      const uri = (img as Record<string, unknown>)['uri'];
      if (typeof uri === 'string' && containsExternalUriOrScript(uri)) {
        errors.push(`External/script image URI rejected: ${uri}`);
      }
    }
  }

  const accessorsList = Array.isArray(gltf['accessors'])
    ? (gltf['accessors'] as Array<Record<string, unknown>>)
    : [];
  const meshesList = Array.isArray(gltf['meshes'])
    ? (gltf['meshes'] as Array<Record<string, unknown>>)
    : [];
  const nodesList = Array.isArray(gltf['nodes'])
    ? (gltf['nodes'] as Array<Record<string, unknown>>)
    : [];
  const materialsList = Array.isArray(gltf['materials'])
    ? (gltf['materials'] as Array<Record<string, unknown>>)
    : [];

  if (meshesList.length === 0) {
    errors.push('GLB must declare at least one mesh');
  }

  const meshNames: string[] = [];
  for (const m of meshesList) {
    if (typeof m['name'] === 'string' && m['name'].trim()) {
      meshNames.push(m['name'].trim());
    }
  }
  const nodeNames = new Set<string>(meshNames);
  for (const n of nodesList) {
    if (typeof n['name'] === 'string' && n['name'].trim()) {
      nodeNames.add(n['name'].trim());
    }
  }

  const materialNames: string[] = [];
  for (const mat of materialsList) {
    if (typeof mat['name'] === 'string' && mat['name'].trim()) {
      materialNames.push(mat['name'].trim());
    }
  }

  let triangleCount = 0;
  let vertexCount = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const mesh of meshesList) {
    const primitives = Array.isArray(mesh['primitives'])
      ? (mesh['primitives'] as Array<Record<string, unknown>>)
      : [];
    for (const prim of primitives) {
      const attrs = prim['attributes'] as Record<string, unknown> | undefined;
      const posAccessorIndex =
        attrs && typeof attrs['POSITION'] === 'number' ? attrs['POSITION'] : -1;
      const posAcc = posAccessorIndex >= 0 ? accessorsList[posAccessorIndex] : undefined;
      const posCount = typeof posAcc?.['count'] === 'number' ? posAcc['count'] : 0;
      vertexCount += posCount;

      if (Array.isArray(posAcc?.['min']) && posAcc['min'].length >= 3) {
        minX = Math.min(minX, Number(posAcc['min'][0]));
        minY = Math.min(minY, Number(posAcc['min'][1]));
        minZ = Math.min(minZ, Number(posAcc['min'][2]));
      }
      if (Array.isArray(posAcc?.['max']) && posAcc['max'].length >= 3) {
        maxX = Math.max(maxX, Number(posAcc['max'][0]));
        maxY = Math.max(maxY, Number(posAcc['max'][1]));
        maxZ = Math.max(maxZ, Number(posAcc['max'][2]));
      }

      const idxAccIndex = typeof prim['indices'] === 'number' ? prim['indices'] : -1;
      const idxAcc = idxAccIndex >= 0 ? accessorsList[idxAccIndex] : undefined;
      if (idxAcc && typeof idxAcc['count'] === 'number') {
        triangleCount += Math.floor(idxAcc['count'] / 3);
      } else if (posCount > 0) {
        triangleCount += Math.floor(posCount / 3);
      }
    }
  }

  if (triangleCount > maxTriangles) {
    errors.push(
      `Triangle count ${triangleCount} exceeds ${profile} limit of ${maxTriangles}`,
    );
  }

  if (options.expectedMaterialSlots) {
    const materialSet = new Set(materialNames);
    for (const slot of options.expectedMaterialSlots) {
      if (!materialSet.has(slot.materialName)) {
        errors.push(
          `Expected material "${slot.materialName}" for slot "${slot.slotId}" missing from GLB`,
        );
      }
      for (const expectedMesh of slot.meshNames) {
        if (!nodeNames.has(expectedMesh)) {
          errors.push(
            `Expected mesh/node "${expectedMesh}" for slot "${slot.slotId}" missing from GLB`,
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    bytes: bytes.byteLength,
    triangleCount,
    vertexCount,
    meshNames,
    materialNames,
    boundsMin: Number.isFinite(minX) ? [minX, minY, minZ] : [0, 0, 0],
    boundsMax: Number.isFinite(maxX) ? [maxX, maxY, maxZ] : [0, 0, 0],
    errors,
  };
}

export function inferSilhouetteFromSlug(slug: string): GarmentSilhouetteInput {
  const lower = slug.toLowerCase();
  if (lower.includes('sneaker') || lower.includes('shoe') || lower.includes('footwear')) {
    return 'sneaker';
  }
  if (lower.includes('trouser') || lower.includes('pant')) {
    return 'trouser';
  }
  if (lower.includes('crossbody') || lower.includes('bag')) {
    return 'crossbody';
  }
  if (lower.includes('overshirt') || lower.includes('coat') || lower.includes('jacket')) {
    return 'overshirt';
  }
  if (lower.includes('shirt') || lower.includes('poplin')) {
    return 'shirt';
  }
  return 'tee';
}

function getCameraBaselineForSilhouette(
  silhouette: GarmentSilhouetteInput,
): Product3DAssetConfigDto['coordinateSystem']['cameraBaseline'] {
  switch (silhouette) {
    case 'sneaker':
      return {
        fovDeg: 35,
        position: [0.46, 0.24, 0.68],
        target: [0, 0.065, 0.015],
        minDistance: 0.36,
        maxDistance: 2.1,
      };
    case 'crossbody':
      return {
        fovDeg: 35,
        position: [0.56, 0.38, 1.26],
        target: [0, 0.28, 0],
        minDistance: 0.5,
        maxDistance: 2.8,
      };
    case 'trouser':
      return {
        fovDeg: 35,
        position: [0.76, 0.62, 1.92],
        target: [0, 0.54, 0],
        minDistance: 0.8,
        maxDistance: 3.8,
      };
    case 'shirt':
    case 'overshirt':
      return {
        fovDeg: 35,
        position: [0.72, 0.56, 1.66],
        target: [0, 0.49, 0],
        minDistance: 0.72,
        maxDistance: 3.4,
      };
    case 'tee':
    default:
      return {
        fovDeg: 35,
        position: [0.68, 0.54, 1.54],
        target: [0, 0.49, 0],
        minDistance: 0.66,
        maxDistance: 3.2,
      };
  }
}

export function buildDefaultAssetConfig(options: {
  readonly silhouette: GarmentSilhouetteInput;
  readonly lightingPreset?: LightingPresetInput;
  readonly materialSlots?: MaterialSlotSpecDto[];
  readonly provenance?: AssetProvenanceDto;
  readonly defaultProfile: { triangles: number; vertices: number; bytes: number };
  readonly liteProfile?: { triangles: number; vertices: number; bytes: number };
}): Product3DAssetConfigDto {
  return {
    schemaVersion: '1.0',
    coordinateSystem: {
      upAxis: 'Y',
      units: 'meters',
      frontAxis: '+Z',
      groundY: 0,
      pivot: [0, 0, 0],
      cameraBaseline: getCameraBaselineForSilhouette(options.silhouette),
    },
    silhouette: options.silhouette,
    lightingPreset: options.lightingPreset ?? 'arven_studio_neutral_v1',
    materialSlots:
      options.materialSlots && options.materialSlots.length > 0
        ? options.materialSlots
        : DEFAULT_ARVEN_MATERIAL_SLOTS.map((slot) => ({
            ...slot,
            meshNames: [...slot.meshNames],
            roughnessRange: [...slot.roughnessRange] as [number, number],
            metalnessRange: [...slot.metalnessRange] as [number, number],
          })),
    qualityProfiles: {
      default: options.defaultProfile,
      ...(options.liteProfile ? { lite: options.liteProfile } : {}),
    },
    provenance: options.provenance ?? DEFAULT_ARVEN_PROVENANCE,
  };
}

function buildPosterArtworkSvg(
  silhouette: GarmentSilhouetteInput | 'mannequin' | 'showroom',
  swatch: string,
): string {
  const accent = '#C5A572';
  const trim = '#E9E4DA';
  switch (silhouette) {
    case 'trouser':
      return `<g transform="translate(260, 215)">
        <path d="M70,12 L310,12 L322,72 L346,620 L212,620 L190,220 L168,620 L34,620 L58,72 Z" fill="${swatch}" stroke="${accent}" stroke-width="2" />
        <line x1="70" y1="54" x2="310" y2="54" stroke="${accent}" stroke-width="1.5" />
        <line x1="122" y1="58" x2="105" y2="612" stroke="${trim}" stroke-width="1" opacity="0.45" />
        <line x1="258" y1="58" x2="275" y2="612" stroke="${trim}" stroke-width="1" opacity="0.45" />
        <circle cx="215" cy="33" r="6" fill="${accent}" />
      </g>`;
    case 'sneaker':
      return `<g transform="translate(175, 395)">
        <path d="M55,215 C55,150 95,120 175,115 L295,62 C345,42 425,48 475,118 L502,215 Z" fill="${swatch}" stroke="${accent}" stroke-width="2" />
        <rect x="46" y="212" width="464" height="44" rx="12" fill="${trim}" stroke="${accent}" stroke-width="1.5" />
        <line x1="56" y1="228" x2="500" y2="228" stroke="#5E5C54" stroke-width="1" stroke-dasharray="6 4" />
        <line x1="240" y1="102" x2="330" y2="78" stroke="${accent}" stroke-width="2" />
        <line x1="255" y1="118" x2="345" y2="94" stroke="${accent}" stroke-width="2" />
      </g>`;
    case 'crossbody':
      return `<g transform="translate(245, 225)">
        <path d="M105,310 C105,40 305,40 305,310" fill="none" stroke="${trim}" stroke-width="14" opacity="0.85" />
        <rect x="75" y="305" width="260" height="220" rx="8" fill="${swatch}" stroke="${accent}" stroke-width="2" />
        <path d="M75,305 L335,305 L335,442 C335,454 325,462 312,462 L98,462 C85,462 75,454 75,442 Z" fill="${swatch}" stroke="${accent}" stroke-width="1.8" />
        <rect x="174" y="446" width="62" height="16" rx="2" fill="${accent}" />
      </g>`;
    case 'shirt':
      return `<g transform="translate(190, 215)">
        <path d="M180,32 L260,12 L340,32 L462,102 L495,435 L425,442 L390,192 L390,565 C330,596 190,596 130,565 L130,192 L95,442 L25,435 L58,102 Z" fill="${swatch}" stroke="${accent}" stroke-width="2" />
        <path d="M214,24 L260,72 L306,24" fill="none" stroke="${accent}" stroke-width="2" />
        <line x1="260" y1="72" x2="260" y2="578" stroke="${trim}" stroke-width="1.2" opacity="0.55" />
      </g>`;
    case 'overshirt':
      return `<g transform="translate(190, 220)">
        <path d="M172,34 L260,16 L348,34 L468,96 L496,432 L422,438 L392,188 L392,545 L128,545 L128,188 L98,438 L24,432 L52,96 Z" fill="${swatch}" stroke="${accent}" stroke-width="2" />
        <rect x="155" y="195" width="76" height="84" fill="none" stroke="${accent}" stroke-width="1.5" />
        <rect x="289" y="195" width="76" height="84" fill="none" stroke="${accent}" stroke-width="1.5" />
        <circle cx="260" cy="145" r="7" fill="${accent}" />
        <circle cx="260" cy="245" r="7" fill="${accent}" />
        <circle cx="260" cy="345" r="7" fill="${accent}" />
        <circle cx="260" cy="445" r="7" fill="${accent}" />
      </g>`;
    case 'showroom':
      return `<g transform="translate(135, 220)">
        <rect x="0" y="0" width="630" height="510" fill="none" stroke="${accent}" stroke-width="1.2" opacity="0.6" />
        <path d="M215,510 L215,195 C215,115 415,115 415,195 L415,510" fill="none" stroke="${accent}" stroke-width="2" />
        <rect x="120" y="335" width="90" height="175" fill="${swatch}" stroke="${accent}" stroke-width="1.5" />
        <rect x="270" y="310" width="90" height="200" fill="${swatch}" stroke="${accent}" stroke-width="1.5" />
        <rect x="420" y="335" width="90" height="175" fill="${swatch}" stroke="${accent}" stroke-width="1.5" />
      </g>`;
    case 'mannequin':
      return `<g transform="translate(310, 190)">
        <ellipse cx="140" cy="52" rx="34" ry="48" fill="${swatch}" stroke="${accent}" stroke-width="1.8" />
        <path d="M72,135 L208,135 L188,335 L210,415 L178,615 L146,615 L140,425 L134,615 L102,615 L70,415 L92,335 Z" fill="${swatch}" stroke="${accent}" stroke-width="1.8" />
        <ellipse cx="140" cy="635" rx="95" ry="16" fill="none" stroke="${accent}" stroke-width="2" />
      </g>`;
    case 'tee':
    default:
      return `<g transform="translate(190, 225)">
        <path d="M174,36 C210,72 310,72 346,36 L448,96 L486,232 L396,265 L380,192 L380,545 L140,545 L140,192 L124,265 L34,232 L72,96 Z" fill="${swatch}" stroke="${accent}" stroke-width="2" />
        <path d="M174,36 C210,82 310,82 346,36" fill="none" stroke="${trim}" stroke-width="5" opacity="0.7" />
        <line x1="140" y1="522" x2="380" y2="522" stroke="${accent}" stroke-width="1" stroke-dasharray="6 5" opacity="0.65" />
      </g>`;
  }
}

/**
 * Generates a refined architectural atelier SVG studio poster for 3D fallback & SSR preview.
 */
export function buildStudioPosterSvg(options: {
  readonly title: string;
  readonly subtitle: string;
  readonly primaryHex?: string;
  readonly silhouette?: GarmentSilhouetteInput | 'mannequin' | 'showroom';
}): string {
  const bg = options.primaryHex && options.primaryHex !== '#F8F7F3' ? '#17191B' : '#26292C';
  const swatch = options.primaryHex ?? '#2B2E31';
  const inferred: GarmentSilhouetteInput | 'mannequin' | 'showroom' =
    options.silhouette ??
    (options.title.toLowerCase().includes('mannequin')
      ? 'mannequin'
      : options.subtitle.toLowerCase().includes('showroom') ||
          options.title.toLowerCase().includes('atrium') ||
          options.title.toLowerCase().includes('galeri') ||
          options.title.toLowerCase().includes('annex')
        ? 'showroom'
        : inferSilhouetteFromSlug(options.title));

  const esc = (raw: string) =>
    raw
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1125" width="900" height="1125" role="img" aria-label="${esc(options.title)}">
  <defs>
    <radialGradient id="arven-studio-glow" cx="50%" cy="44%" r="52%">
      <stop offset="0%" stop-color="#35383A" stop-opacity="0.72" />
      <stop offset="100%" stop-color="${bg}" stop-opacity="1" />
    </radialGradient>
  </defs>
  <rect width="900" height="1125" fill="url(#arven-studio-glow)" />
  <rect x="44" y="44" width="812" height="1037" fill="none" stroke="#C5A572" stroke-width="1.2" opacity="0.65" />
  <line x1="44" y1="152" x2="856" y2="152" stroke="#C5A572" stroke-width="0.75" opacity="0.35" />
  <line x1="44" y1="888" x2="856" y2="888" stroke="#C5A572" stroke-width="0.75" opacity="0.35" />
  <ellipse cx="450" cy="832" rx="235" ry="34" fill="#0B0C0D" opacity="0.62" />
  ${buildPosterArtworkSvg(inferred, swatch)}
  <text x="84" y="108" fill="#C5A572" font-family="sans-serif" font-size="15" letter-spacing="5">ARVEN 3D ATELIER PLATE</text>
  <text x="84" y="952" fill="#F8F7F3" font-family="serif" font-size="34">${esc(options.title)}</text>
  <text x="84" y="998" fill="#B2B0A6" font-family="sans-serif" font-size="18">${esc(options.subtitle)}</text>
  <text x="84" y="1038" fill="#C5A572" font-family="monospace" font-size="13" letter-spacing="3">BEYOND TRENDS. BEYOND TIME.</text>
</svg>`;
}

export const validateGlbBuffer = inspectAndValidateGlbBuffer;
