import type { LightingPresetInput } from '@arven/contracts';
import {
  appendArchitecturalArch,
  appendBeveledBox,
  appendBoxUv,
  appendFlutedColumn,
  appendLoftedSurface,
  appendSculptedEllipsoid,
  appendSweptTube,
  createSculptAccumulator,
  hexToLinearRgba,
  shadeLinearColor,
  type LinearRgba,
  type LoftRing,
  type SculptMeshAccumulator,
  type Vec3,
} from './mesh-sculptor.js';

export interface ShowroomZonePedestalSpec {
  readonly label: string;
  readonly position: readonly [number, number, number];
}

export interface ShowroomZonePortalSpec {
  readonly targetZoneCode: string;
  readonly position: readonly [number, number, number];
}

export interface ShowroomZoneGlbBuildOptions {
  readonly code: string;
  readonly title?: string;
  readonly lightingPreset?: LightingPresetInput | string;
  readonly profile?: 'default' | 'lite';
  readonly pedestals?: ReadonlyArray<ShowroomZonePedestalSpec>;
  readonly portals?: ReadonlyArray<ShowroomZonePortalSpec>;
}

const WHITE: LinearRgba = [1, 1, 1, 1];

function superEllipse(
  theta: number,
  rx: number,
  rzFront: number,
  rzBack: number,
  power = 2.2,
): [number, number] {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const rz = sin >= 0 ? rzFront : rzBack;
  return [
    Math.sign(cos) * Math.pow(Math.abs(cos), 2 / power) * rx,
    Math.sign(sin) * Math.pow(Math.abs(sin), 2 / power) * rz,
  ];
}

/**
 * Builds the anatomically sculpted ARVEN Unisex Atelier Mannequin (`arven_mannequin_unisex_v1`)
 * resting squarely at Y = 0.000 (height 1.78m), calibrated so all 5 garment slots fit cleanly
 * over the form with zero poke-through or floating disconnection.
 */
export function buildSculptedMannequinParts(lite: boolean): {
  readonly body: SculptMeshAccumulator;
  readonly accents: SculptMeshAccumulator;
} {
  const body = createSculptAccumulator();
  const accents = createSculptAccumulator();

  const radSegs = lite ? 16 : 30;
  const limbSegs = lite ? 12 : 20;

  // 1. Stepped circular architectural plinth resting squarely on Y = 0.000
  const plinthRings: LoftRing[] = [];
  const plinthSpec: ReadonlyArray<readonly [number, number, number]> = [
    [0.0, 0.365, 0.72],
    [0.014, 0.365, 0.88],
    [0.02, 0.348, 0.98],
  ];
  for (let p = 0; p < plinthSpec.length; p += 1) {
    const [y, r, ao] = plinthSpec[p]!;
    const pts: Vec3[] = [];
    for (let s = 0; s < radSegs; s += 1) {
      const th = (s / radSegs) * Math.PI * 2;
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    plinthRings.push({ points: pts, vCoord: p * 0.1, ringAo: ao });
  }
  appendLoftedSurface(body, plinthRings, {
    closedCircumference: true,
    color: shadeLinearColor(WHITE, 0.78),
    capBottom: true,
    capTop: true,
    bottomCapAo: 0.55,
  });

  // Brushed bronze chamfered plinth perimeter ring (Y = 0.015..0.023)
  const rimRings: LoftRing[] = [];
  for (const [y, r, ao] of [
    [0.015, 0.368, 0.86],
    [0.022, 0.354, 1.0],
    [0.022, 0.336, 0.92],
  ] as const) {
    const pts: Vec3[] = [];
    for (let s = 0; s < radSegs; s += 1) {
      const th = (s / radSegs) * Math.PI * 2;
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    rimRings.push({ points: pts, vCoord: y * 10, ringAo: ao });
  }
  appendLoftedSurface(accents, rimRings, { closedCircumference: true, color: WHITE });

  // 2. Anatomical Legs & Sculpted Almond Feet (left & right at X = ±0.115, Y = 0.020..0.885)
  for (const side of [-1, 1] as const) {
    const cx = side * 0.115;

    // Minimalist sculpted almond mannequin foot (fits cleanly inside EU42 sneaker last!)
    appendSculptedEllipsoid(
      body,
      cx,
      0.044,
      0.024,
      0.042,
      0.026,
      0.112,
      lite ? 6 : 10,
      limbSegs,
      shadeLinearColor(WHITE, 0.9),
      (nx, ny, nz) => {
        const flatBottom = ny < -0.55 ? -0.92 : ny;
        const toeTaper = nz > 0.2 ? 1 - (nz - 0.2) * 0.28 : 1;
        return [nx * toeTaper, flatBottom, nz, 0.84 + 0.16 * Math.max(0, ny)];
      },
    );

    // Continuous anatomical leg from ankle (0.06) -> calf (0.34) -> knee (0.49) -> upper thigh (0.885)
    // Slimmed slightly inside garment tolerance so tailored wide-leg trousers drape cleanly with zero clipping
    const legProfile: ReadonlyArray<readonly [number, number, number, number, number]> = [
      // [y, offsetX, offsetZ, rx, rz]
      [0.058, 0.0, -0.01, 0.032, 0.036], // ankle
      [0.18, 0.0, -0.012, 0.038, 0.042], // lower shin
      [0.34, 0.0, -0.014, 0.048, 0.052], // sculpted calf fullness
      [0.485, 0.0, 0.002, 0.044, 0.048], // knee
      [0.68, -side * 0.006, 0.0, 0.06, 0.064], // mid thigh
      [0.865, -side * 0.015, 0.0, 0.068, 0.072], // upper thigh hip junction
      [0.91, -side * 0.022, 0.0, 0.064, 0.068], // blends inside pelvis
    ];

    const legRings: LoftRing[] = legProfile.map(([y, ox, oz, rx, rz], idx) => {
      const pts: Vec3[] = [];
      for (let s = 0; s < limbSegs; s += 1) {
        const th = (s / limbSegs) * Math.PI * 2;
        pts.push([cx + ox + Math.cos(th) * rx, y, oz + Math.sin(th) * rz]);
      }
      return {
        points: pts,
        vCoord: idx * 0.35,
        ringAo: 0.85 + 0.15 * (idx / (legProfile.length - 1)),
      };
    });

    appendLoftedSurface(body, legRings, {
      closedCircumference: true,
      color: WHITE,
      capTop: true,
      capBottom: true,
    });
  }

  // 3. Sculpted Unisex Tailor-Form Pelvis, Waist, Ribcage, Chest & Shoulders (Y = 0.84..1.475)
  // Proportioned strictly inside garment ease envelopes (rx <= 0.172, rz <= 0.098) for zero poke-through
  const torsoProfile: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
    // [y, rx, rzFront, rzBack, zShift, power]
    [0.84, 0.136, 0.088, 0.094, -0.004, 2.25], // lower hip base
    [0.92, 0.148, 0.094, 0.1, -0.003, 2.3], // iliac crest / pelvis
    [1.03, 0.124, 0.084, 0.086, 0.0, 2.2], // sculpted natural waist
    [1.16, 0.142, 0.092, 0.09, 0.003, 2.25], // lower ribcage
    [1.3, 0.158, 0.098, 0.094, 0.004, 2.3], // sternum / chest apex
    [1.375, 0.172, 0.09, 0.088, 0.002, 2.4], // natural sloped clavicular shoulder shelf
    [1.425, 0.118, 0.07, 0.068, -0.002, 2.2], // trapezius slope
    [1.468, 0.052, 0.052, 0.052, -0.003, 2.0], // neck base collar
  ];

  const torsoRings: LoftRing[] = torsoProfile.map(
    ([y, rx, rzF, rzB, zShift, power], idx) => {
      const pts: Vec3[] = [];
      const aoFactors: number[] = [];
      for (let s = 0; s < radSegs; s += 1) {
        const th = (s / radSegs) * Math.PI * 2;
        const [sx, sz] = superEllipse(th, rx, rzF, rzB, power);
        // Subtle anatomical spine indentation on back (-Z)
        const spineGroove =
          Math.sin(th) < -0.5 && idx >= 2 && idx <= 5
            ? Math.exp(-Math.pow(sx / 0.025, 2)) * 0.006
            : 0;
        pts.push([sx, y, sz + zShift + spineGroove]);
        aoFactors.push(spineGroove > 0.002 ? 0.88 : 0.98);
      }
      return {
        points: pts,
        vCoord: (y - 0.84) * 2.2,
        aoFactors,
        ringAo: 0.9 + 0.1 * (idx / (torsoProfile.length - 1)),
      };
    },
  );

  appendLoftedSurface(body, torsoRings, {
    closedCircumference: true,
    color: WHITE,
    uRepeat: 2.0,
    capBottom: true,
    capTop: true,
    bottomCapAo: 0.62,
  });

  // 4. Sculpted Neck & Minimalist Editorial Head (Y = 1.46..1.78)
  const neckSpecs: ReadonlyArray<readonly [number, number, number, number]> = [
    [1.46, 0.055, 0.055, -0.003],
    [1.515, 0.049, 0.05, -0.002],
    [1.565, 0.051, 0.052, 0.002],
  ];
  const neckRings: LoftRing[] = neckSpecs.map(([y, rx, rz, cz], i) => {
    const pts: Vec3[] = [];
    for (let s = 0; s < limbSegs; s += 1) {
      const th = (s / limbSegs) * Math.PI * 2;
      pts.push([Math.cos(th) * rx, y, cz + Math.sin(th) * rz]);
    }
    return { points: pts, vCoord: i * 0.25, ringAo: 0.9 + i * 0.05 };
  });
  appendLoftedSurface(body, neckRings, { closedCircumference: true, color: WHITE });

  // Editorial egg-sculpted head with subtle chin taper & clean brow plane
  appendSculptedEllipsoid(
    body,
    0,
    1.662,
    0.008,
    0.075,
    0.118,
    0.092,
    lite ? 8 : 14,
    limbSegs,
    WHITE,
    (nx, ny, nz) => {
      // Taper gently toward jawline (ny < 0) and project subtle refined chin forward (+Z)
      const jawTaper = ny < 0 ? 1 + ny * 0.24 : 1 - Math.max(0, ny - 0.5) * 0.08;
      const chinFwd = ny < -0.25 && nz > 0 ? (-ny - 0.25) * 0.12 * nz : 0;
      return [nx * jawTaper, ny, nz * (ny < 0 ? 0.92 : 1.0) + chinFwd, 0.88 + 0.12 * Math.max(0, ny)];
    },
  );

  // 5. Poised Relaxed Articulated Arms (aligned cleanly inside garment sleeves!)
  for (const side of [-1, 1] as const) {
    // Rounded deltoid shoulder cap tucked neatly inside garment shoulder cap
    appendSculptedEllipsoid(
      body,
      side * 0.184,
      1.352,
      0.002,
      0.042,
      0.044,
      0.042,
      lite ? 6 : 10,
      limbSegs,
      WHITE,
    );

    const armPath: Vec3[] = [
      [side * 0.192, 1.348, 0.002], // shoulder
      [side * 0.214, 1.22, 0.002], // mid upper arm
      [side * 0.232, 1.09, 0.006], // elbow
      [side * 0.25, 0.945, 0.016], // mid forearm
      [side * 0.26, 0.835, 0.024], // wrist
      [side * 0.258, 0.775, 0.028], // minimalist sculptural hand tip
    ];
    appendSweptTube(
      body,
      armPath,
      (t) => {
        if (t < 0.45) return 0.036 - t * 0.012; // upper arm -> elbow
        if (t < 0.85) return 0.031 - (t - 0.45) * 0.016; // forearm -> wrist
        return 0.024 * (1 - (t - 0.85) * 2.2); // tapered sculptural hand
      },
      { radialSegments: limbSegs, aspectRatio: 1.06, color: WHITE, capEnds: true },
    );

    // Brushed bronze atelier wrist trim ring
    appendSculptedEllipsoid(
      accents,
      side * 0.259,
      0.842,
      0.023,
      0.027,
      0.007,
      0.027,
      5,
      limbSegs,
      WHITE,
    );
  }

  // Brushed bronze atelier neck collar ring & tailored waist seam ring (accents)
  const collarRingPts = (y: number, rx: number, rz: number): LoftRing => {
    const pts: Vec3[] = [];
    for (let s = 0; s < radSegs; s += 1) {
      const th = (s / radSegs) * Math.PI * 2;
      const [sx, sz] = superEllipse(th, rx, rz, rz, 2.15);
      pts.push([sx, y, sz]);
    }
    return { points: pts, vCoord: y * 5, ringAo: 0.98 };
  };
  appendLoftedSurface(
    accents,
    [
      collarRingPts(1.454, 0.063, 0.063),
      collarRingPts(1.466, 0.065, 0.065),
      collarRingPts(1.474, 0.06, 0.06),
    ],
    { closedCircumference: true, color: WHITE },
  );
  appendLoftedSurface(
    accents,
    [
      collarRingPts(1.024, 0.14, 0.096),
      collarRingPts(1.032, 0.142, 0.098),
      collarRingPts(1.04, 0.14, 0.096),
    ],
    { closedCircumference: true, color: WHITE },
  );

  return { body, accents };
}

function hashZoneCode(code: string): number {
  let hash = 2166136261;
  for (let i = 0; i < code.length; i += 1) {
    hash ^= code.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Builds rich, distinctive architectural luxury gallery zone geometry for ARVEN's Virtual Showroom:
 * - `atrium-entrance`: Grand fluted-limestone colonnade, recessed triple-bay apse, coffered daylight canopy
 * - `tailoring-gallery`: Warm travertine arched niches, brushed-brass atelier garment rail, stone bench
 * - `movement-annex`: Slatted architectural stone wall ribs, museum vitrine frames, cantilevered plinths
 * - `archive-vault`: Deep vaulted rib chamber focusing museum light on the central archive monolith
 *
 * Every mesh carries valid `POSITION`, `NORMAL`, `TEXCOORD_0`, and baked vertex-AO `COLOR_0`.
 */
export function buildSculptedShowroomParts(options: ShowroomZoneGlbBuildOptions): {
  readonly floor: SculptMeshAccumulator;
  readonly architecture: SculptMeshAccumulator;
  readonly accents: SculptMeshAccumulator;
  readonly skylight: SculptMeshAccumulator;
  readonly portalNodeNames: string[];
  readonly portalTranslations: Array<{ readonly name: string; readonly translation: Vec3 }>;
} {
  const lite = options.profile === 'lite';
  const warm = options.lightingPreset === 'arven_warm_editorial_v1';
  const codeLower = options.code.toLowerCase();
  const isTailoring = codeLower.includes('tailoring');
  const isMovement = codeLower.includes('movement') || codeLower.includes('annex');
  const isArchive = codeLower.includes('archive') || codeLower.includes('vault');
  const zoneSeed = hashZoneCode(options.code);

  const floor = createSculptAccumulator();
  const architecture = createSculptAccumulator();
  const accents = createSculptAccumulator();
  const skylight = createSculptAccumulator();

  // Calibrated luxury gallery architectural stone & plaster tones (strictly zero pink)
  const floorTone = warm
    ? hexToLinearRgba('#282521')
    : isMovement
      ? hexToLinearRgba('#232527')
      : hexToLinearRgba('#222426');
  const daisTone = warm
    ? hexToLinearRgba('#3E3A33')
    : isMovement
      ? hexToLinearRgba('#34373A')
      : hexToLinearRgba('#383A3C');
  const wallTone = warm
    ? hexToLinearRgba('#49433B')
    : isArchive
      ? hexToLinearRgba('#2D3033')
      : hexToLinearRgba('#3D4043');
  const limestoneTone = warm
    ? hexToLinearRgba('#5F584D')
    : hexToLinearRgba('#545552');
  const plinthDarkReveal = hexToLinearRgba('#1A1C1E');
  const plinthPadTone = hexToLinearRgba('#1C1E20');
  const bronzeTone = hexToLinearRgba('#C5A572');
  const skylightTone = warm
    ? hexToLinearRgba('#FFF1DC')
    : hexToLinearRgba('#F6F4EE');

  // =========================================================================
  // 1. HONED ARCHITECTURAL FLOOR SLAB & STEPPED EXHIBITION DAIS (top at Y=0)
  // =========================================================================
  appendBoxUv(floor, 0, -0.08, -0.3, 13.6, 0.16, 12.6, floorTone);

  // Subtle recessed architectural floor stone slabs creating gallery spatial grid
  if (!lite) {
    for (let gx = -4; gx <= 4; gx += 4) {
      appendBoxUv(accents, gx, 0.002, -0.4, 0.018, 0.004, 11.4, shadeLinearColor(bronzeTone, 0.55));
    }
    for (let gz = -4.2; gz <= 2.8; gz += 3.5) {
      appendBoxUv(accents, 0, 0.002, gz, 11.8, 0.004, 0.018, shadeLinearColor(bronzeTone, 0.55));
    }
  }

  // Stepped architectural travertine exhibition dais (Y = 0.00..0.045) + inlaid brass border
  appendBeveledBox(floor, 0, 0.022, -1.25, 7.2, 0.044, 4.4, 0.016, daisTone);
  // Inlaid satin brass perimeter reveal around exhibition dais
  appendBoxUv(accents, 0, 0.045, 0.94, 7.24, 0.008, 0.022, bronzeTone);
  appendBoxUv(accents, 0, 0.045, -3.44, 7.24, 0.008, 0.022, bronzeTone);
  appendBoxUv(accents, -3.61, 0.045, -1.25, 0.022, 0.008, 4.4, bronzeTone);
  appendBoxUv(accents, 3.61, 0.045, -1.25, 0.022, 0.008, 4.4, bronzeTone);

  // =========================================================================
  // 2. MONUMENTAL BACK GALLERY WALL, COVE CORNICE & RECESSED BASEBOARD
  // =========================================================================
  // Main back monolithic gallery wall (Z = -5.6)
  appendBeveledBox(architecture, 0, 2.25, -5.65, 13.2, 4.5, 0.42, 0.025, wallTone);
  // Shadow-gap recessed baseboard along back wall
  appendBoxUv(architecture, 0, 0.06, -5.42, 12.8, 0.12, 0.06, plinthDarkReveal);
  appendBoxUv(accents, 0, 0.125, -5.39, 12.8, 0.014, 0.02, bronzeTone);
  // Upper architectural cove cornice shelf + hidden glowing wall-wash cove strip
  appendBeveledBox(architecture, 0, 4.02, -5.18, 12.6, 0.24, 0.62, 0.02, limestoneTone);
  appendBoxUv(skylight, 0, 3.88, -5.32, 11.4, 0.035, 0.08, skylightTone);

  // =========================================================================
  // 3. COFFERED ARCHITECTURAL CEILING CANOPY & DIFFUSED SKYLIGHT PANELS
  // =========================================================================
  // Outer ceiling structural perimeter frame (Y = 4.35)
  appendBeveledBox(architecture, 0, 4.38, -2.0, 9.8, 0.22, 5.8, 0.02, wallTone);
  // Recessed interior skylight well ribs (coffered luxury boutique daylight louvers)
  const louverCount = lite ? 3 : 5;
  for (let i = 0; i < louverCount; i += 1) {
    const lx = -3.2 + (i / Math.max(1, louverCount - 1)) * 6.4;
    appendBeveledBox(architecture, lx, 4.24, -2.0, 0.18, 0.22, 4.6, 0.012, limestoneTone);
  }
  appendBeveledBox(architecture, 0, 4.24, -3.5, 7.6, 0.22, 0.22, 0.012, limestoneTone);
  appendBeveledBox(architecture, 0, 4.24, -0.5, 7.6, 0.22, 0.22, 0.012, limestoneTone);
  // Satin bronze skylight ceiling trim frame
  appendBoxUv(accents, 0, 4.13, -4.35, 7.8, 0.025, 0.03, bronzeTone);
  appendBoxUv(accents, 0, 4.13, 0.35, 7.8, 0.025, 0.03, bronzeTone);
  // Glowing overhead frosted skylight diffuser plate
  appendBoxUv(skylight, 0, 4.31, -2.0, 7.3, 0.03, 4.3, skylightTone);

  // =========================================================================
  // 4. ZONE-SPECIFIC ARCHITECTURAL IDENTITY FEATURES
  // =========================================================================
  if (isTailoring) {
    // GALERI TAILORING: Three grand arched wall niches behind pedestals + Brass Atelier Garment Rail + Stone Bench
    const nicheXs = [-2.2, 0.0, 2.2];
    for (const nx of nicheXs) {
      appendArchitecturalArch(
        architecture,
        nx,
        0.12,
        -5.3,
        1.48,
        2.35,
        0.72,
        0.22,
        0.28,
        lite ? 8 : 16,
        limestoneTone,
      );
      appendBoxUv(accents, nx, 0.14, -5.18, 1.48, 0.018, 0.024, bronzeTone);
    }

    // Side structural pilasters framing the tailoring salon
    for (const z of lite ? [-4.0, -0.6] : [-4.2, -1.8, 0.8]) {
      appendBeveledBox(architecture, -5.7, 2.18, z, 0.52, 4.36, 0.72, 0.025, wallTone);
      appendBeveledBox(architecture, 5.7, 2.18, z, 0.52, 4.36, 0.72, 0.025, wallTone);
      appendBoxUv(accents, -5.42, 2.15, z, 0.024, 3.8, 0.05, bronzeTone);
      appendBoxUv(accents, 5.42, 2.15, z, 0.024, 3.8, 0.05, bronzeTone);
    }

    // Bespoke Brushed-Brass Atelier Garment Display Rail along left wall (X = -4.65, Z = -2.2..0.2)
    appendBeveledBox(architecture, -4.65, 0.05, -1.0, 0.52, 0.1, 2.35, 0.014, limestoneTone);
    appendSweptTube(
      accents,
      [
        [-4.65, 0.1, -2.0],
        [-4.65, 1.72, -2.0],
        [-4.65, 1.84, -1.88],
        [-4.65, 1.84, -0.12],
        [-4.65, 1.72, 0.0],
        [-4.65, 0.1, 0.0],
      ],
      () => 0.018,
      { radialSegments: lite ? 6 : 10, color: bronzeTone },
    );

    // Minimalist carved travertine gallery viewing bench (foreground-right, clear of camera)
    appendBeveledBox(architecture, 3.65, 0.21, 1.55, 0.62, 0.42, 1.55, 0.022, limestoneTone);
    appendBoxUv(accents, 3.65, 0.425, 1.55, 0.6, 0.01, 1.52, shadeLinearColor(bronzeTone, 0.75));
  } else if (isMovement) {
    // ANNEX MOVEMENT: Vertical architectural fluted stone wall slats + museum brass vitrine frames + bench
    const ribCount = lite ? 11 : 21;
    for (let i = 0; i < ribCount; i += 1) {
      const rx = -5.0 + (i / (ribCount - 1)) * 10.0;
      appendBeveledBox(architecture, rx, 2.05, -5.36, 0.18, 3.72, 0.18, 0.015, limestoneTone);
    }

    // Sleek museum architectural bronze display portal frames behind pedestals
    for (const bx of [-1.8, 1.8]) {
      appendBoxUv(accents, bx - 0.82, 1.72, -3.55, 0.032, 3.15, 0.032, bronzeTone);
      appendBoxUv(accents, bx + 0.82, 1.72, -3.55, 0.032, 3.15, 0.032, bronzeTone);
      appendBoxUv(accents, bx, 3.3, -3.55, 1.68, 0.032, 0.032, bronzeTone);
    }

    // Side structural monolith piers
    for (const z of lite ? [-3.8, -0.4] : [-4.1, -1.6, 0.9]) {
      appendBeveledBox(architecture, -5.65, 2.15, z, 0.46, 4.3, 0.85, 0.02, wallTone);
      appendBeveledBox(architecture, 5.65, 2.15, z, 0.46, 4.3, 0.85, 0.02, wallTone);
    }

    // Minimalist carved gallery bench on foreground-left
    appendBeveledBox(architecture, -3.6, 0.21, 1.65, 1.5, 0.42, 0.56, 0.022, limestoneTone);
  } else if (isArchive) {
    // ARSIP VAULT: Dramatic vaulted architectural stone ribs spanning the intimate chamber
    const ribZs = lite ? [-4.2, -2.0] : [-4.6, -2.8, -1.0];
    for (const rz of ribZs) {
      appendArchitecturalArch(
        architecture,
        0,
        0.0,
        rz,
        8.6,
        2.3,
        1.75,
        0.38,
        0.36,
        lite ? 10 : 18,
        limestoneTone,
      );
    }
  } else {
    // ATRIUM ENTRANCE (default flagship gallery): Fluted limestone colonnade + central monumental arch apse
    const colZs = lite ? [-4.0, -0.4] : [-4.3, -1.75, 0.8];
    const flutes = lite ? 8 : 14;
    for (const z of colZs) {
      const zShift = ((zoneSeed % 3) - 1) * 0.04;
      for (const side of [-1, 1] as const) {
        const cx = side * 5.25;
        // Column plinth base
        appendBeveledBox(architecture, cx, 0.14, z + zShift, 0.68, 0.28, 0.68, 0.02, limestoneTone);
        appendBoxUv(accents, cx, 0.29, z + zShift, 0.62, 0.022, 0.62, bronzeTone);
        // Sculpted fluted limestone column shaft
        appendFlutedColumn(
          architecture,
          cx,
          0.3,
          z + zShift,
          0.25,
          0.23,
          3.62,
          flutes,
          lite ? 2 : 3,
          limestoneTone,
        );
        // Column bronze collar & abacus capital
        appendBoxUv(accents, cx, 3.93, z + zShift, 0.58, 0.025, 0.58, bronzeTone);
        appendBeveledBox(architecture, cx, 4.1, z + zShift, 0.7, 0.3, 0.7, 0.02, limestoneTone);
      }
    }

    // Monumental center arch niche & flanking vertical gallery wall panels on back wall
    appendArchitecturalArch(
      architecture,
      0,
      0.12,
      -5.32,
      2.6,
      2.35,
      1.12,
      0.26,
      0.3,
      lite ? 10 : 20,
      limestoneTone,
    );
    appendBoxUv(accents, -2.55, 2.05, -5.42, 0.02, 3.6, 0.024, bronzeTone);
    appendBoxUv(accents, 2.55, 2.05, -5.42, 0.02, 3.6, 0.024, bronzeTone);

    // Sculpted circular travertine focal console table at back center niche
    appendFlutedColumn(
      architecture,
      0,
      0.04,
      -4.65,
      0.32,
      0.34,
      0.72,
      lite ? 8 : 14,
      2,
      limestoneTone,
    );
    appendBeveledBox(architecture, 0, 0.785, -4.65, 1.32, 0.05, 0.58, 0.015, daisTone);
    appendBoxUv(accents, 0, 0.815, -4.65, 1.3, 0.01, 0.56, bronzeTone);
  }

  // =========================================================================
  // 5. MUSEUM-GRADE CHAMFERED TRAVERTINE PRODUCT PEDESTALS (top pad at Y=0.86)
  // =========================================================================
  const pedestals: ReadonlyArray<ShowroomZonePedestalSpec> =
    options.pedestals && options.pedestals.length > 0
      ? options.pedestals
      : [
          { label: 'pedestal_1', position: [-2.0, 0, -1.2] },
          { label: 'pedestal_2', position: [0, 0, -1.8] },
          { label: 'pedestal_3', position: [2.0, 0, -1.2] },
        ];

  for (const pedestal of pedestals) {
    const [px, py, pz] = pedestal.position;
    const baseY = Math.max(0.044, py);

    if (!isTailoring && !isMovement && !isArchive) {
      // Atrium: Circular recessed dark basalt base + fine brushed-bronze floor halo ring (no square!)
      const capSegs = lite ? 16 : 32;
      const baseRings: LoftRing[] = [
        [baseY, 0.34, 0.7],
        [baseY + 0.068, 0.34, 0.82],
      ].map(([y, r, ao]) => {
        const pts: Vec3[] = [];
        for (let s = 0; s < capSegs; s += 1) {
          const th = (s / capSegs) * Math.PI * 2;
          pts.push([px + Math.cos(th) * r!, y!, pz + Math.sin(th) * r!]);
        }
        return { points: pts, vCoord: y! * 4, ringAo: ao! };
      });
      appendLoftedSurface(architecture, baseRings, {
        closedCircumference: true,
        color: plinthDarkReveal,
        capTop: true,
      });

      const floorRingPts: LoftRing[] = [
        [baseY + 0.004, 0.39, 0.9],
        [baseY + 0.016, 0.39, 1.0],
        [baseY + 0.016, 0.365, 0.94],
      ].map(([y, r, ao]) => {
        const pts: Vec3[] = [];
        for (let s = 0; s < capSegs; s += 1) {
          const th = (s / capSegs) * Math.PI * 2;
          pts.push([px + Math.cos(th) * r!, y!, pz + Math.sin(th) * r!]);
        }
        return { points: pts, vCoord: y! * 8, ringAo: ao! };
      });
      appendLoftedSurface(accents, floorRingPts, {
        closedCircumference: true,
        color: bronzeTone,
      });

      // Atrium: Fluted cylindrical travertine drum monolith!
      appendFlutedColumn(
        architecture,
        px,
        baseY + 0.07,
        pz,
        0.38,
        0.365,
        0.72,
        lite ? 10 : 18,
        lite ? 2 : 3,
        limestoneTone,
      );
      // Chamfered top cap & brushed bronze collar bezel
      const capRings: LoftRing[] = [
        [baseY + 0.79, 0.4, 0.92],
        [baseY + 0.815, 0.415, 1.0],
        [baseY + 0.822, 0.39, 0.96],
      ].map(([y, r, ao]) => {
        const pts: Vec3[] = [];
        for (let s = 0; s < capSegs; s += 1) {
          const th = (s / capSegs) * Math.PI * 2;
          pts.push([px + Math.cos(th) * r!, y!, pz + Math.sin(th) * r!]);
        }
        return { points: pts, vCoord: y! * 4, ringAo: ao! };
      });
      appendLoftedSurface(accents, capRings, {
        closedCircumference: true,
        color: bronzeTone,
        capTop: true,
      });
      // Dark velvet/slate exhibition top pad
      const padRings: LoftRing[] = [
        [baseY + 0.822, 0.36, 0.82],
        [baseY + 0.832, 0.355, 0.95],
      ].map(([y, r, ao]) => {
        const pts: Vec3[] = [];
        for (let s = 0; s < capSegs; s += 1) {
          const th = (s / capSegs) * Math.PI * 2;
          pts.push([px + Math.cos(th) * r!, y!, pz + Math.sin(th) * r!]);
        }
        return { points: pts, vCoord: y! * 4, ringAo: ao! };
      });
      appendLoftedSurface(architecture, padRings, {
        closedCircumference: true,
        color: plinthPadTone,
        capTop: true,
      });
    } else {
      // Tailoring / Movement / Archive: Recessed dark shadow-gap base + fine bronze trim
      appendBeveledBox(architecture, px, baseY + 0.035, pz, 0.68, 0.07, 0.68, 0.01, plinthDarkReveal);
      appendBoxUv(accents, px, baseY + 0.068, pz, 0.705, 0.012, 0.705, bronzeTone);
      // Chamfered monolithic travertine block with recessed bronze reveal
      const width = isMovement ? 0.88 : 0.8;
      const depth = isMovement ? 0.84 : 0.8;
      appendBeveledBox(
        architecture,
        px,
        baseY + 0.43,
        pz,
        width,
        0.72,
        depth,
        0.022,
        limestoneTone,
      );
      // Satin brushed bronze collar frame
      appendBeveledBox(
        accents,
        px,
        baseY + 0.805,
        pz,
        width + 0.03,
        0.032,
        depth + 0.03,
        0.008,
        bronzeTone,
      );
      // Dark velvet/slate exhibition pad on top
      appendBeveledBox(
        architecture,
        px,
        baseY + 0.826,
        pz,
        width - 0.06,
        0.016,
        depth - 0.06,
        0.004,
        plinthPadTone,
      );
    }
  }

  // =========================================================================
  // 6. SCULPTED ARCHITECTURAL PORTAL ARCHES (options.portals)
  // =========================================================================
  const portals = options.portals ?? [];
  const portalNodeNames: string[] = [];
  const portalTranslations: Array<{ readonly name: string; readonly translation: Vec3 }> = [];

  for (const portal of portals) {
    const [px, py, pz] = portal.position;
    const baseY = Math.max(0, py);
    // Orient side portals gently angled toward gallery center for welcoming spatial sightlines
    const yaw = px > 1.0 ? -0.35 : px < -1.0 ? 0.35 : 0;

    // Outer architectural travertine arch frame
    appendArchitecturalArch(
      architecture,
      px,
      baseY,
      pz,
      1.26,
      1.95,
      0.62,
      0.22,
      0.3,
      lite ? 8 : 16,
      limestoneTone,
      yaw,
    );
    // Inner satin brushed bronze accent arch trim
    appendArchitecturalArch(
      accents,
      px,
      baseY + 0.02,
      pz,
      1.2,
      1.94,
      0.58,
      0.036,
      0.32,
      lite ? 8 : 16,
      bronzeTone,
      yaw,
    );
    // Stepped bronze floor threshold sill
    appendBeveledBox(accents, px, baseY + 0.018, pz, 1.56, 0.036, 0.36, 0.008, bronzeTone, yaw);

    const portalName = `portal_${portal.targetZoneCode}`;
    portalNodeNames.push(portalName);
    portalTranslations.push({ name: portalName, translation: [px, baseY, pz] });
  }

  return {
    floor,
    architecture,
    accents,
    skylight,
    portalNodeNames,
    portalTranslations,
  };
}
