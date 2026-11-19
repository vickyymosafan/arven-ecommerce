import type { OutfitCompatibilityViolationDto } from '@arven/contracts';

export interface ExperiencesErrorDetail {
  readonly field?: string;
  readonly issue: string;
}

export class ExperiencesDomainError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: ReadonlyArray<ExperiencesErrorDetail>,
  ) {
    super(message);
    this.name = 'ExperiencesDomainError';
  }
}

export class IncompatibleOutfitSlotError extends ExperiencesDomainError {
  constructor(
    public readonly violations: ReadonlyArray<OutfitCompatibilityViolationDto>,
    message = 'One or more outfit slots are incompatible with the active mannequin rig or layer policy.',
  ) {
    const details: ExperiencesErrorDetail[] = violations.map((v) => ({
      field: v.slot === 'rig' ? 'rigId' : `slots.${v.slot}`,
      issue: `${v.reason}|productId=${v.productId ?? 'none'}|${v.message}`,
    }));
    super(422, 'INCOMPATIBLE_OUTFIT_SLOT', message, details);
    this.name = 'IncompatibleOutfitSlotError';
  }
}
