import * as THREE from 'three';
import type { MaterialOverrideEntryInput, MaterialSlotSpecDto } from '@arven/contracts';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface AppliedSlotOutcome {
  readonly slotId: string;
  readonly materialName: string;
  readonly appliedColorHex: string;
}

/**
 * Deterministically applies approved CustomizationPreset overrides to matching
 * Three.js materials without mutating non-customizable hardware/stitching slots.
 */
export function applyMaterialPresetToScene(
  root: THREE.Object3D,
  materialSlots: ReadonlyArray<MaterialSlotSpecDto>,
  overrides: Readonly<Record<string, MaterialOverrideEntryInput>> | null,
): AppliedSlotOutcome[] {
  const slotByMaterialName = new Map<string, MaterialSlotSpecDto>();
  const slotByMeshName = new Map<string, MaterialSlotSpecDto>();

  for (const slot of materialSlots) {
    slotByMaterialName.set(slot.materialName, slot);
    for (const meshName of slot.meshNames) {
      slotByMeshName.set(meshName, slot);
    }
  }

  const outcomes: AppliedSlotOutcome[] = [];

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) {
      return;
    }

    const matList = Array.isArray(obj.material)
      ? obj.material
      : obj.material
        ? [obj.material]
        : [];

    for (const mat of matList) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) {
        continue;
      }

      const slot =
        slotByMaterialName.get(mat.name) ?? slotByMeshName.get(obj.name);
      if (!slot) {
        continue;
      }

      const override = slot.customizable && overrides ? overrides[slot.slotId] : undefined;
      const targetHex = override?.baseColorHex ?? slot.defaultBaseColorHex;

      mat.color.set(targetHex);

      if (override?.roughness !== undefined && slot.customizable) {
        mat.roughness = clamp(
          override.roughness,
          slot.roughnessRange[0],
          slot.roughnessRange[1],
        );
      }
      if (override?.metalness !== undefined && slot.customizable) {
        mat.metalness = clamp(
          override.metalness,
          slot.metalnessRange[0],
          slot.metalnessRange[1],
        );
      }
      mat.needsUpdate = true;

      outcomes.push({
        slotId: slot.slotId,
        materialName: mat.name || slot.materialName,
        appliedColorHex: targetHex,
      });
    }
  });

  return outcomes;
}
