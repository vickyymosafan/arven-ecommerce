export type Vec3 = readonly [number, number, number];
export type LinearRgba = readonly [number, number, number, number];

export interface SculptMeshAccumulator {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly colors: number[];
  readonly indices: number[];
}

export function createSculptAccumulator(): SculptMeshAccumulator {
  return {
    positions: [],
    normals: [],
    uvs: [],
    colors: [],
    indices: [],
  };
}

export function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function hexToLinearRgba(hex: string): LinearRgba {
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

export function shadeLinearColor(color: LinearRgba, factor: number): LinearRgba {
  const f = Math.max(0.08, Math.min(1.25, factor));
  return [
    Math.min(1, color[0] * f),
    Math.min(1, color[1] * f),
    Math.min(1, color[2] * f),
    color[3],
  ];
}

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const len = Math.hypot(x, y, z);
  if (len < 1e-8) return [0, 1, 0];
  return [x / len, y / len, z / len];
}

function cross3(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): [number, number, number] {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

function pushVertex(
  acc: SculptMeshAccumulator,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  u: number,
  v: number,
  color: LinearRgba,
): number {
  const idx = acc.positions.length / 3;
  acc.positions.push(x, y, z);
  acc.normals.push(nx, ny, nz);
  acc.uvs.push(u, v);
  acc.colors.push(color[0], color[1], color[2], color[3]);
  return idx;
}

export interface LoftRing {
  readonly points: ReadonlyArray<Vec3>;
  readonly vCoord: number;
  readonly uScale?: number;
  readonly aoFactors?: ReadonlyArray<number>;
  readonly ringAo?: number;
}

export interface LoftTubeOptions {
  readonly closedCircumference?: boolean;
  readonly invertWinding?: boolean;
  readonly color?: LinearRgba;
  readonly uRepeat?: number;
  readonly capTop?: boolean;
  readonly capBottom?: boolean;
  readonly topCapAo?: number;
  readonly bottomCapAo?: number;
  /** Adds a realistic turned-in fabric thickness hem/lip at the top ring (in meters). */
  readonly topLipInset?: number;
  readonly topLipDepth?: number;
  /** Adds a realistic turned-in fabric thickness hem/lip at the bottom ring (in meters). */
  readonly bottomLipInset?: number;
  readonly bottomLipDepth?: number;
}

function computeRingCenter(points: ReadonlyArray<Vec3>): [number, number, number] {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const p of points) {
    sx += p[0];
    sy += p[1];
    sz += p[2];
  }
  const n = Math.max(1, points.length);
  return [sx / n, sy / n, sz / n];
}

/**
 * Generates a smooth, UV-mapped, vertex-AO shaded lofted 3D surface from ordered cross-section rings.
 * Rings must wind with increasing angle theta where x = cos(theta), z = sin(theta) and ascending ring index.
 */
export function appendLoftedSurface(
  acc: SculptMeshAccumulator,
  inputRings: ReadonlyArray<LoftRing>,
  options: LoftTubeOptions = {},
): void {
  if (inputRings.length < 2) return;
  const closed = options.closedCircumference ?? true;
  const invert = options.invertWinding ?? false;
  const baseColor: LinearRgba = options.color ?? [1, 1, 1, 1];
  const uRepeat = options.uRepeat ?? 1.0;

  // Optionally synthesize turned-in thickness lip rings at top and/or bottom
  const rings: LoftRing[] = [];

  if (options.bottomLipInset && options.bottomLipInset > 0) {
    const first = inputRings[0]!;
    const [cx, , cz] = computeRingCenter(first.points);
    const depth = options.bottomLipDepth ?? options.bottomLipInset * 1.6;
    const insetPts = first.points.map(([px, py, pz]): Vec3 => {
      const dx = px - cx;
      const dz = pz - cz;
      const d = Math.hypot(dx, dz) || 1;
      const shrink = Math.max(0.2, (d - options.bottomLipInset!) / d);
      return [cx + dx * shrink, py + depth, cz + dz * shrink];
    });
    const edgePts = first.points.map(([px, py, pz]): Vec3 => {
      const dx = px - cx;
      const dz = pz - cz;
      const d = Math.hypot(dx, dz) || 1;
      const shrink = Math.max(0.2, (d - options.bottomLipInset! * 0.45) / d);
      return [cx + dx * shrink, py - options.bottomLipInset! * 0.15, cz + dz * shrink];
    });
    rings.push({
      points: insetPts,
      vCoord: first.vCoord - 0.04,
      ringAo: (first.ringAo ?? 1) * 0.48,
    });
    rings.push({
      points: edgePts,
      vCoord: first.vCoord - 0.015,
      ringAo: (first.ringAo ?? 1) * 0.72,
    });
  }

  for (const r of inputRings) {
    rings.push(r);
  }

  if (options.topLipInset && options.topLipInset > 0) {
    const last = inputRings[inputRings.length - 1]!;
    const [cx, , cz] = computeRingCenter(last.points);
    const depth = options.topLipDepth ?? options.topLipInset * 1.6;
    const edgePts = last.points.map(([px, py, pz]): Vec3 => {
      const dx = px - cx;
      const dz = pz - cz;
      const d = Math.hypot(dx, dz) || 1;
      const shrink = Math.max(0.2, (d - options.topLipInset! * 0.45) / d);
      return [cx + dx * shrink, py + options.topLipInset! * 0.15, cz + dz * shrink];
    });
    const insetPts = last.points.map(([px, py, pz]): Vec3 => {
      const dx = px - cx;
      const dz = pz - cz;
      const d = Math.hypot(dx, dz) || 1;
      const shrink = Math.max(0.2, (d - options.topLipInset!) / d);
      return [cx + dx * shrink, py - depth, cz + dz * shrink];
    });
    rings.push({
      points: edgePts,
      vCoord: last.vCoord + 0.015,
      ringAo: (last.ringAo ?? 1) * 0.76,
    });
    rings.push({
      points: insetPts,
      vCoord: last.vCoord + 0.04,
      ringAo: (last.ringAo ?? 1) * 0.45,
    });
  }

  const rowCount = rings.length;
  const colCount = rings[0]!.points.length;
  if (colCount < 2) return;

  const stride = closed ? colCount + 1 : colCount;
  const vertexCount = rowCount * stride;

  // Accumulate smooth vertex normals
  const accumNormals = new Float32Array(vertexCount * 3);

  const getPt = (r: number, c: number): Vec3 => {
    const wrapped = closed ? c % colCount : Math.min(colCount - 1, Math.max(0, c));
    return rings[r]!.points[wrapped]!;
  };

  const addTriNormal = (
    i0: number,
    i1: number,
    i2: number,
    p0: Vec3,
    p1: Vec3,
    p2: Vec3,
  ) => {
    const e1x = p1[0] - p0[0];
    const e1y = p1[1] - p0[1];
    const e1z = p1[2] - p0[2];
    const e2x = p2[0] - p0[0];
    const e2y = p2[1] - p0[1];
    const e2z = p2[2] - p0[2];
    const [nx, ny, nz] = cross3(e1x, e1y, e1z, e2x, e2y, e2z);
    accumNormals[i0 * 3]! += nx;
    accumNormals[i0 * 3 + 1]! += ny;
    accumNormals[i0 * 3 + 2]! += nz;
    accumNormals[i1 * 3]! += nx;
    accumNormals[i1 * 3 + 1]! += ny;
    accumNormals[i1 * 3 + 2]! += nz;
    accumNormals[i2 * 3]! += nx;
    accumNormals[i2 * 3 + 1]! += ny;
    accumNormals[i2 * 3 + 2]! += nz;
  };

  const localIndices: number[] = [];
  const segCols = closed ? colCount : colCount - 1;

  for (let r = 0; r < rowCount - 1; r += 1) {
    for (let c = 0; c < segCols; c += 1) {
      const i00 = r * stride + c;
      const i10 = (r + 1) * stride + c;
      const i01 = r * stride + (c + 1);
      const i11 = (r + 1) * stride + (c + 1);

      const p00 = getPt(r, c);
      const p10 = getPt(r + 1, c);
      const p01 = getPt(r, c + 1);
      const p11 = getPt(r + 1, c + 1);

      if (!invert) {
        localIndices.push(i00, i10, i11, i00, i11, i01);
        addTriNormal(i00, i10, i11, p00, p10, p11);
        addTriNormal(i00, i11, i01, p00, p11, p01);
      } else {
        localIndices.push(i00, i11, i10, i00, i01, i11);
        addTriNormal(i00, i11, i10, p00, p11, p10);
        addTriNormal(i00, i01, i11, p00, p01, p11);
      }
    }
  }

  // Seam weld normals across closed circumference so there is zero visible lighting seam
  if (closed) {
    for (let r = 0; r < rowCount; r += 1) {
      const firstIdx = r * stride;
      const lastIdx = r * stride + colCount;
      const nx = (accumNormals[firstIdx * 3] ?? 0) + (accumNormals[lastIdx * 3] ?? 0);
      const ny =
        (accumNormals[firstIdx * 3 + 1] ?? 0) + (accumNormals[lastIdx * 3 + 1] ?? 0);
      const nz =
        (accumNormals[firstIdx * 3 + 2] ?? 0) + (accumNormals[lastIdx * 3 + 2] ?? 0);
      accumNormals[firstIdx * 3] = nx;
      accumNormals[firstIdx * 3 + 1] = ny;
      accumNormals[firstIdx * 3 + 2] = nz;
      accumNormals[lastIdx * 3] = nx;
      accumNormals[lastIdx * 3 + 1] = ny;
      accumNormals[lastIdx * 3 + 2] = nz;
    }
  }

  const baseVertex = acc.positions.length / 3;

  for (let r = 0; r < rowCount; r += 1) {
    const ring = rings[r]!;
    const uScale = ring.uScale ?? uRepeat;
    const ringAo = ring.ringAo ?? 1.0;

    for (let c = 0; c < stride; c += 1) {
      const wrapped = closed ? c % colCount : c;
      const pt = ring.points[wrapped]!;
      const localIdx = r * stride + c;
      const [nx, ny, nz] = normalize3(
        accumNormals[localIdx * 3] ?? 0,
        accumNormals[localIdx * 3 + 1] ?? 1,
        accumNormals[localIdx * 3 + 2] ?? 0,
      );
      const u = (c / Math.max(1, segCols)) * uScale;
      const v = ring.vCoord;
      const pointAo = ring.aoFactors?.[wrapped] ?? 1.0;
      const shade = shadeLinearColor(baseColor, ringAo * pointAo);
      pushVertex(acc, pt[0], pt[1], pt[2], nx, ny, nz, u, v, shade);
    }
  }

  for (const li of localIndices) {
    acc.indices.push(baseVertex + li);
  }

  if (options.capTop && closed) {
    const topRing = rings[rowCount - 1]!;
    const [cx, cy, cz] = computeRingCenter(topRing.points);
    const capColor = shadeLinearColor(baseColor, options.topCapAo ?? 0.96);
    const centerIdx = pushVertex(acc, cx, cy, cz, 0, invert ? -1 : 1, 0, 0.5, 0.5, capColor);
    const startIdx = acc.positions.length / 3;
    for (let c = 0; c <= colCount; c += 1) {
      const pt = topRing.points[c % colCount]!;
      const u = 0.5 + (pt[0] - cx) * 2.5;
      const v = 0.5 + (pt[2] - cz) * 2.5;
      pushVertex(acc, pt[0], pt[1], pt[2], 0, invert ? -1 : 1, 0, u, v, capColor);
    }
    for (let c = 0; c < colCount; c += 1) {
      if (!invert) {
        acc.indices.push(centerIdx, startIdx + c + 1, startIdx + c);
      } else {
        acc.indices.push(centerIdx, startIdx + c, startIdx + c + 1);
      }
    }
  }

  if (options.capBottom && closed) {
    const botRing = rings[0]!;
    const [cx, cy, cz] = computeRingCenter(botRing.points);
    const capColor = shadeLinearColor(baseColor, options.bottomCapAo ?? 0.65);
    const centerIdx = pushVertex(acc, cx, cy, cz, 0, invert ? 1 : -1, 0, 0.5, 0.5, capColor);
    const startIdx = acc.positions.length / 3;
    for (let c = 0; c <= colCount; c += 1) {
      const pt = botRing.points[c % colCount]!;
      const u = 0.5 + (pt[0] - cx) * 2.5;
      const v = 0.5 + (pt[2] - cz) * 2.5;
      pushVertex(acc, pt[0], pt[1], pt[2], 0, invert ? 1 : -1, 0, u, v, capColor);
    }
    for (let c = 0; c < colCount; c += 1) {
      if (!invert) {
        acc.indices.push(centerIdx, startIdx + c, startIdx + c + 1);
      } else {
        acc.indices.push(centerIdx, startIdx + c + 1, startIdx + c);
      }
    }
  }
}

export interface SweptTubeOptions {
  readonly radialSegments?: number;
  readonly aspectRatio?: number; // >1 flattens tube into ribbon/strap/lace
  readonly color?: LinearRgba;
  readonly capEnds?: boolean;
  readonly uvScale?: number;
  readonly aoFactor?: number;
}

/**
 * Sweeps a circular or flat ribbon cross-section along an arbitrary 3D polyline
 * using a twist-free parallel transport frame. Ideal for sleeves, straps, laces, and seam piping.
 */
export function appendSweptTube(
  acc: SculptMeshAccumulator,
  path: ReadonlyArray<Vec3>,
  radiusAt: (t: number) => number,
  options: SweptTubeOptions = {},
): void {
  if (path.length < 2) return;
  const radialSegs = Math.max(6, options.radialSegments ?? 12);
  const aspect = options.aspectRatio ?? 1.0;
  const color = options.color ?? [1, 1, 1, 1];
  const uvScale = options.uvScale ?? 3.5;
  const aoFactor = options.aoFactor ?? 1.0;

  const tangents: Array<[number, number, number]> = [];
  for (let i = 0; i < path.length; i += 1) {
    const prev = path[Math.max(0, i - 1)]!;
    const next = path[Math.min(path.length - 1, i + 1)]!;
    tangents.push(normalize3(next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]));
  }

  // Initial perpendicular frame
  const t0 = tangents[0]!;
  const ref: [number, number, number] =
    Math.abs(t0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let normal = normalize3(...cross3(t0[0], t0[1], t0[2], ref[0], ref[1], ref[2]));
  let binormal = normalize3(
    ...cross3(t0[0], t0[1], t0[2], normal[0], normal[1], normal[2]),
  );

  const rings: LoftRing[] = [];
  let accumLen = 0;

  for (let i = 0; i < path.length; i += 1) {
    const p = path[i]!;
    if (i > 0) {
      const prev = path[i - 1]!;
      accumLen += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
      const ti = tangents[i]!;
      // Parallel transport previous normal to stay perpendicular to ti
      const dot = normal[0] * ti[0] + normal[1] * ti[1] + normal[2] * ti[2];
      normal = normalize3(
        normal[0] - dot * ti[0],
        normal[1] - dot * ti[1],
        normal[2] - dot * ti[2],
      );
      binormal = normalize3(
        ...cross3(ti[0], ti[1], ti[2], normal[0], normal[1], normal[2]),
      );
    }

    const t = i / (path.length - 1);
    const r = radiusAt(t);
    const rx = r * aspect;
    const ry = r / Math.max(1, Math.sqrt(aspect));
    const pts: Vec3[] = [];
    for (let s = 0; s < radialSegs; s += 1) {
      const theta = (s / radialSegs) * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      pts.push([
        p[0] + normal[0] * cos * rx + binormal[0] * sin * ry,
        p[1] + normal[1] * cos * rx + binormal[1] * sin * ry,
        p[2] + normal[2] * cos * rx + binormal[2] * sin * ry,
      ]);
    }
    rings.push({
      points: pts,
      vCoord: accumLen * uvScale,
      ringAo: aoFactor,
    });
  }

  // Note: because cross(tangent, normal) = binormal, winding around (cos*normal + sin*binormal)
  // produces outward normals with invertWinding = true.
  appendLoftedSurface(acc, rings, {
    closedCircumference: true,
    invertWinding: true,
    color,
    uRepeat: 1.0,
    capTop: options.capEnds ?? true,
    capBottom: options.capEnds ?? true,
  });
}

/**
 * Builds an architectural beveled cuboid with chamfered vertical and horizontal edges,
 * proper world-scale UVs, and baked vertical ambient occlusion.
 */
export function appendBeveledBox(
  acc: SculptMeshAccumulator,
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  bevelRaw = 0.008,
  color: LinearRgba = [1, 1, 1, 1],
  rotY = 0,
): void {
  const b = Math.max(0, Math.min(bevelRaw, sx * 0.28, sy * 0.28, sz * 0.28));
  const cosR = Math.cos(rotY);
  const sinR = Math.sin(rotY);

  const tx = (lx: number, ly: number, lz: number): Vec3 => [
    cx + lx * cosR + lz * sinR,
    cy + ly,
    cz - lx * sinR + lz * cosR,
  ];

  if (b < 1e-4) {
    appendBoxUv(acc, cx, cy, cz, sx, sy, sz, color, rotY);
    return;
  }

  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;

  const makeRectRing = (
    y: number,
    rx: number,
    rz: number,
    cornerCut: number,
    vCoord: number,
    ao: number,
  ): LoftRing => {
    const ix = Math.max(1e-4, rx - cornerCut);
    const iz = Math.max(1e-4, rz - cornerCut);
    // Ordered in +theta CCW (x=cos, z=sin): (+x, +z) -> (-x, +z) -> (-x, -z) -> (+x, -z)
    const local: Vec3[] = [
      [rx, y, iz],
      [ix, y, rz],
      [-ix, y, rz],
      [-rx, y, iz],
      [-rx, y, -iz],
      [-ix, y, -rz],
      [ix, y, -rz],
      [rx, y, -iz],
    ];
    return {
      points: local.map(([lx, ly, lz]) => tx(lx, ly, lz)),
      vCoord,
      ringAo: ao,
    };
  };

  const rings: LoftRing[] = [
    makeRectRing(-hy, hx - b * 0.85, hz - b * 0.85, b * 0.7, 0, 0.74),
    makeRectRing(-hy + b, hx, hz, b, b * 2, 0.86),
    makeRectRing(hy - b, hx, hz, b, (sy - b) * 2, 0.96),
    makeRectRing(hy, hx - b * 0.85, hz - b * 0.85, b * 0.7, sy * 2, 1.0),
  ];

  appendLoftedSurface(acc, rings, {
    closedCircumference: true,
    color,
    uRepeat: Math.max(1, (sx + sz) * 2),
    capTop: true,
    capBottom: true,
    topCapAo: 1.0,
    bottomCapAo: 0.68,
  });
}

/**
 * Fast sharp UV-mapped cuboid for recessed trim strips, glass planes, and crisp architectural slabs.
 */
export function appendBoxUv(
  acc: SculptMeshAccumulator,
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  color: LinearRgba = [1, 1, 1, 1],
  rotY = 0,
): void {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const cosR = Math.cos(rotY);
  const sinR = Math.sin(rotY);

  const xformPos = (lx: number, ly: number, lz: number): Vec3 => [
    cx + lx * cosR + lz * sinR,
    cy + ly,
    cz - lx * sinR + lz * cosR,
  ];
  const xformNorm = (nx: number, ny: number, nz: number): Vec3 => [
    nx * cosR + nz * sinR,
    ny,
    -nx * sinR + nz * cosR,
  ];

  const faces: ReadonlyArray<{
    readonly normal: Vec3;
    readonly corners: ReadonlyArray<readonly [Vec3, readonly [number, number]]>;
    readonly shade: number;
  }> = [
    {
      normal: [0, 0, 1],
      shade: 0.94,
      corners: [
        [[-hx, -hy, hz], [0, 0]],
        [[hx, -hy, hz], [sx, 0]],
        [[hx, hy, hz], [sx, sy]],
        [[-hx, hy, hz], [0, sy]],
      ],
    },
    {
      normal: [0, 0, -1],
      shade: 0.86,
      corners: [
        [[hx, -hy, -hz], [0, 0]],
        [[-hx, -hy, -hz], [sx, 0]],
        [[-hx, hy, -hz], [sx, sy]],
        [[hx, hy, -hz], [0, sy]],
      ],
    },
    {
      normal: [1, 0, 0],
      shade: 0.9,
      corners: [
        [[hx, -hy, hz], [0, 0]],
        [[hx, -hy, -hz], [sz, 0]],
        [[hx, hy, -hz], [sz, sy]],
        [[hx, hy, hz], [0, sy]],
      ],
    },
    {
      normal: [-1, 0, 0],
      shade: 0.88,
      corners: [
        [[-hx, -hy, -hz], [0, 0]],
        [[-hx, -hy, hz], [sz, 0]],
        [[-hx, hy, hz], [sz, sy]],
        [[-hx, hy, -hz], [0, sy]],
      ],
    },
    {
      normal: [0, 1, 0],
      shade: 1.0,
      corners: [
        [[-hx, hy, hz], [0, 0]],
        [[hx, hy, hz], [sx, 0]],
        [[hx, hy, -hz], [sx, sz]],
        [[-hx, hy, -hz], [0, sz]],
      ],
    },
    {
      normal: [0, -1, 0],
      shade: 0.65,
      corners: [
        [[-hx, -hy, -hz], [0, 0]],
        [[hx, -hy, -hz], [sx, 0]],
        [[hx, -hy, hz], [sx, sz]],
        [[-hx, -hy, hz], [0, sz]],
      ],
    },
  ];

  for (const face of faces) {
    const baseVertex = acc.positions.length / 3;
    const [nx, ny, nz] = xformNorm(...face.normal);
    const c = shadeLinearColor(color, face.shade);
    for (const [pos, [u, v]] of face.corners) {
      const [vx, vy, vz] = xformPos(...pos);
      pushVertex(acc, vx, vy, vz, nx, ny, nz, u, v, c);
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

/**
 * Smooth UV-mapped ellipsoid with optional organic vertex deformation callback.
 */
export function appendSculptedEllipsoid(
  acc: SculptMeshAccumulator,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number,
  latSegs: number,
  lonSegs: number,
  color: LinearRgba = [1, 1, 1, 1],
  deform?: (
    nx: number,
    ny: number,
    nz: number,
    theta: number,
    phi: number,
  ) => readonly [number, number, number, number?],
): void {
  const rings: LoftRing[] = [];
  for (let lat = 0; lat <= latSegs; lat += 1) {
    // Clamp slightly away from degenerate poles for clean normals
    const phi = 0.03 + (lat / latSegs) * (Math.PI - 0.06);
    const sinPhi = Math.sin(phi);
    const cosPhi = -Math.cos(phi); // -1 bottom to +1 top
    const pts: Vec3[] = [];
    const aoFactors: number[] = [];

    for (let lon = 0; lon < lonSegs; lon += 1) {
      const theta = (lon / lonSegs) * Math.PI * 2;
      const ux = sinPhi * Math.cos(theta);
      const uy = cosPhi;
      const uz = sinPhi * Math.sin(theta);

      if (deform) {
        const [dx, dy, dz, ao] = deform(ux, uy, uz, theta, phi);
        pts.push([cx + dx * rx, cy + dy * ry, cz + dz * rz]);
        aoFactors.push(ao ?? 0.85 + 0.15 * Math.max(0, uy));
      } else {
        pts.push([cx + ux * rx, cy + uy * ry, cz + uz * rz]);
        aoFactors.push(0.84 + 0.16 * Math.max(0, uy));
      }
    }

    rings.push({
      points: pts,
      vCoord: lat / latSegs,
      aoFactors,
    });
  }

  appendLoftedSurface(acc, rings, {
    closedCircumference: true,
    color,
    uRepeat: 2.0,
    capTop: true,
    capBottom: true,
  });
}

/**
 * Extrudes a 2D parametric surface grid (`rows x cols` of Vec3) into a realistic thin garment panel
 * (collars, lapels, pocket flaps, plackets, sneaker tongues, welt trim) with front, back, and perimeter edge.
 */
export function appendThickPanel(
  acc: SculptMeshAccumulator,
  grid: ReadonlyArray<ReadonlyArray<Vec3>>,
  thickness: number,
  color: LinearRgba = [1, 1, 1, 1],
  uvScale = 4.0,
): void {
  const rows = grid.length;
  if (rows < 2) return;
  const cols = grid[0]!.length;
  if (cols < 2) return;

  // Estimate per-vertex surface normals on the mid-surface
  const midNormals: Array<Array<[number, number, number]>> = [];
  for (let r = 0; r < rows; r += 1) {
    const rowNorms: Array<[number, number, number]> = [];
    for (let c = 0; c < cols; c += 1) {
      const pL = grid[r]![Math.max(0, c - 1)]!;
      const pR = grid[r]![Math.min(cols - 1, c + 1)]!;
      const pD = grid[Math.max(0, r - 1)]![c]!;
      const pU = grid[Math.min(rows - 1, r + 1)]![c]!;
      const tx = pR[0] - pL[0];
      const ty = pR[1] - pL[1];
      const tz = pR[2] - pL[2];
      const bx = pU[0] - pD[0];
      const by = pU[1] - pD[1];
      const bz = pU[2] - pD[2];
      rowNorms.push(normalize3(...cross3(tx, ty, tz, bx, by, bz)));
    }
    midNormals.push(rowNorms);
  }

  const halfT = thickness / 2;
  const frontStart = acc.positions.length / 3;
  const frontColor = shadeLinearColor(color, 0.98);

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const p = grid[r]![c]!;
      const [nx, ny, nz] = midNormals[r]![c]!;
      pushVertex(
        acc,
        p[0] + nx * halfT,
        p[1] + ny * halfT,
        p[2] + nz * halfT,
        nx,
        ny,
        nz,
        (c / (cols - 1)) * uvScale,
        (r / (rows - 1)) * uvScale,
        frontColor,
      );
    }
  }

  const backStart = acc.positions.length / 3;
  const backColor = shadeLinearColor(color, 0.76);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const p = grid[r]![c]!;
      const [nx, ny, nz] = midNormals[r]![c]!;
      pushVertex(
        acc,
        p[0] - nx * halfT,
        p[1] - ny * halfT,
        p[2] - nz * halfT,
        -nx,
        -ny,
        -nz,
        (c / (cols - 1)) * uvScale,
        (r / (rows - 1)) * uvScale,
        backColor,
      );
    }
  }

  for (let r = 0; r < rows - 1; r += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const f00 = frontStart + r * cols + c;
      const f10 = frontStart + (r + 1) * cols + c;
      const f01 = frontStart + r * cols + (c + 1);
      const f11 = frontStart + (r + 1) * cols + (c + 1);
      acc.indices.push(f00, f01, f11, f00, f11, f10);

      const b00 = backStart + r * cols + c;
      const b10 = backStart + (r + 1) * cols + c;
      const b01 = backStart + r * cols + (c + 1);
      const b11 = backStart + (r + 1) * cols + (c + 1);
      acc.indices.push(b00, b11, b01, b00, b10, b11);
    }
  }

  // Stitch perimeter edges so panel is watertight
  const stitchEdge = (edgeCoords: ReadonlyArray<readonly [number, number]>) => {
    for (let i = 0; i < edgeCoords.length - 1; i += 1) {
      const [r0, c0] = edgeCoords[i]!;
      const [r1, c1] = edgeCoords[i + 1]!;
      const f0 = frontStart + r0 * cols + c0;
      const f1 = frontStart + r1 * cols + c1;
      const b0 = backStart + r0 * cols + c0;
      const b1 = backStart + r1 * cols + c1;
      acc.indices.push(f0, b0, b1, f0, b1, f1);
    }
  };

  const bottomEdge: Array<[number, number]> = [];
  for (let c = 0; c < cols; c += 1) bottomEdge.push([0, c]);
  const rightEdge: Array<[number, number]> = [];
  for (let r = 0; r < rows; r += 1) rightEdge.push([r, cols - 1]);
  const topEdge: Array<[number, number]> = [];
  for (let c = cols - 1; c >= 0; c -= 1) topEdge.push([rows - 1, c]);
  const leftEdge: Array<[number, number]> = [];
  for (let r = rows - 1; r >= 0; r -= 1) leftEdge.push([r, 0]);

  stitchEdge(bottomEdge);
  stitchEdge(rightEdge);
  stitchEdge(topEdge);
  stitchEdge(leftEdge);
}

/**
 * Sculpted fashion button disc oriented along +Z (front) or custom axis,
 * with raised outer rim, slightly dished face, and subtle depth.
 */
export function appendFashionButton(
  acc: SculptMeshAccumulator,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  thickness: number,
  segs = 14,
  color: LinearRgba = [1, 1, 1, 1],
  facing: '+Z' | '-Z' | '+X' | '-X' = '+Z',
): void {
  const rings: LoftRing[] = [];
  const profile: ReadonlyArray<readonly [number, number, number]> = [
    // [axialOffset, radialScale, ao]
    [0.0, 0.86, 0.62],
    [thickness * 0.25, 1.0, 0.85],
    [thickness * 0.85, 1.0, 1.0],
    [thickness, 0.82, 0.96],
    [thickness * 0.78, 0.56, 0.78], // recessed dish
  ];

  for (let pIdx = 0; pIdx < profile.length; pIdx += 1) {
    const [ax, rScale, ao] = profile[pIdx]!;
    const pts: Vec3[] = [];
    for (let s = 0; s < segs; s += 1) {
      const theta = (s / segs) * Math.PI * 2;
      const u = Math.cos(theta) * radius * rScale;
      const v = Math.sin(theta) * radius * rScale;
      if (facing === '+Z') {
        pts.push([cx + u, cy + v, cz + ax]);
      } else if (facing === '-Z') {
        pts.push([cx - u, cy + v, cz - ax]);
      } else if (facing === '+X') {
        pts.push([cx + ax, cy + v, cz - u]);
      } else {
        pts.push([cx - ax, cy + v, cz + u]);
      }
    }
    rings.push({
      points: pts,
      vCoord: pIdx / (profile.length - 1),
      ringAo: ao,
    });
  }

  appendLoftedSurface(acc, rings, {
    closedCircumference: true,
    invertWinding: true,
    color,
    capTop: true,
    capBottom: true,
  });
}

/**
 * Architectural fluted travertine/limestone column with concave fluting channels.
 */
export function appendFlutedColumn(
  acc: SculptMeshAccumulator,
  cx: number,
  yBottom: number,
  cz: number,
  radiusBottom: number,
  radiusTop: number,
  height: number,
  flutes: number,
  segsPerFlute: number,
  color: LinearRgba,
): void {
  const totalSegs = Math.max(12, flutes * segsPerFlute);
  const ySteps = 5;
  const rings: LoftRing[] = [];

  for (let r = 0; r <= ySteps; r += 1) {
    const t = r / ySteps;
    const y = yBottom + height * t;
    const baseR = radiusBottom + (radiusTop - radiusBottom) * t;
    // Slight entasis taper & smooth flute fade at very top/bottom collars
    const fluteEnv = t > 0.05 && t < 0.95 ? 1.0 : 0.0;
    const pts: Vec3[] = [];
    const aoFactors: number[] = [];

    for (let s = 0; s < totalSegs; s += 1) {
      const theta = (s / totalSegs) * Math.PI * 2;
      const fluteWave = Math.cos(theta * flutes);
      const carve = fluteEnv * 0.055 * (1 - fluteWave) * 0.5;
      const rad = baseR * (1 - carve);
      pts.push([cx + Math.cos(theta) * rad, y, cz + Math.sin(theta) * rad]);
      aoFactors.push(0.84 + 0.16 * (0.5 + 0.5 * fluteWave));
    }

    rings.push({
      points: pts,
      vCoord: t * height,
      aoFactors,
      ringAo: 0.86 + 0.14 * t,
    });
  }

  appendLoftedSurface(acc, rings, {
    closedCircumference: true,
    color,
    uRepeat: 2.0,
    capTop: true,
    capBottom: true,
  });
}

/**
 * Smooth architectural portal arch frame (two vertical jambs + curved elliptical header arch).
 */
export function appendArchitecturalArch(
  acc: SculptMeshAccumulator,
  cx: number,
  yBottom: number,
  cz: number,
  innerWidth: number,
  springHeight: number,
  archRise: number,
  frameWidth: number,
  depth: number,
  archSegments: number,
  color: LinearRgba,
  rotY = 0,
): void {
  const cosR = Math.cos(rotY);
  const sinR = Math.sin(rotY);
  const tx = (lx: number, ly: number, lz: number): Vec3 => [
    cx + lx * cosR + lz * sinR,
    yBottom + ly,
    cz - lx * sinR + lz * cosR,
  ];

  // Left and right jamb columns
  const halfInner = innerWidth / 2;
  const jambCx = halfInner + frameWidth / 2;
  appendBeveledBox(
    acc,
    ...tx(-jambCx, springHeight / 2, 0),
    frameWidth,
    springHeight,
    depth,
    0.014,
    color,
    rotY,
  );
  appendBeveledBox(
    acc,
    ...tx(jambCx, springHeight / 2, 0),
    frameWidth,
    springHeight,
    depth,
    0.014,
    color,
    rotY,
  );

  // Curved voussoir arch ring swept across 0..PI
  const outerRx = halfInner + frameWidth;
  const outerRy = archRise + frameWidth;
  const hz = depth / 2;
  const segs = Math.max(8, archSegments);

  const rings: LoftRing[] = [];
  for (let i = 0; i <= segs; i += 1) {
    const a = (i / segs) * Math.PI;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const ix = halfInner * cosA;
    const iy = springHeight + archRise * sinA;
    const ox = outerRx * cosA;
    const oy = springHeight + outerRy * sinA;
    // 4-point cross-section around arch depth ordered for outward CCW normals
    const pts: Vec3[] = [
      tx(ix, iy, -hz),
      tx(ox, oy, -hz),
      tx(ox, oy, hz),
      tx(ix, iy, hz),
    ];
    rings.push({
      points: pts,
      vCoord: (i / segs) * Math.PI,
      ringAo: 0.9 + 0.1 * sinA,
    });
  }

  appendLoftedSurface(acc, rings, {
    closedCircumference: true,
    color,
    uRepeat: 1.0,
    capTop: false,
    capBottom: false,
  });
}
