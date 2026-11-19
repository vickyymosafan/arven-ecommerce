import { SHOWROOM_POLICY } from '@arven/config';
import type { ShowroomZoneStatusInput } from '@arven/validators';
import { ExperiencesDomainError } from '../errors/experiences-domain.error.js';

export const ALLOWED_SHOWROOM_ZONE_TRANSITIONS: Readonly<
  Record<ShowroomZoneStatusInput, ReadonlyArray<ShowroomZoneStatusInput>>
> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: ['DRAFT'],
} as const;

export interface ShowroomZoneStateSnapshot {
  readonly status: ShowroomZoneStatusInput;
  readonly sceneBytes: number;
  readonly liteSceneBytes: number | null;
  readonly posterKey: string;
  readonly publishedAt: Date | null;
}

export interface ShowroomZoneTransitionResult {
  readonly status: ShowroomZoneStatusInput;
  readonly publishedAt: Date | null;
}

export class ShowroomZoneEntity {
  constructor(private readonly state: ShowroomZoneStateSnapshot) {}

  canTransitionTo(targetStatus: ShowroomZoneStatusInput): boolean {
    return ALLOWED_SHOWROOM_ZONE_TRANSITIONS[this.state.status].includes(targetStatus);
  }

  transitionTo(
    targetStatus: ShowroomZoneStatusInput,
    nowUtc: Date = new Date(),
  ): ShowroomZoneTransitionResult {
    if (!this.canTransitionTo(targetStatus)) {
      throw new ExperiencesDomainError(
        409,
        'INVALID_STATE_TRANSITION',
        `Showroom zone cannot transition from "${this.state.status}" to "${targetStatus}".`,
      );
    }

    if (targetStatus === 'PUBLISHED') {
      if (
        this.state.sceneBytes <= 0 ||
        this.state.sceneBytes > SHOWROOM_POLICY.MAX_ZONE_BYTES
      ) {
        throw new ExperiencesDomainError(
          422,
          'PUBLISH_GATE_UNMET',
          `Zone scene binary (${this.state.sceneBytes} bytes) violates allowed showroom size cap (1..${SHOWROOM_POLICY.MAX_ZONE_BYTES} bytes).`,
        );
      }

      if (
        this.state.liteSceneBytes !== null &&
        (this.state.liteSceneBytes <= 0 ||
          this.state.liteSceneBytes > SHOWROOM_POLICY.MAX_LITE_ZONE_BYTES)
      ) {
        throw new ExperiencesDomainError(
          422,
          'PUBLISH_GATE_UNMET',
          `Zone lite scene binary (${this.state.liteSceneBytes} bytes) violates allowed showroom lite cap (1..${SHOWROOM_POLICY.MAX_LITE_ZONE_BYTES} bytes).`,
        );
      }

      if (!this.state.posterKey || this.state.posterKey.trim().length === 0) {
        throw new ExperiencesDomainError(
          422,
          'PUBLISH_GATE_UNMET',
          'Zone poster asset is required before publishing.',
        );
      }

      return {
        status: 'PUBLISHED',
        publishedAt: this.state.publishedAt ?? nowUtc,
      };
    }

    return {
      status: targetStatus,
      publishedAt: this.state.publishedAt,
    };
  }
}

export function assertValidShowroomZoneTransition(
  snapshot: ShowroomZoneStateSnapshot,
  targetStatus: ShowroomZoneStatusInput,
  nowUtc: Date = new Date(),
): ShowroomZoneTransitionResult {
  return new ShowroomZoneEntity(snapshot).transitionTo(targetStatus, nowUtc);
}
