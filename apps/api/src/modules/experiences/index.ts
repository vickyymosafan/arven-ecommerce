export { ExperiencesModule } from './experiences.module.js';
export { ShowroomService } from './application/services/showroom.service.js';
export { OutfitStudioService } from './application/services/outfit-studio.service.js';
export {
  evaluateAssetCompatibilityDiagnostic,
  evaluateOutfitCompatibility,
  parseOutfitCompatibilityConfig,
  type OutfitCompatibilityCandidateInput,
  type OutfitCompatibilityEvaluationInput,
  type OutfitCompatibilityEvaluationResult,
} from './domain/policies/outfit-compatibility.policy.js';
export {
  ALLOWED_SHOWROOM_ZONE_TRANSITIONS,
  ShowroomZoneEntity,
  assertValidShowroomZoneTransition,
} from './domain/entities/showroom-zone.entity.js';
export {
  ExperiencesDomainError,
  IncompatibleOutfitSlotError,
} from './domain/errors/experiences-domain.error.js';
