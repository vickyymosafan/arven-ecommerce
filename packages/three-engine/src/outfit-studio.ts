export {
  DEFAULT_STUDIO_ENV_KEY,
  OutfitSlotResourceManager,
  OutfitStudioExperience,
  acquireSharedStudioEnv,
  getSharedStudioEnvRefCount,
  releaseSharedStudioEnv,
  type OutfitSlotRenderItem,
  type OutfitStudioDiagnosticsSnapshot,
  type OutfitStudioExperienceProps,
} from './components/OutfitStudioExperience.js';
export {
  OUTFIT_ANCHORS_BY_SLOT,
  OUTFIT_SLOTS,
  OUTFIT_STUDIO_RIG_ID,
  OUTFIT_STUDIO_SKELETON_VERSION,
  evaluateOutfitCompatibility,
  type OutfitCompatibilityCandidateInput,
  type OutfitCompatibilityEvaluationInput,
  type OutfitCompatibilityEvaluationResult,
} from './outfit-compatibility.js';
