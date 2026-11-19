import { Inject, Injectable } from '@nestjs/common';
import { SHOWROOM_POLICY } from '@arven/config';
import type {
  AdminShowroomHotspotDto,
  AdminShowroomZoneDto,
  ShowroomScenesResponseDto,
} from '@arven/contracts';
import { ShowroomZoneStatus } from '@arven/database';
import {
  buildArvenShowroomZoneGlbBuffer,
  buildStudioPosterSvg,
} from '@arven/three-engine/glb';
import type {
  CreateShowroomHotspotRequest,
  CreateShowroomZoneRequest,
  TransitionShowroomZoneRequest,
  UpdateShowroomHotspotRequest,
  UpdateShowroomZoneRequest,
} from '@arven/validators';
import type { AuthenticatedActor } from '../../../../common/security/index.js';
import {
  STORAGE_PROVIDER,
  type ObjectStorageProvider,
} from '../../../../shared/adapters/storage.provider.js';
import { PrismaService } from '../../../../shared/prisma/prisma.service.js';
import { AuditLogService } from '../../../audit-notifications/audit-log.service.js';
import { assertValidShowroomZoneTransition } from '../../domain/entities/showroom-zone.entity.js';
import { ExperiencesDomainError } from '../../domain/errors/experiences-domain.error.js';
import {
  assertValidZoneCode,
  buildShowroomZoneKeys,
} from '../../domain/value-objects/storage-keys.js';
import {
  DEFAULT_SHOWROOM_CAMERA_BASELINE,
  extractLightingPreset,
  mapAdminHotspotDto,
  mapAdminZoneDto,
  mapPublicShowroomZoneDto,
  normalizeCameraBaseline,
  normalizePortals,
  normalizeZoneConfig,
  toDomainHttpException,
} from '../../infrastructure/mappers/experiences.mapper.js';
import { PrismaShowroomRepository } from '../../infrastructure/repositories/prisma-showroom.repository.js';

@Injectable()
export class ShowroomService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PrismaShowroomRepository)
    private readonly showroomRepo: PrismaShowroomRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: ObjectStorageProvider,
    @Inject(AuditLogService) private readonly auditLogService: AuditLogService,
  ) {}

  // ===========================================================================
  // Public Showroom Endpoints
  // ===========================================================================

  async listPublishedScenes(): Promise<ShowroomScenesResponseDto> {
    const zones = await this.showroomRepo.findPublishedZones();
    return {
      zones: zones.map(mapPublicShowroomZoneDto),
    };
  }

  async readPublishedZoneBinary(
    code: string,
    kind: 'default' | 'lite' | 'poster',
  ): Promise<{ readonly buffer: Buffer; readonly contentType: string }> {
    let safeCode: string;
    try {
      safeCode = assertValidZoneCode(code);
    } catch (error) {
      toDomainHttpException(error);
    }

    const zone = await this.showroomRepo.findPublishedZoneByCode(safeCode);
    if (!zone) {
      toDomainHttpException(
        new ExperiencesDomainError(
          404,
          'RESOURCE_NOT_FOUND',
          `Published showroom zone "${safeCode}" was not found`,
        ),
      );
    }

    if (kind === 'poster') {
      try {
        const posterBuf = await this.storage.readBuffer({
          scope: 'public',
          key: zone.posterKey,
        });
        const isWebp =
          posterBuf.length >= 12 &&
          posterBuf.subarray(0, 4).toString('ascii') === 'RIFF' &&
          posterBuf.subarray(8, 12).toString('ascii') === 'WEBP';
        return {
          buffer: posterBuf,
          contentType: isWebp ? 'image/webp' : 'image/svg+xml; charset=utf-8',
        };
      } catch {
        const svg = buildStudioPosterSvg({
          title: zone.title,
          subtitle: `ARVEN Virtual Showroom · ${zone.code}`,
        });
        return {
          buffer: Buffer.from(svg, 'utf8'),
          contentType: 'image/svg+xml; charset=utf-8',
        };
      }
    }

    const key =
      kind === 'lite' && zone.liteSceneObjectKey
        ? zone.liteSceneObjectKey
        : zone.sceneObjectKey;

    try {
      const glbBuffer = await this.storage.readBuffer({
        scope: 'public',
        key,
      });
      return {
        buffer: glbBuffer,
        contentType: 'model/gltf-binary',
      };
    } catch {
      toDomainHttpException(
        new ExperiencesDomainError(
          404,
          'RESOURCE_NOT_FOUND',
          'Showroom zone 3D binary was not found in storage',
        ),
      );
    }
  }

  // ===========================================================================
  // Admin Showroom Zone & Hotspot Management
  // ===========================================================================

  async listAdminZones(): Promise<AdminShowroomZoneDto[]> {
    const zones = await this.showroomRepo.findAllZones();
    return zones.map(mapAdminZoneDto);
  }

  async getAdminZone(id: string): Promise<AdminShowroomZoneDto> {
    const zone = await this.showroomRepo.findZoneById(id);
    if (!zone) {
      toDomainHttpException(
        new ExperiencesDomainError(
          404,
          'RESOURCE_NOT_FOUND',
          'Showroom zone was not found',
        ),
      );
    }
    return mapAdminZoneDto(zone);
  }

  async createAdminZone(
    actor: AuthenticatedActor,
    input: CreateShowroomZoneRequest,
    ipAddress?: string | null,
  ): Promise<AdminShowroomZoneDto> {
    const existing = await this.showroomRepo.findZoneByCode(input.code);
    if (existing) {
      toDomainHttpException(
        new ExperiencesDomainError(
          409,
          'DUPLICATE_RESOURCE',
          `Showroom zone with code "${input.code}" already exists`,
        ),
      );
    }

    const keys = buildShowroomZoneKeys(input.code, 1);
    const cameraBaseline = input.cameraBaseline ?? DEFAULT_SHOWROOM_CAMERA_BASELINE;
    const portalSpecs = input.portals.map((portal) => ({
      targetZoneCode: portal.targetZoneCode,
      position: portal.position,
    }));

    const sceneBuffer = buildArvenShowroomZoneGlbBuffer({
      code: input.code,
      title: input.title,
      lightingPreset: input.lightingPreset,
      profile: 'default',
      portals: portalSpecs,
    });
    const liteBuffer = buildArvenShowroomZoneGlbBuffer({
      code: input.code,
      title: input.title,
      lightingPreset: input.lightingPreset,
      profile: 'lite',
      portals: portalSpecs,
    });

    if (
      sceneBuffer.byteLength <= 0 ||
      sceneBuffer.byteLength > SHOWROOM_POLICY.MAX_ZONE_BYTES
    ) {
      toDomainHttpException(
        new ExperiencesDomainError(
          422,
          'VALIDATION_ERROR',
          `Generated showroom GLB (${sceneBuffer.byteLength} bytes) exceeds max limit of ${SHOWROOM_POLICY.MAX_ZONE_BYTES} bytes`,
        ),
      );
    }
    if (
      liteBuffer.byteLength <= 0 ||
      liteBuffer.byteLength > SHOWROOM_POLICY.MAX_LITE_ZONE_BYTES
    ) {
      toDomainHttpException(
        new ExperiencesDomainError(
          422,
          'VALIDATION_ERROR',
          `Generated showroom lite GLB (${liteBuffer.byteLength} bytes) exceeds max limit of ${SHOWROOM_POLICY.MAX_LITE_ZONE_BYTES} bytes`,
        ),
      );
    }

    const posterSvg = buildStudioPosterSvg({
      title: input.title,
      subtitle: `ARVEN Virtual Showroom · ${input.code}`,
    });

    await Promise.all([
      this.storage.putBuffer({
        scope: 'public',
        key: keys.sceneObjectKey,
        body: sceneBuffer,
        contentType: 'model/gltf-binary',
      }),
      this.storage.putBuffer({
        scope: 'public',
        key: keys.liteSceneObjectKey,
        body: liteBuffer,
        contentType: 'model/gltf-binary',
      }),
      this.storage.putBuffer({
        scope: 'public',
        key: keys.posterKey,
        body: Buffer.from(posterSvg, 'utf8'),
        contentType: 'image/svg+xml; charset=utf-8',
      }),
    ]);

    const configPayload: Record<string, unknown> = {
      lightingPreset: input.lightingPreset,
      bakedLighting: true,
      generator: 'ARVEN Atelier Showroom Zone Builder v1.0',
    };

    const created = await this.prisma.withTransaction(async (tx) => {
      const zone = await this.showroomRepo.createZone(tx, {
        code: input.code,
        title: input.title,
        description: input.description ?? null,
        status: ShowroomZoneStatus.DRAFT,
        sortOrder: input.sortOrder,
        sceneObjectKey: keys.sceneObjectKey,
        liteSceneObjectKey: keys.liteSceneObjectKey,
        posterKey: keys.posterKey,
        sceneBytes: BigInt(sceneBuffer.byteLength),
        liteSceneBytes: BigInt(liteBuffer.byteLength),
        cameraBaseline: cameraBaseline as unknown as Record<string, unknown>,
        portals: input.portals as unknown as ReadonlyArray<Record<string, unknown>>,
        config: configPayload,
        createdBy: actor.userId,
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'showroom.zone.created',
          resource: 'ShowroomZone',
          resourceId: zone.id,
          ipAddress: ipAddress ?? null,
          afterState: {
            code: zone.code,
            title: zone.title,
            status: zone.status,
            sceneBytes: sceneBuffer.byteLength,
            liteSceneBytes: liteBuffer.byteLength,
          },
        },
        tx,
      );

      return zone;
    });

    return mapAdminZoneDto(created);
  }

  async updateAdminZone(
    actor: AuthenticatedActor,
    id: string,
    input: UpdateShowroomZoneRequest,
    ipAddress?: string | null,
  ): Promise<AdminShowroomZoneDto> {
    const existing = await this.showroomRepo.findZoneById(id);
    if (!existing) {
      toDomainHttpException(
        new ExperiencesDomainError(
          404,
          'RESOURCE_NOT_FOUND',
          'Showroom zone was not found',
        ),
      );
    }

    const existingConfig = normalizeZoneConfig(existing.config);
    const nextLightingPreset =
      input.lightingPreset ?? extractLightingPreset(existingConfig);
    const nextConfig: Record<string, unknown> = {
      ...existingConfig,
      lightingPreset: nextLightingPreset,
      bakedLighting: true,
    };

    const nextTitle = input.title ?? existing.title;
    const nextPortals = input.portals ?? normalizePortals(existing.portals);
    const shouldRegenerateGlb =
      input.title !== undefined ||
      input.lightingPreset !== undefined ||
      input.portals !== undefined;

    let nextSceneBytes = existing.sceneBytes;
    let nextLiteBytes = existing.liteSceneBytes;

    if (shouldRegenerateGlb) {
      const portalSpecs = nextPortals.map((portal) => ({
        targetZoneCode: portal.targetZoneCode,
        position: portal.position,
      }));
      const sceneBuffer = buildArvenShowroomZoneGlbBuffer({
        code: existing.code,
        title: nextTitle,
        lightingPreset: nextLightingPreset,
        profile: 'default',
        portals: portalSpecs,
      });
      const liteBuffer = buildArvenShowroomZoneGlbBuffer({
        code: existing.code,
        title: nextTitle,
        lightingPreset: nextLightingPreset,
        profile: 'lite',
        portals: portalSpecs,
      });

      if (
        sceneBuffer.byteLength <= 0 ||
        sceneBuffer.byteLength > SHOWROOM_POLICY.MAX_ZONE_BYTES ||
        liteBuffer.byteLength <= 0 ||
        liteBuffer.byteLength > SHOWROOM_POLICY.MAX_LITE_ZONE_BYTES
      ) {
        toDomainHttpException(
          new ExperiencesDomainError(
            422,
            'VALIDATION_ERROR',
            'Regenerated showroom zone GLB exceeds size limits',
          ),
        );
      }

      const posterSvg = buildStudioPosterSvg({
        title: nextTitle,
        subtitle: `ARVEN Virtual Showroom · ${existing.code}`,
      });

      await Promise.all([
        this.storage.putBuffer({
          scope: 'public',
          key: existing.sceneObjectKey,
          body: sceneBuffer,
          contentType: 'model/gltf-binary',
        }),
        ...(existing.liteSceneObjectKey
          ? [
              this.storage.putBuffer({
                scope: 'public',
                key: existing.liteSceneObjectKey,
                body: liteBuffer,
                contentType: 'model/gltf-binary',
              }),
            ]
          : []),
        this.storage.putBuffer({
          scope: 'public',
          key: existing.posterKey,
          body: Buffer.from(posterSvg, 'utf8'),
          contentType: 'image/svg+xml; charset=utf-8',
        }),
      ]);

      nextSceneBytes = BigInt(sceneBuffer.byteLength);
      if (existing.liteSceneObjectKey) {
        nextLiteBytes = BigInt(liteBuffer.byteLength);
      }
    }

    const updated = await this.prisma.withTransaction(async (tx) => {
      const zone = await this.showroomRepo.updateZone(tx, existing.id, {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.cameraBaseline !== undefined
          ? {
              cameraBaseline: input.cameraBaseline as unknown as Record<string, unknown>,
            }
          : {}),
        ...(input.portals !== undefined
          ? {
              portals: input.portals as unknown as ReadonlyArray<Record<string, unknown>>,
            }
          : {}),
        config: nextConfig,
        sceneBytes: nextSceneBytes,
        liteSceneBytes: nextLiteBytes,
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'showroom.zone.updated',
          resource: 'ShowroomZone',
          resourceId: zone.id,
          ipAddress: ipAddress ?? null,
          beforeState: {
            title: existing.title,
            sortOrder: existing.sortOrder,
            cameraBaseline: normalizeCameraBaseline(existing.cameraBaseline),
          },
          afterState: {
            title: zone.title,
            sortOrder: zone.sortOrder,
            lightingPreset: nextLightingPreset,
          },
        },
        tx,
      );

      return zone;
    });

    return mapAdminZoneDto(updated);
  }

  async transitionAdminZone(
    actor: AuthenticatedActor,
    id: string,
    input: TransitionShowroomZoneRequest,
    ipAddress?: string | null,
  ): Promise<AdminShowroomZoneDto> {
    const updated = await this.prisma.withTransaction(async (tx) => {
      const existing = await this.showroomRepo.findZoneById(id, tx);
      if (!existing) {
        toDomainHttpException(
          new ExperiencesDomainError(
            404,
            'RESOURCE_NOT_FOUND',
            'Showroom zone was not found',
          ),
        );
      }

      let transitionResult;
      try {
        transitionResult = assertValidShowroomZoneTransition(
          {
            status: existing.status,
            sceneBytes: Number(existing.sceneBytes),
            liteSceneBytes:
              existing.liteSceneBytes !== null ? Number(existing.liteSceneBytes) : null,
            posterKey: existing.posterKey,
            publishedAt: existing.publishedAt,
          },
          input.targetStatus,
        );
      } catch (error) {
        toDomainHttpException(error);
      }

      const saved = await this.showroomRepo.updateZoneStatus(
        tx,
        existing.id,
        transitionResult.status as ShowroomZoneStatus,
        transitionResult.publishedAt,
      );

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'showroom.zone.transitioned',
          resource: 'ShowroomZone',
          resourceId: saved.id,
          ipAddress: ipAddress ?? null,
          beforeState: {
            status: existing.status,
            publishedAt: existing.publishedAt?.toISOString() ?? null,
          },
          afterState: {
            status: saved.status,
            publishedAt: saved.publishedAt?.toISOString() ?? null,
            ...(input.reason ? { reason: input.reason } : {}),
          },
        },
        tx,
      );

      return saved;
    });

    return mapAdminZoneDto(updated);
  }

  async createAdminHotspot(
    actor: AuthenticatedActor,
    zoneId: string,
    input: CreateShowroomHotspotRequest,
    ipAddress?: string | null,
  ): Promise<AdminShowroomHotspotDto> {
    const created = await this.prisma.withTransaction(async (tx) => {
      const zone = await tx.showroomZone.findUnique({
        where: { id: zoneId },
        select: { id: true, code: true },
      });
      if (!zone) {
        toDomainHttpException(
          new ExperiencesDomainError(
            404,
            'RESOURCE_NOT_FOUND',
            'Showroom zone was not found',
          ),
        );
      }

      const product = await tx.product.findFirst({
        where: { id: input.productId, deletedAt: null },
        select: { id: true },
      });
      if (!product) {
        toDomainHttpException(
          new ExperiencesDomainError(
            404,
            'RESOURCE_NOT_FOUND',
            'Referenced product was not found',
          ),
        );
      }

      if (input.variantId) {
        const variant = await tx.productVariant.findFirst({
          where: {
            id: input.variantId,
            productId: input.productId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!variant) {
          toDomainHttpException(
            new ExperiencesDomainError(
              400,
              'VALIDATION_ERROR',
              'variantId does not belong to the specified product',
            ),
          );
        }
      }

      const duplicate = await tx.showroomHotspot.findUnique({
        where: {
          zoneId_productId: {
            zoneId,
            productId: input.productId,
          },
        },
        select: { id: true },
      });
      if (duplicate) {
        toDomainHttpException(
          new ExperiencesDomainError(
            409,
            'DUPLICATE_RESOURCE',
            'A hotspot for this product already exists in this showroom zone',
          ),
        );
      }

      const hotspot = await this.showroomRepo.createHotspot(tx, {
        zoneId,
        productId: input.productId,
        variantId: input.variantId ?? null,
        label: input.label,
        positionX: input.positionX,
        positionY: input.positionY,
        positionZ: input.positionZ,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'showroom.hotspot.created',
          resource: 'ShowroomHotspot',
          resourceId: hotspot.id,
          ipAddress: ipAddress ?? null,
          afterState: {
            zoneId,
            productId: input.productId,
            label: hotspot.label,
            position: [hotspot.positionX, hotspot.positionY, hotspot.positionZ],
          },
        },
        tx,
      );

      return hotspot;
    });

    return mapAdminHotspotDto(created);
  }

  async updateAdminHotspot(
    actor: AuthenticatedActor,
    hotspotId: string,
    input: UpdateShowroomHotspotRequest,
    ipAddress?: string | null,
  ): Promise<AdminShowroomHotspotDto> {
    const updated = await this.prisma.withTransaction(async (tx) => {
      const existing = await this.showroomRepo.findHotspotById(hotspotId, tx);
      if (!existing) {
        toDomainHttpException(
          new ExperiencesDomainError(
            404,
            'RESOURCE_NOT_FOUND',
            'Showroom hotspot was not found',
          ),
        );
      }

      if (input.variantId) {
        const variant = await tx.productVariant.findFirst({
          where: {
            id: input.variantId,
            productId: existing.productId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!variant) {
          toDomainHttpException(
            new ExperiencesDomainError(
              400,
              'VALIDATION_ERROR',
              'variantId does not belong to the hotspot product',
            ),
          );
        }
      }

      const saved = await this.showroomRepo.updateHotspot(tx, existing.id, {
        ...(input.variantId !== undefined ? { variantId: input.variantId } : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.positionX !== undefined ? { positionX: input.positionX } : {}),
        ...(input.positionY !== undefined ? { positionY: input.positionY } : {}),
        ...(input.positionZ !== undefined ? { positionZ: input.positionZ } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      });

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'showroom.hotspot.updated',
          resource: 'ShowroomHotspot',
          resourceId: saved.id,
          ipAddress: ipAddress ?? null,
          beforeState: {
            label: existing.label,
            isActive: existing.isActive,
          },
          afterState: {
            label: saved.label,
            isActive: saved.isActive,
            position: [saved.positionX, saved.positionY, saved.positionZ],
          },
        },
        tx,
      );

      return saved;
    });

    return mapAdminHotspotDto(updated);
  }

  async deleteAdminHotspot(
    actor: AuthenticatedActor,
    hotspotId: string,
    ipAddress?: string | null,
  ): Promise<void> {
    await this.prisma.withTransaction(async (tx) => {
      const existing = await this.showroomRepo.findHotspotById(hotspotId, tx);
      if (!existing) {
        toDomainHttpException(
          new ExperiencesDomainError(
            404,
            'RESOURCE_NOT_FOUND',
            'Showroom hotspot was not found',
          ),
        );
      }

      await this.showroomRepo.deleteHotspot(tx, existing.id);

      await this.auditLogService.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'PRODUCT',
          action: 'showroom.hotspot.deleted',
          resource: 'ShowroomHotspot',
          resourceId: existing.id,
          ipAddress: ipAddress ?? null,
          beforeState: {
            zoneId: existing.zoneId,
            productId: existing.productId,
            label: existing.label,
          },
        },
        tx,
      );
    });
  }
}
