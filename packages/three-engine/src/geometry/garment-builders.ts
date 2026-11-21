import type { GarmentSilhouetteInput } from '@arven/contracts';
import {
  appendBeveledBox,
  appendFashionButton,
  appendLoftedSurface,
  appendSculptedEllipsoid,
  appendSweptTube,
  appendThickPanel,
  createSculptAccumulator,
  type LinearRgba,
  type LoftRing,
  type SculptMeshAccumulator,
  type Vec3,
} from './mesh-sculptor.js';

export interface GarmentPartsResult {
  readonly body: SculptMeshAccumulator;
  readonly secondary: SculptMeshAccumulator;
  readonly hardware: SculptMeshAccumulator;
}

export type GarmentStyleVariant =
  | 'tee'
  | 'shirt'
  | 'trouser'
  | 'overshirt'
  | 'field_jacket'
  | 'sneaker'
  | 'crossbody';

export function resolveGarmentStyleVariant(
  silhouette: GarmentSilhouetteInput,
  productSlug?: string,
): GarmentStyleVariant {
  if (productSlug) {
    const lower = productSlug.toLowerCase();
    if (lower.includes('field') || lower.includes('utility') || lower.includes('jacket')) {
      return 'field_jacket';
    }
  }
  return silhouette;
}

const WHITE: LinearRgba = [1, 1, 1, 1];

/**
 * Evaluates a smooth rounded-rectangle (super-ellipse) anatomical torso cross-section.
 * theta = 0 is +X (right), PI/2 is +Z (front chest), PI is -X (left), 3PI/2 is -Z (back).
 */
function superEllipsePoint(
  theta: number,
  rx: number,
  rzFront: number,
  rzBack: number,
  power = 2.35,
): [number, number] {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const rz = sin >= 0 ? rzFront : rzBack;
  const sx = Math.sign(cos) * Math.pow(Math.abs(cos), 2 / power) * rx;
  const sz = Math.sign(sin) * Math.pow(Math.abs(sin), 2 / power) * rz;
  return [sx, sz];
}

/**
 * Builds a tailored tubular sleeve curving smoothly down from an anatomically rounded
 * domed shoulder cap (tucked seamlessly inside the torso shoulder slope — zero open spikes
 * or protruding cylinder tops!) down to the hem or barrel cuff.
 */
function appendTailoredSleeve(
  acc: SculptMeshAccumulator,
  side: -1 | 1,
  opts: {
    readonly shoulderX: number;
    readonly shoulderY: number;
    readonly shoulderZ?: number;
    readonly length: number;
    readonly pitchOutRad: number; // angle away from vertical torso
    readonly forwardCurveZ?: number;
    readonly radiusTopX: number;
    readonly radiusTopZ: number;
    readonly radiusEndX: number;
    readonly radiusEndZ: number;
    readonly lengthSteps: number;
    readonly radialSteps: number;
    readonly drapeAmp: number;
    readonly blousonAtCuff?: number;
    readonly lipInset?: number;
  },
): {
  readonly cuffCenter: Vec3;
  readonly cuffDir: Vec3;
  readonly cuffRx: number;
  readonly cuffRz: number;
} {
  const rings: LoftRing[] = [];
  const sinP = Math.sin(opts.pitchOutRad);
  const cosP = Math.cos(opts.pitchOutRad);
  const sz0 = opts.shoulderZ ?? 0;
  const fwdZ = opts.forwardCurveZ ?? 0.018;

  // Build shaft from cuff (i = 0) up to deltoid shoulder crest (i = shaftSteps),
  // followed by 5 smoothly curved shoulder-cap dome rings arcing INWARD into the torso shoulder.
  const shaftSteps = Math.max(4, opts.lengthSteps);
  const capSteps = 5;
  const totalSteps = shaftSteps + capSteps;

  // Precompute centerline curve points & cross-section radii so tangents are exact & smooth
  const centers: Vec3[] = [];
  const radiiX: number[] = [];
  const radiiZ: number[] = [];
  const tShaftList: number[] = [];
  const capFracList: number[] = [];

  for (let i = 0; i <= totalSteps; i += 1) {
    if (i <= shaftSteps) {
      const tFromCuff = i / shaftSteps; // 0 = cuff, 1 = outer deltoid crest
      const tFromTop = 1 - tFromCuff;
      const elbowBend = Math.sin(tFromTop * Math.PI) * 0.008;
      const cx =
        opts.shoulderX + side * (tFromTop * opts.length * sinP + elbowBend * 0.35);
      const cy = opts.shoulderY - 0.042 - tFromTop * opts.length * cosP;
      const cz = sz0 + Math.pow(tFromTop, 1.35) * fwdZ;

      const blouson =
        opts.blousonAtCuff && tFromCuff > 0.06 && tFromCuff < 0.38
          ? opts.blousonAtCuff * Math.sin(((tFromCuff - 0.06) / 0.32) * Math.PI)
          : 0;
      const rx =
        opts.radiusEndX + (opts.radiusTopX - opts.radiusEndX) * Math.pow(tFromCuff, 0.85) + blouson;
      const rz =
        opts.radiusEndZ + (opts.radiusTopZ - opts.radiusEndZ) * Math.pow(tFromCuff, 0.85) + blouson;

      centers.push([cx, cy, cz]);
      radiiX.push(rx);
      radiiZ.push(rz);
      tShaftList.push(tFromTop);
      capFracList.push(0);
    } else {
      // Curved shoulder cap dome: bends inward into torso shoulder and arches gently along anatomical shoulder slope
      const u = (i - shaftSteps) / capSteps; // 0 -> 1 (tucked cleanly inside torso shoulder)
      const easeInOut = u * u * (3 - 2 * u);
      const cx = opts.shoulderX - side * (0.095 * Math.pow(u, 1.15));
      // Rises gently by +0.032m at deltoid crest then follows natural shoulder line (NEVER sticking up!)
      const cy = opts.shoulderY - 0.042 + Math.sin(u * Math.PI * 0.52) * 0.042;
      const cz = sz0 * (1 - easeInOut * 0.3);

      // Smooth spherical/ellipsoidal deltoid taper down into torso interior
      const dome = Math.sqrt(Math.max(0.14, 1 - Math.pow(u, 1.75) * 0.84));
      centers.push([cx, cy, cz]);
      radiiX.push(opts.radiusTopX * dome * 0.94);
      radiiZ.push(opts.radiusTopZ * dome * 0.96);
      tShaftList.push(0);
      capFracList.push(u);
    }
  }

  for (let i = 0; i <= totalSteps; i += 1) {
    const [cx, cy, cz] = centers[i]!;
    const rx = radiiX[i]!;
    const rz = radiiZ[i]!;
    const tFromTop = tShaftList[i]!;
    const capU = capFracList[i]!;

    // Compute smooth local centerline tangent pointing UP toward shoulder/torso
    const prev = centers[Math.max(0, i - 1)]!;
    const next = centers[Math.min(totalSteps, i + 1)]!;
    let ux = next[0] - prev[0];
    let uy = next[1] - prev[1];
    let uz = next[2] - prev[2];
    const uLen = Math.hypot(ux, uy, uz) || 1;
    ux /= uLen;
    uy /= uLen;
    uz /= uLen;

    // Cross-section basis perpendicular to local tangent with strictly OUTWARD right-handed frame:
    // b1 lies in X-Y plane perpendicular to u, oriented consistently outward (+X on shaft -> +Y/+X on cap)
    // b2 = cross(b1, u) -> points +Z (matching torso superEllipse winding so ALL sleeve & cap normals point OUTWARD!)
    let bx1 = uy;
    let by1 = -ux;
    const bz1 = 0;
    const b1Len = Math.hypot(bx1, by1) || 1;
    bx1 /= b1Len;
    by1 /= b1Len;

    // Keep b1 continuously aligned across shaft -> cap transition
    if (bx1 < -0.001) {
      bx1 = -bx1;
      by1 = -by1;
    }

    // b2 = cross(b1, u) => when u=(0,1,0) and b1=(1,0,0), b2 = (0, 0, +1)!
    let bx2 = by1 * uz - bz1 * uy;
    let by2 = bz1 * ux - bx1 * uz;
    let bz2 = bx1 * uy - by1 * ux;
    const b2Len = Math.hypot(bx2, by2, bz2) || 1;
    bx2 /= b2Len;
    by2 /= b2Len;
    bz2 /= b2Len;

    const pts: Vec3[] = [];
    const aoFactors: number[] = [];

    for (let s = 0; s < opts.radialSteps; s += 1) {
      const theta = (s / opts.radialSteps) * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);

      // Subtle elbow & underarm fabric creases on shaft (damped to 0 on smooth shoulder cap)
      const capFade = 1 - capU;
      const elbowZone = Math.exp(-Math.pow((tFromTop - 0.52) / 0.18, 2));
      const underarmZone = Math.exp(-Math.pow((tFromTop - 0.18) / 0.14, 2));
      const wrinkle =
        capFade *
        opts.drapeAmp *
        (0.5 * elbowZone * Math.sin(theta * 3 + side * 0.6) +
          0.4 * underarmZone * Math.cos(theta * 4) +
          0.25 * Math.sin(theta * 2 + tFromTop * 4.5));

      const radX = Math.max(0.016, rx + wrinkle);
      const radZ = Math.max(0.016, rz + wrinkle * 0.9);

      const px = cx + (bx1 * cos * radX + bx2 * sin * radZ);
      const py = cy + (by1 * cos * radX + by2 * sin * radZ);
      const pz = cz + (bz1 * cos * radX + bz2 * sin * radZ);

      pts.push([px, py, pz]);
      const underarmAo = side * cos < -0.2 ? 0.85 : 0.97;
      const foldAo = 0.94 + 0.06 * Math.sin(theta * 3) * capFade;
      aoFactors.push(underarmAo * foldAo);
    }

    rings.push({
      points: pts,
      vCoord: (i / totalSteps) * opts.length * 2.4,
      aoFactors,
      ringAo: 0.9 + 0.1 * Math.min(1, i / shaftSteps),
    });
  }

  appendLoftedSurface(acc, rings, {
    closedCircumference: true,
    color: WHITE,
    uRepeat: 1.4,
    capTop: true,
    bottomLipInset: opts.lipInset ?? 0.006,
    bottomLipDepth: 0.012,
  });

  const lastCenter = centers[0]!;
  const prevCenter = centers[1]!;
  const dirLen =
    Math.hypot(
      prevCenter[0] - lastCenter[0],
      prevCenter[1] - lastCenter[1],
      prevCenter[2] - lastCenter[2],
    ) || 1;

  return {
    cuffCenter: lastCenter,
    cuffDir: [
      (prevCenter[0] - lastCenter[0]) / dirLen,
      (prevCenter[1] - lastCenter[1]) / dirLen,
      (prevCenter[2] - lastCenter[2]) / dirLen,
    ],
    cuffRx: opts.radiusEndX,
    cuffRz: opts.radiusEndZ,
  };
}

/**
 * 1. ESSENTIALS HEAVYWEIGHT CREW TEE (280 gsm Combed Organic Cotton)
 * Relaxed drop-shoulder boxy torso, natural gravity drape folds, contoured dipped crew rib collar,
 * pitched drop-shoulder sleeves with turned double-needle hems, and Atelier woven hem tab.
 */
function buildHeavyweightCrewTee(lite: boolean): GarmentPartsResult {
  const body = createSculptAccumulator();
  const secondary = createSculptAccumulator();
  const hardware = createSculptAccumulator();

  const radSegs = lite ? 24 : 44;
  const ySteps = lite ? 12 : 22;
  const yBottom = 0.13;
  const yShoulder = 0.82;

  const torsoRings: LoftRing[] = [];
  for (let r = 0; r <= ySteps; r += 1) {
    const t = r / ySteps; // 0 = hem, 1 = collar base
    const yBase = yBottom + (yShoulder - yBottom) * t;

    // Anatomical relaxed boxy profile: slight waist ease, broad chest, natural shoulder slope to neck
    let rx: number;
    let rzFront: number;
    let rzBack: number;

    if (t < 0.78) {
      const k = t / 0.78;
      // Gentle drape flare at hem, subtle fullness at chest (k ~ 0.65)
      const chestFullness = Math.sin(k * Math.PI) * 0.012;
      rx = 0.228 - 0.01 * Math.sin(k * Math.PI * 0.85) + (k > 0.55 ? (k - 0.55) * 0.055 : 0);
      rzFront = 0.132 + chestFullness + (k > 0.6 ? (k - 0.6) * 0.012 : 0);
      rzBack = 0.126 + chestFullness * 0.75;
    } else {
      // Smooth anatomical shoulder slope tapering from shoulder cap (t=0.78) to crew neck opening (t=1.0)
      const s = (t - 0.78) / 0.22;
      const smoothS = s * s * (3 - 2 * s);
      rx = 0.241 * (1 - smoothS) + 0.088 * smoothS;
      rzFront = 0.138 * (1 - smoothS) + 0.082 * smoothS;
      rzBack = 0.131 * (1 - smoothS) + 0.076 * smoothS;
    }

    const pts: Vec3[] = [];
    const aoFactors: number[] = [];

    for (let c = 0; c < radSegs; c += 1) {
      const theta = (c / radSegs) * Math.PI * 2;
      const [sx, sz] = superEllipsePoint(theta, rx, rzFront, rzBack, t > 0.82 ? 2.1 : 2.45);

      // 280gsm heavyweight jersey vertical gravity drape folds strongest near lower half
      const drapeEnv = Math.pow(1 - t, 1.35) * (t < 0.82 ? 1 : 0);
      const fold1 = Math.sin(theta * 5 + 0.4) * 0.0052;
      const fold2 = Math.cos(theta * 7 - 0.8) * 0.0032;
      const sideSeamIndent = Math.exp(-Math.pow(Math.sin(theta) / 0.12, 2)) * -0.0028;
      const radialMod = (fold1 + fold2) * drapeEnv + sideSeamIndent * (t < 0.75 ? 1 : 0);

      // Front crewneck scoop dips smoothly downward in +Z at top rings
      const frontFactor = Math.max(0, Math.sin(theta));
      const neckDip = t > 0.8 ? Math.pow((t - 0.8) / 0.2, 1.5) * frontFactor * 0.036 : 0;
      // Subtle anatomical shoulder arch drop toward +-X
      const shoulderSlope =
        t > 0.76 ? Math.pow((t - 0.76) / 0.24, 1.2) * Math.abs(Math.cos(theta)) * 0.022 : 0;

      const radLen = Math.hypot(sx, sz) || 1;
      const px = sx + (sx / radLen) * radialMod;
      const pz = sz + (sz / radLen) * radialMod;
      const py = yBase - neckDip - shoulderSlope;

      pts.push([px, py, pz]);
      const foldAo = 0.94 + 0.06 * Math.sin(theta * 5 + 0.4) * drapeEnv;
      const sideAo = 1 - Math.exp(-Math.pow(Math.sin(theta) / 0.18, 2)) * 0.06;
      aoFactors.push(foldAo * sideAo);
    }

    torsoRings.push({
      points: pts,
      vCoord: t * 1.8,
      aoFactors,
      ringAo: 0.88 + 0.12 * Math.sin(t * Math.PI * 0.7 + 0.2),
    });
  }

  appendLoftedSurface(body, torsoRings, {
    closedCircumference: true,
    color: WHITE,
    uRepeat: 2.2,
    bottomLipInset: 0.008,
    bottomLipDepth: 0.018,
    topLipInset: 0.005,
    topLipDepth: 0.012,
  });

  // Drop-shoulder relaxed half-sleeves with seamless rounded deltoid cap
  for (const side of [-1, 1] as const) {
    appendTailoredSleeve(body, side, {
      shoulderX: side * 0.222,
      shoulderY: 0.678,
      shoulderZ: 0.002,
      length: 0.235,
      pitchOutRad: 0.34, // natural relaxed drop-shoulder angle
      forwardCurveZ: 0.01,
      radiusTopX: 0.082,
      radiusTopZ: 0.086,
      radiusEndX: 0.072,
      radiusEndZ: 0.075,
      lengthSteps: lite ? 6 : 12,
      radialSteps: lite ? 16 : 26,
      drapeAmp: 0.004,
      lipInset: 0.006,
    });
  }

  // Thick ribbed crew neckband (secondary slot) following exact dipped neckline contour
  const collarRadSegs = lite ? 24 : 44;
  const collarRings: LoftRing[] = [];
  const collarProfile: ReadonlyArray<readonly [number, number, number]> = [
    [-0.014, 0.005, 0.78], // bottom stitch welt into tee shoulder
    [0.0, 0.0085, 0.96],
    [0.014, 0.008, 1.0],
    [0.025, 0.004, 0.94], // rolled rib top crest
    [0.022, -0.004, 0.72], // inner neckband
    [0.0, -0.006, 0.56],
  ];

  for (let p = 0; p < collarProfile.length; p += 1) {
    const [dy, dr, ao] = collarProfile[p]!;
    const pts: Vec3[] = [];
    const aoFactors: number[] = [];
    for (let c = 0; c < collarRadSegs; c += 1) {
      const theta = (c / collarRadSegs) * Math.PI * 2;
      const ribMod = Math.cos(theta * (lite ? 24 : 44)) * 0.0009;
      const rx = 0.09 + dr + ribMod;
      const rzF = 0.085 + dr + ribMod;
      const rzB = 0.079 + dr + ribMod;
      const [sx, sz] = superEllipsePoint(theta, rx, rzF, rzB, 2.05);
      const frontDip = Math.max(0, Math.sin(theta)) * 0.036;
      const sideDip = Math.abs(Math.cos(theta)) * 0.018;
      pts.push([sx, 0.818 - frontDip - sideDip + dy, sz]);
      aoFactors.push(0.92 + 0.08 * Math.cos(theta * 24));
    }
    collarRings.push({
      points: pts,
      vCoord: p * 0.12,
      aoFactors,
      ringAo: ao,
    });
  }

  appendLoftedSurface(secondary, collarRings, {
    closedCircumference: true,
    color: WHITE,
    uRepeat: 2.5,
  });

  // Subtle double-needle bottom hem welt band (secondary tonal stitching cue)
  const hemRings: LoftRing[] = [];
  for (let h = 0; h <= 2; h += 1) {
    const dy = h * 0.009;
    const pts: Vec3[] = [];
    for (let c = 0; c < radSegs; c += 1) {
      const theta = (c / radSegs) * Math.PI * 2;
      const [sx, sz] = superEllipsePoint(theta, 0.23, 0.134, 0.128, 2.45);
      const fold = (Math.sin(theta * 5 + 0.4) * 0.0052 + Math.cos(theta * 7 - 0.8) * 0.0032);
      const len = Math.hypot(sx, sz) || 1;
      pts.push([sx + (sx / len) * (fold + 0.0018), yBottom + 0.012 + dy, sz + (sz / len) * (fold + 0.0018)]);
    }
    hemRings.push({ points: pts, vCoord: h * 0.08, ringAo: h === 1 ? 0.96 : 0.82 });
  }
  appendLoftedSurface(secondary, hemRings, { closedCircumference: true, color: WHITE });

  // Signature ARVEN woven atelier hem badge & brushed bronze bar-tack accents (hardware slot)
  appendBeveledBox(hardware, -0.155, 0.176, 0.132, 0.056, 0.02, 0.007, 0.002, WHITE, -0.18);
  appendBeveledBox(hardware, -0.182, 0.176, 0.131, 0.004, 0.018, 0.009, 0.001, WHITE, -0.18);
  appendBeveledBox(hardware, -0.128, 0.176, 0.136, 0.004, 0.018, 0.009, 0.001, WHITE, -0.18);

  return { body, secondary, hardware };
}

/**
 * 2. ATELIER OVERSIZED POPLIN SHIRT (100% Long-Staple High-Twist Cotton Poplin)
 * Crisp architectural oversized volume, CURVED DROPPED SHIRT-TAIL HEM with side gusset scoop,
 * sculpted two-piece collar stand + pointed collar leaf, concealed front placket, rear yoke + box pleat,
 * long bloused sleeves with structured barrel cuffs and subtle horn/pearl collar & cuff buttons.
 */
function buildOversizedPoplinShirt(lite: boolean): GarmentPartsResult {
  const body = createSculptAccumulator();
  const secondary = createSculptAccumulator();
  const hardware = createSculptAccumulator();

  const radSegs = lite ? 28 : 48;
  const ySteps = lite ? 14 : 24;
  const yHemBase = 0.095;
  const yTop = 0.835;

  const torsoRings: LoftRing[] = [];
  for (let r = 0; r <= ySteps; r += 1) {
    const t = r / ySteps;
    let rx: number;
    let rzFront: number;
    let rzBack: number;

    if (t < 0.78) {
      const k = t / 0.78;
      // Generous crisp A-line architectural poplin volume
      rx = 0.246 - 0.012 * Math.sin(k * Math.PI * 0.7) + (k > 0.55 ? (k - 0.55) * 0.05 : 0);
      rzFront = 0.14 + Math.sin(k * Math.PI) * 0.01;
      rzBack = 0.146 + (1 - k) * 0.016; // crisp rear box-pleat volume
    } else {
      const s = (t - 0.78) / 0.22;
      const smoothS = s * s * (3 - 2 * s);
      rx = 0.252 * (1 - smoothS) + 0.08 * smoothS;
      rzFront = 0.142 * (1 - smoothS) + 0.078 * smoothS;
      rzBack = 0.146 * (1 - smoothS) + 0.076 * smoothS;
    }

    const pts: Vec3[] = [];
    const aoFactors: number[] = [];

    for (let c = 0; c < radSegs; c += 1) {
      const theta = (c / radSegs) * Math.PI * 2;
      const [sx, sz] = superEllipsePoint(theta, rx, rzFront, rzBack, t > 0.8 ? 2.15 : 2.6);

      // Curved shirt-tail hem: high scalloped side vents at +-X, lower front, slightly longer dropped back
      const hemCurve =
        Math.pow(1 - t, 1.8) *
        (Math.pow(Math.cos(theta), 4) * 0.075 - Math.max(0, -Math.sin(theta)) * 0.032);

      // Crisp rear center box pleat (-Z, theta ~ 3PI/2) below rear yoke (t < 0.72)
      const backCenterDist = Math.abs(Math.cos(theta)) + (Math.sin(theta) > 0 ? 2 : 0);
      const boxPleat =
        t < 0.72 && Math.sin(theta) < -0.5
          ? Math.exp(-Math.pow(backCenterDist / 0.14, 2)) * 0.014 * (1 - t * 0.4) -
            Math.exp(-Math.pow((backCenterDist - 0.16) / 0.05, 2)) * 0.006
          : 0;

      // Crisp poplin vertical sheet folds (wider, cleaner than jersey)
      const poplinWave =
        Math.pow(1 - t, 1.1) *
        (Math.sin(theta * 4 + 0.2) * 0.0045 + Math.cos(theta * 6) * 0.0024);

      const frontNeckDip =
        t > 0.8 ? Math.pow((t - 0.8) / 0.2, 1.4) * Math.max(0, Math.sin(theta)) * 0.02 : 0;
      const shoulderSlope =
        t > 0.76 ? Math.pow((t - 0.76) / 0.24, 1.15) * Math.abs(Math.cos(theta)) * 0.025 : 0;

      const radLen = Math.hypot(sx, sz) || 1;
      const delta = poplinWave + boxPleat;
      pts.push([
        sx + (sx / radLen) * delta,
        yHemBase + (yTop - yHemBase) * t + hemCurve - frontNeckDip - shoulderSlope,
        sz + (sz / radLen) * delta,
      ]);

      const pleatAo = backCenterDist < 0.22 && Math.sin(theta) < -0.5 && t < 0.72 ? 0.86 : 1.0;
      aoFactors.push(pleatAo * (0.95 + 0.05 * Math.sin(theta * 4)));
    }

    torsoRings.push({
      points: pts,
      vCoord: t * 2.0,
      aoFactors,
      ringAo: 0.9 + 0.1 * t,
    });
  }

  appendLoftedSurface(body, torsoRings, {
    closedCircumference: true,
    color: WHITE,
    uRepeat: 2.4,
    bottomLipInset: 0.005,
    bottomLipDepth: 0.012,
  });

  // Full-length tailored shirt sleeves with seamless shoulder cap & clean barrel cuffs
  for (const side of [-1, 1] as const) {
    const cuffInfo = appendTailoredSleeve(body, side, {
      shoulderX: side * 0.232,
      shoulderY: 0.692,
      shoulderZ: 0.0,
      length: 0.482,
      pitchOutRad: 0.16,
      forwardCurveZ: 0.022,
      radiusTopX: 0.084,
      radiusTopZ: 0.086,
      radiusEndX: 0.054,
      radiusEndZ: 0.056,
      lengthSteps: lite ? 8 : 16,
      radialSteps: lite ? 16 : 26,
      drapeAmp: 0.0038,
      blousonAtCuff: 0.011,
      lipInset: 0.004,
    });

    // Structured 6.2cm tailored barrel cuff overlapping sleeve wrist seam cleanly (zero slit)
    const [cx, cy, cz] = cuffInfo.cuffCenter;
    const cuffRings: LoftRing[] = [];
    const cuffSegs = lite ? 16 : 24;
    for (let k = 0; k <= 3; k += 1) {
      const h = (k / 3) * 0.064;
      const pts: Vec3[] = [];
      for (let s = 0; s < cuffSegs; s += 1) {
        const th = (s / cuffSegs) * Math.PI * 2;
        const r = 0.057 + (k === 3 ? 0.001 : 0);
        pts.push([
          cx + Math.cos(th) * r - side * (h - 0.044) * 0.16,
          cy - 0.042 + h,
          cz + Math.sin(th) * r,
        ]);
      }
      cuffRings.push({ points: pts, vCoord: k * 0.12, ringAo: 0.88 + k * 0.04 });
    }
    appendLoftedSurface(secondary, cuffRings, {
      closedCircumference: true,
      color: WHITE,
      bottomLipInset: 0.004,
      bottomLipDepth: 0.008,
    });

    // Single crisp cuff button
    appendFashionButton(
      hardware,
      cx + side * 0.059,
      cy - 0.022,
      cz + 0.012,
      0.008,
      0.004,
      10,
      WHITE,
      side > 0 ? '+X' : '-X',
    );
  }

  // Two-piece upright collar stand (secondary)
  const standSegs = lite ? 24 : 40;
  const standRings: LoftRing[] = [];
  for (let k = 0; k <= 3; k += 1) {
    const t = k / 3;
    const pts: Vec3[] = [];
    for (let s = 0; s < standSegs; s += 1) {
      const theta = (s / standSegs) * Math.PI * 2;
      const [sx, sz] = superEllipsePoint(theta, 0.082 - t * 0.005, 0.082 - t * 0.004, 0.078 - t * 0.004, 2.05);
      const frontDip = Math.max(0, Math.sin(theta)) * 0.018;
      pts.push([sx, 0.818 - frontDip + t * 0.038, sz]);
    }
    standRings.push({ points: pts, vCoord: t * 0.2, ringAo: 0.85 + 0.15 * t });
  }
  appendLoftedSurface(secondary, standRings, {
    closedCircumference: true,
    color: WHITE,
    topLipInset: 0.004,
    topLipDepth: 0.01,
  });

  // Sculpted pointed folded shirt collar leaf wrapping cleanly from back nape to crisp front points
  const collarCols = lite ? 18 : 30;
  const collarRows = 5;
  const collarGrid: Vec3[][] = [];
  for (let r = 0; r < collarRows; r += 1) {
    const v = r / (collarRows - 1); // 0 = outer pointed leaf tip, 1 = fold crest at top of stand
    const rowPts: Vec3[] = [];
    for (let c = 0; c < collarCols; c += 1) {
      // Sweep from front-right (+PI/2 - 0.16) around back (-PI/2) to front-left (+PI/2 + 0.16)
      const u = c / (collarCols - 1);
      const theta = Math.PI * 0.5 + 0.18 + u * (Math.PI * 2 - 0.36);
      const distFromPoint = Math.min(u, 1 - u); // 0 at sharp front collar tips
      const pointLength = 0.048 + Math.exp(-distFromPoint * 7.5) * 0.032;

      const radBase = 0.079;
      const spreadOut = (1 - v) * (0.026 + Math.exp(-distFromPoint * 5.0) * 0.016);
      const dropY = (1 - v) * pointLength;
      const frontDip = Math.max(0, Math.sin(theta)) * 0.018;

      const x = Math.cos(theta) * (radBase + spreadOut);
      const z = Math.sin(theta) * (radBase + spreadOut);
      const y = 0.856 - frontDip - dropY + Math.sin(v * Math.PI) * 0.006;
      rowPts.push([x, y, z]);
    }
    collarGrid.push(rowPts);
  }
  appendThickPanel(secondary, collarGrid, 0.005, WHITE, 3.0);

  // Concealed center-front placket strip (crisp architectural overlap)
  const placketRows = lite ? 10 : 18;
  const placketGrid: Vec3[][] = [];
  for (let r = 0; r < placketRows; r += 1) {
    const t = r / (placketRows - 1);
    const y = 0.105 + t * 0.715;
    const zCurve = 0.145 + Math.sin(t * Math.PI) * 0.012 - (t > 0.78 ? ((t - 0.78) / 0.22) * 0.058 : 0);
    const w = 0.022;
    placketGrid.push([
      [-w, y, zCurve],
      [0, y, zCurve + 0.003],
      [w, y, zCurve],
    ]);
  }
  appendThickPanel(secondary, placketGrid, 0.006, WHITE, 2.0);

  // Rear horizontal shoulder yoke detail seam bar
  appendBeveledBox(secondary, 0, 0.715, -0.142, 0.42, 0.008, 0.008, 0.002, WHITE);

  // Exposed top collar matte mother-of-pearl / bronze button (concealed placket below)
  appendFashionButton(hardware, 0, 0.818, 0.088, 0.009, 0.0045, 12, WHITE, '+Z');

  return { body, secondary, hardware };
}

/**
 * 3. FORM WIDE-LEG TAILORED TROUSER (68% Wool Blend Suiting Twill)
 * High-rise sculpted pelvis yoke, twin forward tailored pleats per front leg,
 * razor-sharp vertical pressed front & back center creases, fluid wide-leg volume to Y=0.025,
 * extended waistband tab, 6 belt loops, slanted side pockets, rear welts, and horn closure button.
 */
function buildWideLegTrouser(lite: boolean): GarmentPartsResult {
  const body = createSculptAccumulator();
  const secondary = createSculptAccumulator();
  const hardware = createSculptAccumulator();

  const legRadSegs = lite ? 24 : 40;
  const legYSteps = lite ? 12 : 22;

  // Build left (-1) and right (+1) wide-leg tailored trouser tubes from Y=0.025 up to crotch rise Y=0.77
  for (const side of [-1, 1] as const) {
    const legRings: LoftRing[] = [];
    for (let r = 0; r <= legYSteps; r += 1) {
      const t = r / legYSteps; // 0 = hem, 1 = upper thigh/crotch junction
      const y = 0.025 + t * 0.76;

      // Centerline converges smoothly inward toward pelvis at crotch rise
      const cx = side * (0.114 - t * 0.022);
      const cz = 0.003 * Math.sin(t * Math.PI);

      // Generous fluid wide-leg volume tapering cleanly into the tailored hip yoke at top
      const topTuck = t > 0.8 ? (t - 0.8) / 0.2 : 0;
      const rx = 0.104 + t * 0.01 - topTuck * 0.014;
      const rz = 0.102 + t * 0.012 - topTuck * 0.01;

      const pts: Vec3[] = [];
      const aoFactors: number[] = [];

      for (let c = 0; c < legRadSegs; c += 1) {
        const theta = (c / legRadSegs) * Math.PI * 2;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);

        // Crisp pressed front (+Z, theta=PI/2) and back (-Z, theta=3PI/2) vertical trouser creases!
        const frontCrease = Math.exp(-Math.pow((theta - Math.PI * 0.5) / 0.16, 2)) * 0.012;
        const backCrease = Math.exp(-Math.pow((theta - Math.PI * 1.5) / 0.16, 2)) * 0.01;

        // Subtle knee & ankle break drape modulation
        const ankleBreak = Math.exp(-Math.pow((t - 0.08) / 0.09, 2)) * Math.sin(theta * 3) * 0.004;
        const innerFlatten =
          t > 0.72 && side * cos < 0
            ? (t - 0.72) * 0.045 * Math.abs(cos)
            : 0;

        const px = cx + cos * rx - side * innerFlatten;
        const pz = cz + sin * rz + (sin > 0 ? frontCrease : -backCrease) + ankleBreak;

        pts.push([px, y, pz]);
        const creaseHighlight = 1.0 + (frontCrease + backCrease) * 3.5;
        const inseamAo = side * cos < -0.35 ? 0.84 : 0.96;
        aoFactors.push(Math.min(1.04, inseamAo * creaseHighlight));
      }

      legRings.push({
        points: pts,
        vCoord: t * 2.1,
        aoFactors,
        ringAo: 0.86 + 0.14 * t,
      });
    }

    appendLoftedSurface(body, legRings, {
      closedCircumference: true,
      color: WHITE,
      uRepeat: 1.5,
      bottomLipInset: 0.008,
      bottomLipDepth: 0.02,
      capTop: false,
    });
  }

  // Sculpted High-Rise Pelvis & Double-Pleated Upper Block (Y = 0.72..1.015)
  const pelvisSegs = lite ? 28 : 48;
  const pelvisSteps = lite ? 8 : 14;
  const pelvisRings: LoftRing[] = [];

  for (let r = 0; r <= pelvisSteps; r += 1) {
    const t = r / pelvisSteps; // 0 = hip/crotch bridge (0.72), 1 = below waistband (1.015)
    const y = 0.72 + t * 0.295;

    // Taper smoothly from tailored hip width (0.205) to tailored waist (0.165) — fits cleanly beneath untucked tops
    const smoothT = t * t * (3 - 2 * t);
    const rx = 0.205 * (1 - smoothT) + 0.165 * smoothT;
    const rzFront = 0.12 * (1 - smoothT) + 0.108 * smoothT;
    const rzBack = 0.124 * (1 - smoothT) + 0.106 * smoothT;

    const pts: Vec3[] = [];
    const aoFactors: number[] = [];

    for (let c = 0; c < pelvisSegs; c += 1) {
      const theta = (c / pelvisSegs) * Math.PI * 2;
      const [sx, sz] = superEllipsePoint(theta, rx, rzFront, rzBack, 2.35);

      // DOUBLE FORWARD PLEATS on front (+Z) at X = ±0.065 and X = ±0.115
      let pleatBump = 0;
      let pleatAo = 1.0;
      if (Math.sin(theta) > 0.25) {
        const pleatEnv = Math.sin(t * Math.PI * 0.92 + 0.08);
        for (const pleatX of [-0.11, -0.062, 0.062, 0.11]) {
          const d = Math.abs(sx - pleatX);
          const ridge = Math.exp(-Math.pow(d / 0.014, 2)) * 0.011 * pleatEnv;
          const groove = Math.exp(-Math.pow((d - 0.016) / 0.008, 2)) * 0.006 * pleatEnv;
          pleatBump += ridge - groove;
          if (groove > 0.002) {
            pleatAo *= 0.84;
          }
        }
        // Subtle fly overlap seam at center front
        const flyDist = Math.abs(sx);
        if (flyDist < 0.018 && t > 0.22) {
          pleatBump += 0.004;
        }
      }

      // Subtle back center seat contour seam
      const backDip =
        Math.sin(theta) < -0.6 && Math.abs(sx) < 0.04
          ? -Math.exp(-Math.pow(sx / 0.025, 2)) * 0.008 * (1 - t * 0.5)
          : 0;

      const radLen = Math.hypot(sx, sz) || 1;
      const delta = pleatBump + backDip;
      pts.push([sx + (sx / radLen) * delta * 0.2, y, sz + (sz / radLen) * delta]);
      aoFactors.push(pleatAo);
    }

    pelvisRings.push({
      points: pts,
      vCoord: 2.1 + t * 0.85,
      aoFactors,
      ringAo: 0.92 + 0.08 * t,
    });
  }

  appendLoftedSurface(body, pelvisRings, {
    closedCircumference: true,
    color: WHITE,
    uRepeat: 2.2,
    capBottom: true,
    bottomCapAo: 0.58,
  });

  // Contoured Tailored Waistband (secondary slot, Y = 1.012..1.058)
  const wbRings: LoftRing[] = [];
  for (let k = 0; k <= 3; k += 1) {
    const u = k / 3;
    const pts: Vec3[] = [];
    for (let c = 0; c < pelvisSegs; c += 1) {
      const theta = (c / pelvisSegs) * Math.PI * 2;
      const [sx, sz] = superEllipsePoint(theta, 0.168, 0.111, 0.109, 2.35);
      pts.push([sx, 1.012 + u * 0.046, sz]);
    }
    wbRings.push({ points: pts, vCoord: u * 0.18, ringAo: 0.88 + 0.12 * u });
  }
  appendLoftedSurface(secondary, wbRings, {
    closedCircumference: true,
    color: WHITE,
    uRepeat: 2.2,
    topLipInset: 0.007,
    topLipDepth: 0.024,
  });

  // Extended tailored waistband front closure tab (signature detail from product description!)
  appendBeveledBox(secondary, 0.032, 1.035, 0.114, 0.11, 0.042, 0.01, 0.003, WHITE);

  // 6 Tailored Belt Loops evenly positioned around waistband
  const loopAngles = [0.35, 1.15, 2.0, 2.78, 4.1, 5.3];
  for (const ang of loopAngles) {
    const [lx, lz] = superEllipsePoint(ang, 0.171, 0.114, 0.112, 2.35);
    appendBeveledBox(secondary, lx, 1.035, lz, 0.013, 0.052, 0.01, 0.002, WHITE, -ang + Math.PI / 2);
  }

  // Rear twin tailored welt pocket trims (-Z)
  appendBeveledBox(secondary, -0.072, 0.905, -0.114, 0.088, 0.012, 0.007, 0.002, WHITE);
  appendBeveledBox(secondary, 0.072, 0.905, -0.114, 0.088, 0.012, 0.007, 0.002, WHITE);

  // Matte horn waistband extended-tab button + concealed hook-bar accent (hardware)
  appendFashionButton(hardware, 0.072, 1.035, 0.118, 0.011, 0.005, 14, WHITE, '+Z');
  appendBeveledBox(hardware, 0.0, 1.035, 0.116, 0.016, 0.006, 0.006, 0.001, WHITE);

  return { body, secondary, hardware };
}

/**
 * 4. ATELIER BOXY WOOL OVERSHIRT (80% Virgin Wool, 20% Polyamide)
 * Calibrated outer-shell layering dimensions (+2.8cm over Tee for clean Outfit Studio layering!).
 * Structured boxy cropped silhouette, wide spread collar, twin beveled welt chest pockets,
 * clean straight hem with double-faced thickness, cuffed long sleeves, and 5 sculpted horn/bronze buttons.
 */
function buildBoxyWoolOvershirt(lite: boolean): GarmentPartsResult {
  const body = createSculptAccumulator();
  const secondary = createSculptAccumulator();
  const hardware = createSculptAccumulator();

  const radSegs = lite ? 28 : 48;
  const ySteps = lite ? 12 : 20;
  const yBottom = 0.125;
  const yShoulder = 0.845;

  const torsoRings: LoftRing[] = [];
  for (let r = 0; r <= ySteps; r += 1) {
    const t = r / ySteps;
    let rx: number;
    let rzFront: number;
    let rzBack: number;

    if (t < 0.8) {
      const k = t / 0.8;
      // Boxy structured virgin wool architecture — cleanly clears inner Crew Tee (rx=0.23, rz=0.135)
      rx = 0.258 + (k > 0.5 ? (k - 0.5) * 0.036 : 0);
      rzFront = 0.156 + Math.sin(k * Math.PI) * 0.009;
      rzBack = 0.154 + Math.sin(k * Math.PI) * 0.007;
    } else {
      const s = (t - 0.8) / 0.2;
      const smoothS = s * s * (3 - 2 * s);
      rx = 0.268 * (1 - smoothS) + 0.102 * smoothS;
      rzFront = 0.16 * (1 - smoothS) + 0.095 * smoothS;
      rzBack = 0.157 * (1 - smoothS) + 0.088 * smoothS;
    }

    const pts: Vec3[] = [];
    const aoFactors: number[] = [];

    for (let c = 0; c < radSegs; c += 1) {
      const theta = (c / radSegs) * Math.PI * 2;
      const [sx, sz] = superEllipsePoint(theta, rx, rzFront, rzBack, t > 0.82 ? 2.2 : 2.85);

      // Firm double-faced virgin wool holds boxy architectural planes with very shallow tension folds
      const subtleDrape =
        Math.pow(1 - t, 1.2) * Math.sin(theta * 4 + 0.5) * 0.0028;

      // Subtle V-neck placket opening at top center front so layered inner Tee collar shows cleanly!
      const frontCenter = Math.max(0, Math.sin(theta));
      const vNotch =
        t > 0.78
          ? Math.pow((t - 0.78) / 0.22, 1.3) * Math.pow(frontCenter, 3) * 0.068
          : 0;
      const shoulderDrop =
        t > 0.78 ? Math.pow((t - 0.78) / 0.22, 1.1) * Math.abs(Math.cos(theta)) * 0.02 : 0;

      const radLen = Math.hypot(sx, sz) || 1;
      pts.push([
        sx + (sx / radLen) * subtleDrape,
        yBottom + (yShoulder - yBottom) * t - vNotch - shoulderDrop,
        sz + (sz / radLen) * subtleDrape,
      ]);
      aoFactors.push(0.95 + 0.05 * Math.sin(theta * 4));
    }

    torsoRings.push({
      points: pts,
      vCoord: t * 1.9,
      aoFactors,
      ringAo: 0.9 + 0.1 * t,
    });
  }

  appendLoftedSurface(body, torsoRings, {
    closedCircumference: true,
    color: WHITE,
    uRepeat: 2.3,
    bottomLipInset: 0.011, // thick double-faced wool hem edge
    bottomLipDepth: 0.022,
    topLipInset: 0.008,
    topLipDepth: 0.016,
  });

  // Structured set-in outerwear sleeves (+1.8cm clearance over inner tee sleeves)
  for (const side of [-1, 1] as const) {
    const cuffInfo = appendTailoredSleeve(body, side, {
      shoulderX: side * 0.246,
      shoulderY: 0.706,
      shoulderZ: 0.0,
      length: 0.492,
      pitchOutRad: 0.17,
      forwardCurveZ: 0.022,
      radiusTopX: 0.096,
      radiusTopZ: 0.098,
      radiusEndX: 0.068,
      radiusEndZ: 0.07,
      lengthSteps: lite ? 8 : 15,
      radialSteps: lite ? 16 : 26,
      drapeAmp: 0.003,
      lipInset: 0.007,
    });

    // Structured double-faced wool cuff band cleanly overlapping sleeve wrist seam
    const [cx, cy, cz] = cuffInfo.cuffCenter;
    const cuffSegs = lite ? 16 : 24;
    const cuffRings: LoftRing[] = [];
    for (let k = 0; k <= 3; k += 1) {
      const h = (k / 3) * 0.066;
      const pts: Vec3[] = [];
      for (let s = 0; s < cuffSegs; s += 1) {
        const th = (s / cuffSegs) * Math.PI * 2;
        pts.push([
          cx + Math.cos(th) * 0.071 - side * (h - 0.044) * 0.17,
          cy - 0.043 + h,
          cz + Math.sin(th) * 0.073,
        ]);
      }
      cuffRings.push({ points: pts, vCoord: k * 0.12, ringAo: 0.88 + k * 0.04 });
    }
    appendLoftedSurface(secondary, cuffRings, {
      closedCircumference: true,
      color: WHITE,
      bottomLipInset: 0.006,
      bottomLipDepth: 0.012,
    });

    appendFashionButton(
      hardware,
      cx + side * 0.073,
      cy - 0.022,
      cz + 0.015,
      0.01,
      0.005,
      12,
      WHITE,
      side > 0 ? '+X' : '-X',
    );
  }

  // Sculpted wide spread outerwear collar (secondary)
  const collarCols = lite ? 18 : 30;
  const collarRows = 5;
  const collarGrid: Vec3[][] = [];
  for (let r = 0; r < collarRows; r += 1) {
    const v = r / (collarRows - 1);
    const rowPts: Vec3[] = [];
    for (let c = 0; c < collarCols; c += 1) {
      const u = c / (collarCols - 1);
      // Open front V spread sweeping around nape
      const theta = Math.PI * 0.5 + 0.36 + u * (Math.PI * 2 - 0.72);
      const tipProximity = Math.min(u, 1 - u);
      const leafLen = 0.062 + Math.exp(-tipProximity * 5.0) * 0.028;
      const radBase = 0.102;
      const flareOut = (1 - v) * (0.042 + Math.exp(-tipProximity * 4.0) * 0.022);
      const x = Math.cos(theta) * (radBase + flareOut);
      const z = Math.sin(theta) * (radBase + flareOut);
      const frontDrop = Math.max(0, Math.sin(theta)) * 0.052;
      const y = 0.858 - frontDrop - (1 - v) * leafLen + Math.sin(v * Math.PI) * 0.008;
      rowPts.push([x, y, z]);
    }
    collarGrid.push(rowPts);
  }
  appendThickPanel(secondary, collarGrid, 0.009, WHITE, 2.8);

  // Center-front structured button placket strip (secondary)
  appendBeveledBox(secondary, 0, 0.455, 0.163, 0.046, 0.645, 0.012, 0.003, WHITE);

  // Two clean architectural welt chest pockets with subtle horizontal welt lips (secondary)
  for (const side of [-1, 1] as const) {
    // Pocket body subtle panel
    appendBeveledBox(secondary, side * 0.125, 0.575, 0.161, 0.122, 0.132, 0.012, 0.004, WHITE, side * -0.08);
    // Crisp top welt lip bar
    appendBeveledBox(secondary, side * 0.125, 0.638, 0.168, 0.126, 0.024, 0.014, 0.003, WHITE, side * -0.08);
  }

  // 5 Sculpted Matte Horn / Warm Bronze Buttons down center front (hardware slot)
  const btnCount = lite ? 4 : 5;
  for (let i = 0; i < btnCount; i += 1) {
    const by = 0.73 - i * (0.52 / Math.max(1, btnCount - 1));
    appendFashionButton(hardware, 0, by, 0.169, 0.0125, 0.0055, lite ? 10 : 16, WHITE, '+Z');
  }

  return { body, secondary, hardware };
}

/**
 * 5. ATELIER ARCHIVE FIELD JACKET (100% Waxed Long-Staple Cotton Twill)
 * Distinct mid-thigh utility field jacket with stand funnel collar, concealed storm flap,
 * 4 sculpted 3D pleated bellows pockets (2 chest + 2 hip), waist drawcord channel,
 * shoulder epaulettes, cuff tabs, and matte snap closures.
 */
function buildArchiveFieldJacket(lite: boolean): GarmentPartsResult {
  const body = createSculptAccumulator();
  const secondary = createSculptAccumulator();
  const hardware = createSculptAccumulator();

  const radSegs = lite ? 26 : 44;
  const ySteps = lite ? 12 : 20;
  const yBottom = 0.055;
  const yTop = 0.85;

  const torsoRings: LoftRing[] = [];
  for (let r = 0; r <= ySteps; r += 1) {
    const t = r / ySteps;
    let rx: number;
    let rzFront: number;
    let rzBack: number;

    if (t < 0.82) {
      const k = t / 0.82;
      // Subtle internal waist drawcord cinch around k = 0.42
      const waistCinch = -Math.exp(-Math.pow((k - 0.42) / 0.12, 2)) * 0.016;
      rx = 0.264 + waistCinch + (k > 0.6 ? (k - 0.6) * 0.03 : 0);
      rzFront = 0.158 + waistCinch * 0.7;
      rzBack = 0.158 + waistCinch * 0.7;
    } else {
      const s = (t - 0.82) / 0.18;
      const sm = s * s * (3 - 2 * s);
      rx = 0.27 * (1 - sm) + 0.095 * sm;
      rzFront = 0.158 * (1 - sm) + 0.092 * sm;
      rzBack = 0.158 * (1 - sm) + 0.088 * sm;
    }

    const pts: Vec3[] = [];
    const aoFactors: number[] = [];
    for (let c = 0; c < radSegs; c += 1) {
      const theta = (c / radSegs) * Math.PI * 2;
      const [sx, sz] = superEllipsePoint(theta, rx, rzFront, rzBack, 2.7);
      const waxedFold = Math.sin(theta * 5 + t * 2.5) * 0.0035 * (1 - t * 0.5);
      const len = Math.hypot(sx, sz) || 1;
      const shoulderSlope =
        t > 0.8 ? Math.pow((t - 0.8) / 0.2, 1.1) * Math.abs(Math.cos(theta)) * 0.02 : 0;
      pts.push([
        sx + (sx / len) * waxedFold,
        yBottom + (yTop - yBottom) * t - shoulderSlope,
        sz + (sz / len) * waxedFold,
      ]);
      aoFactors.push(0.92 + 0.08 * Math.sin(theta * 5));
    }

    torsoRings.push({
      points: pts,
      vCoord: t * 2.1,
      aoFactors,
      ringAo: 0.88 + 0.12 * t,
    });
  }

  appendLoftedSurface(body, torsoRings, {
    closedCircumference: true,
    color: WHITE,
    uRepeat: 2.3,
    bottomLipInset: 0.01,
    bottomLipDepth: 0.02,
  });

  // Utility sleeves + cuff adjuster tabs with seamless rounded shoulder cap
  for (const side of [-1, 1] as const) {
    const cuff = appendTailoredSleeve(body, side, {
      shoulderX: side * 0.25,
      shoulderY: 0.712,
      length: 0.495,
      pitchOutRad: 0.17,
      forwardCurveZ: 0.024,
      radiusTopX: 0.098,
      radiusTopZ: 0.1,
      radiusEndX: 0.072,
      radiusEndZ: 0.072,
      lengthSteps: lite ? 8 : 14,
      radialSteps: lite ? 16 : 24,
      drapeAmp: 0.004,
      lipInset: 0.007,
    });
    appendBeveledBox(
      secondary,
      cuff.cuffCenter[0] + side * 0.068,
      cuff.cuffCenter[1] + 0.035,
      cuff.cuffCenter[2] + 0.012,
      0.016,
      0.03,
      0.064,
      0.003,
      WHITE,
    );
    appendFashionButton(
      hardware,
      cuff.cuffCenter[0] + side * 0.076,
      cuff.cuffCenter[1] + 0.035,
      cuff.cuffCenter[2] + 0.024,
      0.0085,
      0.0045,
      10,
      WHITE,
      side > 0 ? '+X' : '-X',
    );
  }

  // Stand Funnel Collar (secondary)
  const funnelSegs = lite ? 24 : 38;
  const funnelRings: LoftRing[] = [];
  for (let k = 0; k <= 3; k += 1) {
    const u = k / 3;
    const pts: Vec3[] = [];
    for (let s = 0; s < funnelSegs; s += 1) {
      const th = (s / funnelSegs) * Math.PI * 2;
      const [sx, sz] = superEllipsePoint(th, 0.098 + u * 0.005, 0.096 + u * 0.005, 0.092 + u * 0.004, 2.15);
      pts.push([sx, 0.835 + u * 0.072, sz]);
    }
    funnelRings.push({ points: pts, vCoord: u * 0.25, ringAo: 0.88 + 0.12 * u });
  }
  appendLoftedSurface(secondary, funnelRings, {
    closedCircumference: true,
    color: WHITE,
    topLipInset: 0.008,
    topLipDepth: 0.025,
  });

  // Concealed Storm Placket + Shoulder Epaulettes + Waist Drawcord Seam
  appendBeveledBox(secondary, 0, 0.455, 0.165, 0.056, 0.77, 0.014, 0.003, WHITE);
  appendBeveledBox(secondary, -0.17, 0.83, 0.0, 0.135, 0.012, 0.044, 0.003, WHITE);
  appendBeveledBox(secondary, 0.17, 0.83, 0.0, 0.135, 0.012, 0.044, 0.003, WHITE);

  // 4 Sculpted 3D Bellows Cargo Pockets (2 chest + 2 deep lower hip) with mitered flaps & snaps
  for (const side of [-1, 1] as const) {
    // Upper chest bellows pocket
    appendBeveledBox(secondary, side * 0.128, 0.59, 0.166, 0.12, 0.145, 0.026, 0.005, WHITE, side * -0.09);
    appendBeveledBox(secondary, side * 0.128, 0.652, 0.178, 0.126, 0.044, 0.014, 0.003, WHITE, side * -0.09);
    appendFashionButton(hardware, side * 0.128, 0.642, 0.185, 0.009, 0.004, 10, WHITE, '+Z');

    // Lower hip large bellows pocket
    appendBeveledBox(secondary, side * 0.138, 0.23, 0.168, 0.142, 0.175, 0.034, 0.006, WHITE, side * -0.1);
    appendBeveledBox(secondary, side * 0.138, 0.308, 0.182, 0.148, 0.048, 0.016, 0.003, WHITE, side * -0.1);
    appendFashionButton(hardware, side * 0.138, 0.296, 0.19, 0.009, 0.004, 10, WHITE, '+Z');
  }

  // Storm placket concealed matte snap studs
  for (let i = 0; i < 5; i += 1) {
    appendFashionButton(hardware, 0.008, 0.78 - i * 0.165, 0.173, 0.009, 0.004, 10, WHITE, '+Z');
  }

  return { body, secondary, hardware };
}

/**
 * Anatomical EU42 court sneaker footprint planform (1 unit = 1m).
 * s runs from 0 (heel back Z=-0.125) to 1 (toe tip Z=+0.160), total length = 0.285m.
 */
function sneakerPlanform(
  theta: number,
  side: -1 | 1,
  scaleX = 1.0,
  scaleZ = 1.0,
): [number, number] {
  // theta = PI/2 is toe (+Z), 3PI/2 is heel (-Z), 0 is +X, PI is -X
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  // Asymmetric anatomical last: slightly fuller medial ball, gently tapered lateral almond toe
  const isToe = sin > 0;
  const zHalf = isToe ? 0.158 : 0.126;
  const z = sin * zHalf * scaleZ;

  // Width profile along foot length
  const tAlong = (sin + 1) * 0.5; // 0 heel -> 1 toe
  const ballWidth = 0.052;
  const heelWidth = 0.039;
  const waistNarrow = Math.exp(-Math.pow((tAlong - 0.38) / 0.16, 2)) * -0.006;
  const toeTaper = isToe ? Math.pow(sin, 2.2) * -0.012 : 0;
  const halfW = (heelWidth + (ballWidth - heelWidth) * Math.sin(tAlong * Math.PI * 0.75) + waistNarrow + toeTaper) * scaleX;

  // Subtle anatomical medial curve (big toe slightly inward)
  const medialShift = isToe ? -side * Math.pow(sin, 2) * 0.007 : 0;
  const x = cos * halfW + medialShift;
  return [x, z];
}

/**
 * 6. MOVEMENT MINIMALIST LEATHER SNEAKER PAIR (Full-Grain Calfskin + Margom Rubber Cup Sole)
 * Renders an anatomically sculpted LEFT & RIGHT pair resting cleanly on Y = 0.000
 * at X = ±0.118 (aligned identically with Outfit Studio `feet` anchor AND iconic on PDP/Showroom!).
 */
function buildMinimalistLeatherSneakerPair(lite: boolean): GarmentPartsResult {
  const body = createSculptAccumulator();
  const secondary = createSculptAccumulator();
  const hardware = createSculptAccumulator();

  const radSegs = lite ? 24 : 42;

  for (const side of [-1, 1] as const) {
    const cx = side * 0.116;
    const cz = 0.016;
    const yaw = side * 0.055; // natural editorial outward toe stance
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    const toWorld = (lx: number, ly: number, lz: number): Vec3 => [
      cx + lx * cosY + lz * sinY,
      ly,
      cz - lx * sinY + lz * cosY,
    ];

    // A. STITCHED MARGOM-INSPIRED RUBBER CUP SOLE (secondary, Y = 0.000..0.033)
    const soleProfile: ReadonlyArray<readonly [number, number, number, number]> = [
      // [y, scaleX, scaleZ, ao]
      [0.0, 0.96, 0.985, 0.68], // ground contact tread rim
      [0.005, 1.01, 1.005, 0.84], // outsole edge bevel
      [0.016, 1.01, 1.005, 0.94],
      [0.022, 0.992, 0.996, 0.8], // sidewall stitch channel groove!
      [0.026, 1.008, 1.004, 0.96], // upper cup rim lip
      [0.032, 0.985, 0.992, 0.98],
    ];

    const soleRings: LoftRing[] = [];
    for (let p = 0; p < soleProfile.length; p += 1) {
      const [y, sx, sz, ao] = soleProfile[p]!;
      const pts: Vec3[] = [];
      for (let s = 0; s < radSegs; s += 1) {
        const th = (s / radSegs) * Math.PI * 2;
        const [lx, lz] = sneakerPlanform(th, side, sx, sz);
        // Subtle toe spring rocker lifting front tip by 3mm
        const toeSpring = lz > 0.105 && y < 0.01 ? (lz - 0.105) * 0.045 : 0;
        pts.push(toWorld(lx, y + toeSpring, lz));
      }
      soleRings.push({ points: pts, vCoord: p * 0.1, ringAo: ao });
    }
    appendLoftedSurface(secondary, soleRings, {
      closedCircumference: true,
      color: WHITE,
      uRepeat: 2.0,
      capBottom: true,
      capTop: true,
      bottomCapAo: 0.55,
    });

    // B. SCULPTED CLOSED-VAMP FULL-GRAIN CALFSKIN COURT UPPER (body, Y = 0.027..0.100)
    // Morphs continuously from the full sole welt perimeter (t=0) up and back over the rounded
    // almond toe box and instep into the true low-top ankle collar oval centered at z = -0.048 (t=1),
    // forming a 100% solid, closed luxury Italian court sneaker last with zero toe gap.
    const upperRings: LoftRing[] = [];
    const upperLevels = lite ? 10 : 18;
    const collarCenterZ = -0.048;
    const collarRx = 0.031;
    const collarRz = 0.056;

    for (let r = 0; r <= upperLevels; r += 1) {
      const t = r / upperLevels; // 0 = sole welt seam, 1 = plush ankle collar opening
      const pts: Vec3[] = [];
      const aoFactors: number[] = [];

      for (let s = 0; s < radSegs; s += 1) {
        const th = (s / radSegs) * Math.PI * 2;
        const cos = Math.cos(th);
        const sin = Math.sin(th);
        const [soleX, soleZ] = sneakerPlanform(th, side, 0.962, 0.972);

        // Target point on the low-top ankle opening oval (centered at collarCenterZ)
        const targetX = cos * collarRx;
        const targetZ = collarCenterZ + sin * collarRz;

        // Smooth Hermite blend between forefoot vamp (sin > 0) and rear quarter/collar (sin < 0)
        // eliminating any sharp side step along the midfoot transition!
        const rawW = Math.max(0, Math.min(1, (sin + 0.22) / 0.44));
        const frontBlend = rawW * rawW * (3 - 2 * rawW);

        // Forefoot / toe-box / instep evaluation
        const sinPos = Math.max(0, sin);
        const toeFullness = Math.pow(sinPos, 0.85);
        const pullBack =
          Math.pow(t, 1.55) * (0.65 + 0.35 * toeFullness) +
          Math.pow(t, 3.2) * (0.35 * (1 - toeFullness));
        const xShrinkF = Math.pow(t, 1.38);
        const fx = soleX * (1 - xShrinkF) + targetX * xShrinkF;
        const fz = soleZ * (1 - pullBack) + targetZ * pullBack;
        const toeDomeRise = Math.pow(Math.min(1, t / 0.32), 0.62) * 0.025;
        const instepSlope = Math.max(0, (t - 0.22) / 0.78) * (0.038 + (1 - toeFullness) * 0.008);
        const vampCrown =
          Math.sin(t * Math.PI) * Math.pow(sinPos, 0.6) * (1 - Math.abs(cos) * 0.55) * 0.011;
        const fy = 0.027 + toeDomeRise + instepSlope + vampCrown;

        // Rear quarter / ankle malleolus dip / Achilles heel counter evaluation
        const backFactor = Math.max(0, -sin);
        const inwardEase = Math.pow(t, 1.65);
        const qx = soleX * (1 - inwardEase * 0.38) + targetX * (inwardEase * 0.38);
        const qz = soleZ * (1 - inwardEase * 0.22) + targetZ * (inwardEase * 0.22);
        const sideMalleolusDip = Math.exp(-Math.pow(backFactor / 0.42, 2)) * 0.014;
        const quarterTop = 0.068 - sideMalleolusDip + backFactor * 0.005;
        const qy = 0.027 + Math.pow(t, 0.92) * quarterTop;

        const lx = qx * (1 - frontBlend) + fx * frontBlend;
        const ly = qy * (1 - frontBlend) + fy * frontBlend;
        const lz = qz * (1 - frontBlend) + fz * frontBlend;

        // Crisp subtle Italian side-quarter stitch panel contour
        const panelRidge =
          t > 0.08 && t < 0.85
            ? Math.exp(-Math.pow((lz - 0.018) / 0.012, 2)) * 0.0014
            : 0;
        const rad = Math.hypot(lx, lz) || 1;
        pts.push(toWorld(lx + (lx / rad) * panelRidge, ly, lz + (lz / rad) * panelRidge));

        const weltAo = t < 0.12 ? 0.82 + t * 1.2 : 1.0;
        const vampShade = sin > 0 ? 0.94 + 0.06 * t : 0.91 + 0.09 * t;
        aoFactors.push(weltAo * vampShade);
      }

      upperRings.push({
        points: pts,
        vCoord: t * 1.35,
        aoFactors,
        ringAo: 0.9 + 0.1 * t,
      });
    }

    appendLoftedSurface(body, upperRings, {
      closedCircumference: true,
      color: WHITE,
      uRepeat: 2.2,
      topLipInset: 0.012, // plush padded leather ankle collar lip!
      topLipDepth: 0.036,
    });

    // Dark cushioned interior footbed base inside ankle cavity (prevents seeing hollow underside)
    const insolePts: Vec3[] = [];
    for (let s = 0; s < (lite ? 12 : 20); s += 1) {
      const th = (s / (lite ? 12 : 20)) * Math.PI * 2;
      insolePts.push(toWorld(Math.cos(th) * 0.024, 0.042, collarCenterZ + Math.sin(th) * 0.044));
    }
    appendLoftedSurface(
      secondary,
      [
        { points: insolePts, vCoord: 0, ringAo: 0.42 },
        {
          points: insolePts.map(([ix, iy, iz]) => [ix, iy + 0.004, iz] as Vec3),
          vCoord: 0.1,
          ringAo: 0.48,
        },
      ],
      { closedCircumference: true, color: WHITE, capTop: true },
    );

    // C. STITCHED LEATHER EYESTAY FACINGS + CURVED PLUSH LEATHER TONGUE + HEEL TAB
    const tongueRows = 7;
    const tongueCols = 7;
    const tongueGrid: Vec3[][] = [];
    for (let r = 0; r < tongueRows; r += 1) {
      const v = r / (tongueRows - 1); // 0 = lower vamp throat (z=+0.072), 1 = top tongue crest (z=+0.002)
      const rowPts: Vec3[] = [];
      for (let c = 0; c < tongueCols; c += 1) {
        const u = (c / (tongueCols - 1)) * 2 - 1; // -1..1
        const w = (0.023 + v * 0.006) * (1 - Math.pow(u, 4) * 0.18);
        const lx = u * w;
        const arch = Math.cos(u * Math.PI * 0.5);
        const lz = 0.074 - v * 0.072 + arch * 0.007;
        const ly = 0.062 + v * 0.044 + arch * 0.006;
        rowPts.push(toWorld(lx, ly, lz));
      }
      tongueGrid.push(rowPts);
    }
    appendThickPanel(body, tongueGrid, 0.0065, WHITE, 2.0);

    // Subtle raised twin eyestay leather strips flanking the laces (body)
    for (const eSide of [-1, 1] as const) {
      const esGrid: Vec3[][] = [];
      for (let r = 0; r < 6; r += 1) {
        const f = r / 5;
        const lz = 0.068 - f * 0.066;
        const ly = 0.065 + f * 0.034;
        const innerX = eSide * (0.017 + f * 0.007);
        const outerX = eSide * (0.032 + f * 0.007);
        esGrid.push([
          toWorld(eSide > 0 ? innerX : outerX, ly - 0.005, lz),
          toWorld((innerX + outerX) * 0.5, ly + 0.001, lz),
          toWorld(eSide > 0 ? outerX : innerX, ly - 0.003, lz),
        ]);
      }
      appendThickPanel(body, esGrid, 0.0035, WHITE, 1.8);
    }

    // Minimalist stitched Achilles heel tab patch (secondary)
    const heelGrid: Vec3[][] = [];
    for (let r = 0; r < 4; r += 1) {
      const v = r / 3;
      const rowPts: Vec3[] = [];
      for (let c = 0; c < 7; c += 1) {
        const u = (c / 6) * 2 - 1;
        const ang = Math.PI * 1.5 + u * 0.46;
        const [bx, bz] = sneakerPlanform(ang, side, 0.92, 0.94);
        const ly = 0.066 + v * 0.031;
        rowPts.push(toWorld(bx * 0.88, ly, bz * 0.95 - 0.002));
      }
      heelGrid.push(rowPts);
    }
    appendThickPanel(secondary, heelGrid, 0.004, WHITE, 1.5);

    // D. 6 PAIRS OF BRUSHED METALLIC BRONZE EYELETS (hardware) + PROUD 3D FLAT COTTON LACES (secondary)
    const eyeletPairs = lite ? 5 : 6;
    const leftEyelets: Vec3[] = [];
    const rightEyelets: Vec3[] = [];

    for (let i = 0; i < eyeletPairs; i += 1) {
      const f = i / Math.max(1, eyeletPairs - 1); // 0 = lowest near toe, 1 = highest near collar
      const lz = 0.066 - f * 0.062;
      const ly = 0.068 + f * 0.033;
      const lxOff = 0.022 + f * 0.006;

      const pL = toWorld(-lxOff, ly, lz);
      const pR = toWorld(lxOff, ly, lz);
      leftEyelets.push(pL);
      rightEyelets.push(pR);

      // Crisp brushed bronze eyelet grommet
      appendSculptedEllipsoid(hardware, pL[0], pL[1] + 0.002, pL[2], 0.0046, 0.0026, 0.0046, 4, 8, WHITE);
      appendSculptedEllipsoid(hardware, pR[0], pR[1] + 0.002, pR[2], 0.0046, 0.0026, 0.0046, 4, 8, WHITE);
    }

    // Horizontal clean minimalist bottom bar lace sitting proudly on vamp tongue
    const botL = leftEyelets[0]!;
    const botR = rightEyelets[0]!;
    appendSweptTube(
      secondary,
      [
        [botL[0], botL[1] + 0.003, botL[2]],
        [(botL[0] + botR[0]) * 0.5, (botL[1] + botR[1]) * 0.5 + 0.009, (botL[2] + botR[2]) * 0.5 + 0.003],
        [botR[0], botR[1] + 0.003, botR[2]],
      ],
      () => 0.0042,
      { radialSegments: 6, aspectRatio: 2.5, color: WHITE },
    );

    // Criss-cross flat waxed cotton laces standing cleanly proud above the tongue arch
    for (let i = 0; i < eyeletPairs - 1; i += 1) {
      const aL = leftEyelets[i]!;
      const bR = rightEyelets[i + 1]!;
      const aR = rightEyelets[i]!;
      const bL = leftEyelets[i + 1]!;

      appendSweptTube(
        secondary,
        [
          [aL[0], aL[1] + 0.003, aL[2]],
          [(aL[0] + bR[0]) * 0.5, (aL[1] + bR[1]) * 0.5 + 0.011, (aL[2] + bR[2]) * 0.5 + 0.004],
          [bR[0], bR[1] + 0.003, bR[2]],
        ],
        () => 0.0038,
        { radialSegments: 6, aspectRatio: 2.4, color: WHITE },
      );
      appendSweptTube(
        secondary,
        [
          [aR[0], aR[1] + 0.003, aR[2]],
          [(aR[0] + bL[0]) * 0.5, (aR[1] + bL[1]) * 0.5 + 0.013, (aR[2] + bL[2]) * 0.5 + 0.005],
          [bL[0], bL[1] + 0.003, bL[2]],
        ],
        () => 0.0038,
        { radialSegments: 6, aspectRatio: 2.4, color: WHITE },
      );
    }
  }

  return { body, secondary, hardware };
}

/**
 * 7. FORM STRUCTURED CALFSKIN CROSSBODY (100% Vegetable-Tanned Calfskin Leather)
 * Architectural 26x19x9cm body resting squarely at Y=0, chamfered bevel edges,
 * contoured magnetic envelope front flap, accordion side gussets, curved detachable
 * woven webbing shoulder strap rising gracefully to Y=0.66, brushed brass bar lock,
 * side D-rings, swivel snap hooks, and rectangular strap adjuster buckle.
 */
function buildStructuredCalfskinCrossbody(lite: boolean): GarmentPartsResult {
  const body = createSculptAccumulator();
  const secondary = createSculptAccumulator();
  const hardware = createSculptAccumulator();

  // A. MAIN ARCHITECTURAL STRUCTURED BODY (Y = 0.000..0.195)
  // Softly chamfered saddle-leather rectangular shell with subtle natural bottom settle
  const bodyRings: LoftRing[] = [];
  const radSegs = lite ? 24 : 40;
  const levels = 7;

  for (let r = 0; r <= levels; r += 1) {
    const t = r / levels;
    const y = t * 0.192;
    // Slight architectural trapezoid taper narrower at top, subtle beveled bottom/top chamfer
    const chamfer =
      t === 0 || t === 1 ? 0.94 : t === 1 / levels || t === 1 - 1 / levels ? 0.995 : 1.0;
    const rx = (0.138 - t * 0.006) * chamfer;
    const rz = (0.048 - t * 0.005) * chamfer;

    const pts: Vec3[] = [];
    const aoFactors: number[] = [];

    for (let s = 0; s < radSegs; s += 1) {
      const th = (s / radSegs) * Math.PI * 2;
      const [sx, sz] = superEllipsePoint(th, rx, rz, rz, 5.2); // crisp structured architectural rounded corners

      // Accordion gusset subtle inward pinch along +-X side centers
      const sidePinch =
        Math.abs(Math.cos(th)) > 0.82 && t > 0.12 && t < 0.88
          ? -Math.exp(-Math.pow(Math.sin(th) / 0.25, 2)) * 0.009 * Math.sin(t * Math.PI)
          : 0;
      const px = sx + Math.sign(sx) * sidePinch;
      pts.push([px, y, sz]);
      aoFactors.push(sidePinch < -0.003 ? 0.82 : 0.96);
    }

    bodyRings.push({
      points: pts,
      vCoord: t * 1.1,
      aoFactors,
      ringAo: 0.88 + 0.12 * t,
    });
  }

  appendLoftedSurface(body, bodyRings, {
    closedCircumference: true,
    color: WHITE,
    uRepeat: 2.0,
    capBottom: true,
    capTop: true,
    bottomCapAo: 0.65,
  });

  // B. CONTOURED TOP-OVER-FRONT MAGNETIC ENVELOPE FLAP (body)
  // Wraps smoothly from top back hinge over top spine and drops down front face to Y = 0.052
  const flapRows = lite ? 10 : 16;
  const flapCols = lite ? 10 : 16;
  const flapGrid: Vec3[][] = [];

  for (let r = 0; r < flapRows; r += 1) {
    const v = r / (flapRows - 1); // 0 = front bottom flap edge, 1 = top-back hinge
    const rowPts: Vec3[] = [];
    for (let c = 0; c < flapCols; c += 1) {
      const u = (c / (flapCols - 1)) * 2 - 1; // -1..1
      // Subtle rounded bottom corners on front flap
      const cornerRound = v < 0.18 ? Math.pow(Math.abs(u), 5) * 0.012 * (1 - v / 0.18) : 0;
      const halfW = 0.136 - cornerRound * 0.5;
      const x = u * halfW;

      let y: number;
      let z: number;
      if (v < 0.68) {
        // Front vertical flap face
        const fv = v / 0.68;
        y = 0.054 + cornerRound + fv * 0.132;
        z = 0.052 + Math.sin(fv * Math.PI) * 0.003;
      } else {
        // Smooth curved leather fold arching over the top of the bag to back seam
        const av = (v - 0.68) / 0.32; // 0 front-top -> 1 back-top
        const ang = av * Math.PI;
        y = 0.186 + Math.sin(ang) * 0.018;
        z = Math.cos(ang) * 0.052;
      }
      rowPts.push([x, y, z]);
    }
    flapGrid.push(rowPts);
  }
  appendThickPanel(body, flapGrid, 0.007, WHITE, 2.2);

  // C. TONAL HAND-PAINTED EDGE TRIM & DETACHABLE ARCHED WEBBING STRAP (secondary)
  // Crisp edge-paint accent line along flap bottom & side gusset seams
  appendBeveledBox(secondary, 0, 0.053, 0.054, 0.256, 0.005, 0.008, 0.001, WHITE);
  appendBeveledBox(secondary, -0.137, 0.095, 0.0, 0.006, 0.175, 0.012, 0.002, WHITE);
  appendBeveledBox(secondary, 0.137, 0.095, 0.0, 0.006, 0.175, 0.012, 0.002, WHITE);

  // Side leather anchor tabs holding D-rings
  appendBeveledBox(secondary, -0.138, 0.162, 0.0, 0.014, 0.032, 0.028, 0.003, WHITE);
  appendBeveledBox(secondary, 0.138, 0.162, 0.0, 0.014, 0.032, 0.028, 0.003, WHITE);

  // Smooth catenary-arched detachable woven webbing shoulder strap (Y = 0.195..0.66)
  const strapPath: Vec3[] = [];
  const strapSteps = lite ? 16 : 28;
  for (let i = 0; i <= strapSteps; i += 1) {
    const t = i / strapSteps; // 0 left hook -> 1 right hook
    const ang = Math.PI * (1 - t); // PI -> 0
    // Gentle graceful shoulder arch with organic slight depth curve
    const sx = Math.cos(ang) * (0.146 + Math.sin(ang) * 0.024);
    const sy = 0.192 + Math.pow(Math.sin(ang), 0.78) * 0.468;
    const sz = Math.sin(ang * 2) * 0.008 - Math.sin(ang) * 0.012;
    strapPath.push([sx, sy, sz]);
  }
  appendSweptTube(secondary, strapPath, () => 0.0085, {
    radialSegments: lite ? 8 : 12,
    aspectRatio: 2.6,
    color: WHITE,
    uvScale: 6.0,
    capEnds: true,
  });

  // D. SATIN BRUSHED ARCHITECTURAL BRASS HARDWARE (hardware slot)
  // Geometric brushed brass magnetic bar lock on center flap
  appendBeveledBox(hardware, 0, 0.072, 0.059, 0.068, 0.016, 0.012, 0.003, WHITE);
  appendBeveledBox(hardware, 0, 0.06, 0.056, 0.044, 0.01, 0.008, 0.002, WHITE);

  // Twin side D-rings & swivel snap clasp hooks
  for (const side of [-1, 1] as const) {
    // D-ring bracket
    appendBeveledBox(hardware, side * 0.146, 0.174, 0.0, 0.014, 0.024, 0.024, 0.003, WHITE);
    // Swivel lobster clasp connecting to strap end
    appendBeveledBox(hardware, side * 0.147, 0.196, 0.0, 0.012, 0.026, 0.022, 0.003, WHITE);
  }

  // Rectangular brass strap adjuster buckle along left ascending strap
  appendBeveledBox(hardware, -0.156, 0.42, -0.005, 0.012, 0.028, 0.04, 0.003, WHITE, 0.12);

  return { body, secondary, hardware };
}

export function buildSculptedGarmentParts(
  silhouette: GarmentSilhouetteInput,
  lite: boolean,
  productSlug?: string,
): GarmentPartsResult {
  const variant = resolveGarmentStyleVariant(silhouette, productSlug);
  switch (variant) {
    case 'trouser':
      return buildWideLegTrouser(lite);
    case 'sneaker':
      return buildMinimalistLeatherSneakerPair(lite);
    case 'crossbody':
      return buildStructuredCalfskinCrossbody(lite);
    case 'shirt':
      return buildOversizedPoplinShirt(lite);
    case 'field_jacket':
      return buildArchiveFieldJacket(lite);
    case 'overshirt':
      return buildBoxyWoolOvershirt(lite);
    case 'tee':
    default:
      return buildHeavyweightCrewTee(lite);
  }
}
