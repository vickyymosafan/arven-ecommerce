import type {
  AssetProvenanceDto,
  GarmentSilhouetteInput,
  LightingPresetInput,
  MaterialSlotSpecDto,
  Product3DAssetConfigDto,
} from '@arven/contracts';

const GLB_MAGIC_UINT32 = 0x46546c67; // 'glTF'
const GLB_VERSION_2 = 2;
const GLB_CHUNK_JSON = 0x4e4f534a; // 'JSON'
const GLB_CHUNK_BIN = 0x004e4942; // 'BIN\0'

export const GLB_DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
export const GLB_LITE_MAX_BYTES = Math.floor(3.5 * 1024 * 1024);
export const GLB_DEFAULT_MAX_TRIANGLES = 80_000;
export const GLB_LITE_MAX_TRIANGLES = 25_000;

export const DEFAULT_ARVEN_MATERIAL_SLOTS: readonly MaterialSlotSpecDto[] = [
  {
    slotId: 'mat_fabric_primary',
    meshNames: ['mesh_garment_body'],
    materialName: 'mat_fabric_primary',
    customizable: true,
    defaultBaseColorHex: '#17191B',
    roughnessRange: [0.65, 0.95],
    metalnessRange: [0.0, 0.1],
  },
  {
    slotId: 'mat_fabric_secondary',
    meshNames: ['mesh_collar_rib'],
    materialName: 'mat_fabric_secondary',
    customizable: true,
    defaultBaseColorHex: '#35383A',
    roughnessRange: [0.6, 0.95],
    metalnessRange: [0.0, 0.1],
  },
  {
    slotId: 'mat_hardware_accent',
    meshNames: ['mesh_buttons'],
    materialName: 'mat_hardware_accent',
    customizable: false,
    defaultBaseColorHex: '#C5A572',
    roughnessRange: [0.25, 0.55],
    metalnessRange: [0.4, 0.9],
  },
] as const;

export const DEFAULT_ARVEN_PROVENANCE: AssetProvenanceDto = {
  sourceType: 'in_house_cad',
  modelAuthor: 'ARVEN Atelier 3D Team',
  modelLicense: 'ARVEN Proprietary Commercial Asset License v1.0',
  textureLicense: 'CC0-1.0',
  hdriLicense: 'CC0-1.0',
  commercialUseVerified: true,
};

export interface GlbBuildOptions {
  readonly silhouette?: GarmentSilhouetteInput;
  readonly primaryHex?: string;
  readonly secondaryHex?: string;
  readonly accentHex?: string;
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

function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function hexToLinearRgba(hex: string): [number, number, number, number] {
  const clean = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return [0.08, 0.09, 0.1, 1.0];
  }
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255;
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255;
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255;
  return [
    srgbChannelToLinear(r),
    srgbChannelToLinear(g),
    srgbChannelToLinear(b),
    1.0,
  ];
}

interface MeshAccumulator {
  readonly positions: number[];
  readonly normals: number[];
  readonly indices: number[];
}

function createMeshAccumulator(): MeshAccumulator {
  return { positions: [], normals: [], indices: [] };
}

function appendBox(
  acc: MeshAccumulator,
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
): void {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;

  const faces: ReadonlyArray<{
    readonly normal: [number, number, number];
    readonly corners: ReadonlyArray<[number, number, number]>;
  }> = [
    // +Z front
    {
      normal: [0, 0, 1],
      corners: [
        [cx - hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz + hz],
        [cx + hx, cy + hy, cz + hz],
        [cx - hx, cy + hy, cz + hz],
      ],
    },
    // -Z back
    {
      normal: [0, 0, -1],
      corners: [
        [cx + hx, cy - hy, cz - hz],
        [cx - hx, cy - hy, cz - hz],
        [cx - hx, cy + hy, cz - hz],
        [cx + hx, cy + hy, cz - hz],
      ],
    },
    // +X right
    {
      normal: [1, 0, 0],
      corners: [
        [cx + hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz - hz],
        [cx + hx, cy + hy, cz - hz],
        [cx + hx, cy + hy, cz + hz],
      ],
    },
    // -X left
    {
      normal: [-1, 0, 0],
      corners: [
        [cx - hx, cy - hy, cz - hz],
        [cx - hx, cy - hy, cz + hz],
        [cx - hx, cy + hy, cz + hz],
        [cx - hx, cy + hy, cz - hz],
      ],
    },
    // +Y top
    {
      normal: [0, 1, 0],
      corners: [
        [cx - hx, cy + hy, cz + hz],
        [cx + hx, cy + hy, cz + hz],
        [cx + hx, cy + hy, cz - hz],
        [cx - hx, cy + hy, cz - hz],
      ],
    },
    // -Y bottom
    {
      normal: [0, -1, 0],
      corners: [
        [cx - hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz + hz],
        [cx - hx, cy - hy, cz + hz],
      ],
    },
  ];

  for (const face of faces) {
    const baseVertex = acc.positions.length / 3;
    for (const [vx, vy, vz] of face.corners) {
      acc.positions.push(vx, vy, vz);
      acc.normals.push(face.normal[0], face.normal[1], face.normal[2]);
    }
    acc.indices.push(
      baseVertex,
      baseVertex + 1,
      baseVertex + 2,
      baseVertex,
      baseVertex + 2,
      baseVertex + 3,
    );
  }
}

function buildSilhouetteParts(silhouette: GarmentSilhouetteInput, lite: boolean): {
  readonly body: MeshAccumulator;
  readonly secondary: MeshAccumulator;
  readonly hardware: MeshAccumulator;
} {
  const body = createMeshAccumulator();
  const secondary = createMeshAccumulator();
  const hardware = createMeshAccumulator();

  if (silhouette === 'trouser') {
    // Wide-leg double-pleated trouser centered at y=[0, 1.05]
    appendBox(body, -0.13, 0.45, 0, 0.21, 0.9, 0.19);
    appendBox(body, 0.13, 0.45, 0, 0.21, 0.9, 0.19);
    appendBox(body, 0, 0.92, 0, 0.44, 0.16, 0.2);
    appendBox(secondary, 0, 1.02, 0, 0.45, 0.06, 0.21);
    appendBox(hardware, 0.05, 1.02, 0.11, 0.04, 0.04, 0.02);
  } else if (silhouette === 'sneaker') {
    // Minimalist low-profile leather court sneaker resting on y=0
    appendBox(secondary, 0, 0.035, 0, 0.22, 0.07, 0.52);
    appendBox(body, 0, 0.11, 0.02, 0.2, 0.11, 0.48);
    appendBox(body, 0, 0.18, -0.09, 0.18, 0.08, 0.24);
    const eyeletCount = lite ? 3 : 5;
    for (let i = 0; i < eyeletCount; i += 1) {
      const z = -0.02 + i * 0.045;
      appendBox(hardware, -0.045, 0.19, z, 0.018, 0.012, 0.018);
      appendBox(hardware, 0.045, 0.19, z, 0.018, 0.012, 0.018);
    }
  } else if (silhouette === 'crossbody') {
    // Architectural structured calfskin crossbody bag
    appendBox(body, 0, 0.26, 0, 0.44, 0.34, 0.15);
    appendBox(body, 0, 0.3, 0.082, 0.43, 0.22, 0.025);
    appendBox(secondary, 0, 0.56, 0, 0.48, 0.04, 0.05);
    appendBox(secondary, -0.225, 0.41, 0, 0.035, 0.3, 0.05);
    appendBox(secondary, 0.225, 0.41, 0, 0.035, 0.3, 0.05);
    appendBox(hardware, 0, 0.21, 0.1, 0.06, 0.045, 0.02);
  } else if (silhouette === 'overshirt' || silhouette === 'shirt') {
    // Tailored boxy overshirt / poplin shirt
    appendBox(body, 0, 0.46, 0, 0.54, 0.72, 0.22);
    appendBox(body, -0.36, 0.53, 0, 0.17, 0.56, 0.17);
    appendBox(body, 0.36, 0.53, 0, 0.17, 0.56, 0.17);
    appendBox(secondary, 0, 0.85, 0, 0.24, 0.08, 0.19);
    if (!lite) {
      appendBox(secondary, -0.13, 0.56, 0.118, 0.14, 0.16, 0.02);
      appendBox(secondary, 0.13, 0.56, 0.118, 0.14, 0.16, 0.02);
    }
    const buttonCount = lite ? 3 : 5;
    for (let i = 0; i < buttonCount; i += 1) {
      appendBox(hardware, 0, 0.74 - i * 0.13, 0.118, 0.026, 0.026, 0.018);
    }
  } else {
    // Heavyweight crew tee
    appendBox(body, 0, 0.45, 0, 0.52, 0.68, 0.2);
    appendBox(body, -0.35, 0.64, 0, 0.2, 0.22, 0.17);
    appendBox(body, 0.35, 0.64, 0, 0.2, 0.22, 0.17);
    appendBox(secondary, 0, 0.81, 0, 0.24, 0.055, 0.18);
    appendBox(hardware, -0.06, 0.16, 0.105, 0.09, 0.024, 0.012);
  }

  return { body, secondary, hardware };
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

/**
 * Builds a deterministic, strictly spec-compliant binary glTF 2.0 (.glb) buffer
 * containing ARVEN's canonical named mesh and material slots (`mat_fabric_primary`,
 * `mat_fabric_secondary`, `mat_hardware_accent`) for both worker verification and WebGL rendering.
 */
export function buildArvenGarmentGlbBuffer(options: GlbBuildOptions = {}): Uint8Array {
  const silhouette = options.silhouette ?? 'tee';
  const lite = options.profile === 'lite';
  const parts = buildSilhouetteParts(silhouette, lite);

  const partEntries = [
    {
      nodeName: 'mesh_garment_body',
      meshName: 'mesh_garment_body',
      materialName: 'mat_fabric_primary',
      baseColorFactor: hexToLinearRgba(options.primaryHex ?? '#17191B'),
      roughnessFactor: 0.85,
      metallicFactor: 0.02,
      acc: parts.body,
    },
    {
      nodeName: 'mesh_collar_rib',
      meshName: 'mesh_collar_rib',
      materialName: 'mat_fabric_secondary',
      baseColorFactor: hexToLinearRgba(options.secondaryHex ?? '#35383A'),
      roughnessFactor: silhouette === 'sneaker' ? 0.68 : 0.88,
      metallicFactor: 0.02,
      acc: parts.secondary,
    },
    {
      nodeName: 'mesh_buttons',
      meshName: 'mesh_buttons',
      materialName: 'mat_hardware_accent',
      baseColorFactor: hexToLinearRgba(options.accentHex ?? '#C5A572'),
      roughnessFactor: 0.34,
      metallicFactor: 0.72,
      acc: parts.hardware,
    },
  ] as const;

  const bufferViews: Array<Record<string, unknown>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  const materials: Array<Record<string, unknown>> = [];
  const meshes: Array<Record<string, unknown>> = [];
  const nodes: Array<Record<string, unknown>> = [];

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

  for (const [index, entry] of partEntries.entries()) {
    const posArray = new Float32Array(entry.acc.positions);
    const normArray = new Float32Array(entry.acc.normals);
    const idxArray = new Uint16Array(entry.acc.indices);

    const posSeg = appendBinSegment(
      new Uint8Array(posArray.buffer, posArray.byteOffset, posArray.byteLength),
    );
    const normSeg = appendBinSegment(
      new Uint8Array(normArray.buffer, normArray.byteOffset, normArray.byteLength),
    );
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
      count: entry.acc.positions.length / 3,
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

    const idxAccIdx = accessors.length;
    accessors.push({
      bufferView: idxViewIdx,
      byteOffset: 0,
      componentType: 5123, // UNSIGNED_SHORT
      count: entry.acc.indices.length,
      type: 'SCALAR',
    });

    materials.push({
      name: entry.materialName,
      doubleSided: false,
      pbrMetallicRoughness: {
        baseColorFactor: entry.baseColorFactor,
        metallicFactor: entry.metallicFactor,
        roughnessFactor: entry.roughnessFactor,
      },
    });

    meshes.push({
      name: entry.meshName,
      primitives: [
        {
          attributes: {
            POSITION: posAccIdx,
            NORMAL: normAccIdx,
          },
          indices: idxAccIdx,
          material: index,
        },
      ],
    });

    nodes.push({
      name: entry.nodeName,
      mesh: index,
    });
  }

  const gltfJson = {
    asset: {
      version: '2.0',
      generator: 'ARVEN Atelier GLB Builder v1.0',
    },
    scene: 0,
    scenes: [
      {
        name: 'arven_garment_stage',
        nodes: nodes.map((_, idx) => idx),
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
  // glTF spec requires space padding (0x20) in JSON chunk
  for (let i = jsonRawBytes.byteLength; i < jsonAlignedLength; i += 1) {
    jsonChunkBytes[i] = 0x20;
  }

  const totalLength = 12 + 8 + jsonChunkBytes.byteLength + 8 + binOffset;
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);

  // Header
  view.setUint32(0, GLB_MAGIC_UINT32, true);
  view.setUint32(4, GLB_VERSION_2, true);
  view.setUint32(8, totalLength, true);

  // JSON Chunk
  view.setUint32(12, jsonChunkBytes.byteLength, true);
  view.setUint32(16, GLB_CHUNK_JSON, true);
  output.set(jsonChunkBytes, 20);

  // BIN Chunk
  const binHeaderOffset = 20 + jsonChunkBytes.byteLength;
  view.setUint32(binHeaderOffset, binOffset, true);
  view.setUint32(binHeaderOffset + 4, GLB_CHUNK_BIN, true);

  let writeCursor = binHeaderOffset + 8;
  for (const chunk of binChunks) {
    output.set(chunk, writeCursor);
    writeCursor += chunk.byteLength;
  }

  return output;
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
  const headText = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 512))).toLowerCase();
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
      cameraBaseline: {
        fovDeg: 35,
        position:
          options.silhouette === 'sneaker' || options.silhouette === 'crossbody'
            ? [0.75, 0.45, 1.35]
            : [0.85, 0.65, 2.05],
        target:
          options.silhouette === 'sneaker'
            ? [0, 0.12, 0]
            : options.silhouette === 'crossbody'
              ? [0, 0.3, 0]
              : [0, 0.46, 0],
        minDistance: 0.75,
        maxDistance: 4.5,
      },
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

/**
 * Generates an architectural SVG poster buffer (or deterministic studio card) for 3D fallback.
 */
export function buildStudioPosterSvg(options: {
  readonly title: string;
  readonly subtitle: string;
  readonly primaryHex?: string;
}): string {
  const bg = options.primaryHex && options.primaryHex !== '#F8F7F3' ? '#17191B' : '#35383A';
  const swatch = options.primaryHex ?? '#17191B';
  const esc = (raw: string) =>
    raw
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1125" width="900" height="1125" role="img" aria-label="${esc(options.title)}">
  <rect width="900" height="1125" fill="${bg}" />
  <rect x="48" y="48" width="804" height="1029" fill="none" stroke="#C5A572" stroke-width="1.5" opacity="0.7" />
  <ellipse cx="450" cy="835" rx="220" ry="38" fill="#0D0E10" opacity="0.55" />
  <rect x="265" y="255" width="370" height="515" fill="${swatch}" stroke="#C5A572" stroke-width="2" />
  <rect x="385" y="235" width="130" height="44" fill="#35383A" stroke="#F8F7F3" stroke-width="1" />
  <text x="90" y="122" fill="#C5A572" font-family="sans-serif" font-size="16" letter-spacing="5">ARVEN 3D STUDIO POSTER</text>
  <text x="90" y="965" fill="#F8F7F3" font-family="serif" font-size="34">${esc(options.title)}</text>
  <text x="90" y="1010" fill="#B2B0A6" font-family="sans-serif" font-size="18">${esc(options.subtitle)}</text>
</svg>`;
}
