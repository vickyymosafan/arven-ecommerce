import { OUTFIT_STUDIO_POLICY } from '@arven/config';
import { ExperiencesDomainError } from '../errors/experiences-domain.error.js';

const ZONE_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RIG_ID_PATTERN = /^arven_mannequin_[a-z0-9_]+$/;

export interface ShowroomZoneStorageKeys {
  readonly sceneObjectKey: string;
  readonly liteSceneObjectKey: string;
  readonly posterKey: string;
}

export interface MannequinRigStorageKeys {
  readonly modelKey: string;
  readonly liteModelKey: string;
  readonly posterKey: string;
}

export function padVersion4(version: number): string {
  if (!Number.isInteger(version) || version < 1) {
    throw new ExperiencesDomainError(
      400,
      'VALIDATION_ERROR',
      'Asset version must be a positive integer.',
    );
  }
  return `v${String(version).padStart(4, '0')}`;
}

export function assertValidZoneCode(code: string): string {
  const normalized = code.trim();
  if (!normalized || normalized.length > 64 || !ZONE_CODE_PATTERN.test(normalized)) {
    throw new ExperiencesDomainError(
      400,
      'VALIDATION_ERROR',
      'Invalid showroom zone code format.',
    );
  }
  return normalized;
}

export function buildShowroomZoneKeys(
  code: string,
  version = 1,
): ShowroomZoneStorageKeys {
  const safeCode = assertValidZoneCode(code);
  const v = padVersion4(version);
  return {
    sceneObjectKey: `showroom/${safeCode}/${v}/scene.glb`,
    liteSceneObjectKey: `showroom/${safeCode}/${v}/scene-lite.glb`,
    posterKey: `showroom/${safeCode}/${v}/poster.svg`,
  };
}

export function buildMannequinRigKeys(rigId: string): MannequinRigStorageKeys {
  const normalized = rigId.trim();
  if (
    !normalized ||
    normalized.length > 64 ||
    !RIG_ID_PATTERN.test(normalized) ||
    normalized !== OUTFIT_STUDIO_POLICY.RIG_ID
  ) {
    throw new ExperiencesDomainError(
      404,
      'RESOURCE_NOT_FOUND',
      `Mannequin rig "${rigId}" was not found.`,
    );
  }

  return {
    modelKey: `rigs/${normalized}/v0001/mannequin.glb`,
    liteModelKey: `rigs/${normalized}/v0001/mannequin-lite.glb`,
    posterKey: `rigs/${normalized}/v0001/poster.svg`,
  };
}
