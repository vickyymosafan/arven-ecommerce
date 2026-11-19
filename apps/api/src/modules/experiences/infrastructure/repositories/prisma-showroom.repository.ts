import { Inject, Injectable } from '@nestjs/common';
import {
  ShowroomZoneStatus,
  type Prisma,
  type PrismaTransactionClient,
} from '@arven/database';
import { PrismaService } from '../../../../shared/prisma/prisma.service.js';
import type {
  CreateShowroomHotspotPersistenceInput,
  CreateShowroomZonePersistenceInput,
  ShowroomHotspotRecord,
  ShowroomRepositoryPort,
  ShowroomZoneRecord,
  UpdateShowroomHotspotPersistenceInput,
  UpdateShowroomZonePersistenceInput,
} from '../../domain/ports/experiences.ports.js';

export const SHOWROOM_ZONE_INCLUDE = {
  hotspots: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: {
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          isVisible: true,
          has3dEnabled: true,
          deletedAt: true,
          variants: {
            where: { deletedAt: null },
            select: {
              id: true,
              priceIdr: true,
              isActive: true,
              deletedAt: true,
            },
          },
          media: {
            orderBy: [
              { isPrimary: 'desc' as const },
              { position: 'asc' as const },
              { createdAt: 'asc' as const },
            ],
            select: {
              url: true,
              altText: true,
              isPrimary: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ShowroomZoneInclude;

export const SHOWROOM_HOTSPOT_INCLUDE = {
  product: SHOWROOM_ZONE_INCLUDE.hotspots.include.product,
} satisfies Prisma.ShowroomHotspotInclude;

@Injectable()
export class PrismaShowroomRepository implements ShowroomRepositoryPort {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findPublishedZones(): Promise<ShowroomZoneRecord[]> {
    return this.prisma.client.showroomZone.findMany({
      where: { status: ShowroomZoneStatus.PUBLISHED },
      include: SHOWROOM_ZONE_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findPublishedZoneByCode(code: string): Promise<ShowroomZoneRecord | null> {
    return this.prisma.client.showroomZone.findFirst({
      where: {
        code,
        status: ShowroomZoneStatus.PUBLISHED,
      },
      include: SHOWROOM_ZONE_INCLUDE,
    });
  }

  async findAllZones(): Promise<ShowroomZoneRecord[]> {
    return this.prisma.client.showroomZone.findMany({
      include: SHOWROOM_ZONE_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findZoneById(
    id: string,
    tx?: PrismaTransactionClient,
  ): Promise<ShowroomZoneRecord | null> {
    const db = tx ?? this.prisma.client;
    return db.showroomZone.findUnique({
      where: { id },
      include: SHOWROOM_ZONE_INCLUDE,
    });
  }

  async findZoneByCode(
    code: string,
    tx?: PrismaTransactionClient,
  ): Promise<ShowroomZoneRecord | null> {
    const db = tx ?? this.prisma.client;
    return db.showroomZone.findUnique({
      where: { code },
      include: SHOWROOM_ZONE_INCLUDE,
    });
  }

  async findHotspotById(
    id: string,
    tx?: PrismaTransactionClient,
  ): Promise<ShowroomHotspotRecord | null> {
    const db = tx ?? this.prisma.client;
    return db.showroomHotspot.findUnique({
      where: { id },
      include: SHOWROOM_HOTSPOT_INCLUDE,
    });
  }

  async createZone(
    tx: PrismaTransactionClient,
    data: CreateShowroomZonePersistenceInput,
  ): Promise<ShowroomZoneRecord> {
    return tx.showroomZone.create({
      data: {
        code: data.code,
        title: data.title,
        description: data.description,
        status: data.status as ShowroomZoneStatus,
        sortOrder: data.sortOrder,
        sceneObjectKey: data.sceneObjectKey,
        liteSceneObjectKey: data.liteSceneObjectKey,
        posterKey: data.posterKey,
        sceneBytes: data.sceneBytes,
        liteSceneBytes: data.liteSceneBytes,
        cameraBaseline: data.cameraBaseline as Prisma.InputJsonValue,
        portals: data.portals as unknown as Prisma.InputJsonValue,
        config: data.config as Prisma.InputJsonValue,
        createdBy: data.createdBy,
      },
      include: SHOWROOM_ZONE_INCLUDE,
    });
  }

  async updateZone(
    tx: PrismaTransactionClient,
    id: string,
    data: UpdateShowroomZonePersistenceInput,
  ): Promise<ShowroomZoneRecord> {
    return tx.showroomZone.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.sceneBytes !== undefined ? { sceneBytes: data.sceneBytes } : {}),
        ...(data.liteSceneBytes !== undefined
          ? { liteSceneBytes: data.liteSceneBytes }
          : {}),
        ...(data.cameraBaseline !== undefined
          ? { cameraBaseline: data.cameraBaseline as Prisma.InputJsonValue }
          : {}),
        ...(data.portals !== undefined
          ? { portals: data.portals as unknown as Prisma.InputJsonValue }
          : {}),
        ...(data.config !== undefined
          ? { config: data.config as Prisma.InputJsonValue }
          : {}),
      },
      include: SHOWROOM_ZONE_INCLUDE,
    });
  }

  async updateZoneStatus(
    tx: PrismaTransactionClient,
    id: string,
    status: ShowroomZoneStatus,
    publishedAt: Date | null,
  ): Promise<ShowroomZoneRecord> {
    return tx.showroomZone.update({
      where: { id },
      data: {
        status,
        publishedAt,
      },
      include: SHOWROOM_ZONE_INCLUDE,
    });
  }

  async createHotspot(
    tx: PrismaTransactionClient,
    data: CreateShowroomHotspotPersistenceInput,
  ): Promise<ShowroomHotspotRecord> {
    return tx.showroomHotspot.create({
      data: {
        zoneId: data.zoneId,
        productId: data.productId,
        variantId: data.variantId,
        label: data.label,
        positionX: data.positionX,
        positionY: data.positionY,
        positionZ: data.positionZ,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
      include: SHOWROOM_HOTSPOT_INCLUDE,
    });
  }

  async updateHotspot(
    tx: PrismaTransactionClient,
    id: string,
    data: UpdateShowroomHotspotPersistenceInput,
  ): Promise<ShowroomHotspotRecord> {
    return tx.showroomHotspot.update({
      where: { id },
      data: {
        ...(data.variantId !== undefined ? { variantId: data.variantId } : {}),
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.positionX !== undefined ? { positionX: data.positionX } : {}),
        ...(data.positionY !== undefined ? { positionY: data.positionY } : {}),
        ...(data.positionZ !== undefined ? { positionZ: data.positionZ } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: SHOWROOM_HOTSPOT_INCLUDE,
    });
  }

  async deleteHotspot(tx: PrismaTransactionClient, id: string): Promise<void> {
    await tx.showroomHotspot.delete({
      where: { id },
    });
  }
}
