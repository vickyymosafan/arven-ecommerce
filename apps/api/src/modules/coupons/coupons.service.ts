import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { AdminCouponDto } from '@arven/contracts';
import {
  CouponStatus,
  DiscountType,
  Prisma,
  type Coupon,
} from '@arven/database';
import type {
  AdminCouponsQuery,
  CouponStatusInput,
  CreateCouponRequest,
  DiscountTypeInput,
  UpdateCouponRequest,
} from '@arven/validators';
import {
  DomainHttpException,
  type PaginatedResponse,
} from '../../common/http/index.js';
import {
  extractClientIp,
  type AuthenticatedActor,
  type HttpRequestLike,
} from '../../common/security/index.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { AuditLogService } from '../audit-notifications/audit-log.service.js';

function mapCouponDto(coupon: Coupon): AdminCouponDto {
  return {
    id: coupon.id,
    code: coupon.code,
    name: coupon.name,
    discountType: coupon.discountType as DiscountTypeInput,
    discountValue: Number(coupon.discountValue),
    maxDiscountIdr:
      coupon.maxDiscountIdr !== null ? Number(coupon.maxDiscountIdr) : null,
    minOrderSubtotalIdr: Number(coupon.minOrderSubtotalIdr),
    usageLimitTotal: coupon.usageLimitTotal,
    usageLimitPerUser: coupon.usageLimitPerUser,
    usedCount: coupon.usedCount,
    status: coupon.status as CouponStatusInput,
    startsAt: coupon.startsAt.toISOString(),
    endsAt: coupon.endsAt.toISOString(),
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
  };
}

function assertCouponInvariants(params: {
  discountType: string;
  discountValue: number;
  startsAt: Date;
  endsAt: Date;
}): void {
  if (params.discountType === 'PERCENTAGE' && (params.discountValue < 1 || params.discountValue > 100)) {
    throw new DomainHttpException(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      'Percentage discount value must be between 1 and 100',
      [{ field: 'discountValue', issue: 'Percentage discount value cannot exceed 100' }],
    );
  }

  if (params.endsAt.getTime() <= params.startsAt.getTime()) {
    throw new DomainHttpException(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      'endsAt must be strictly after startsAt',
      [{ field: 'endsAt', issue: 'endsAt must be after startsAt' }],
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

@Injectable()
export class CouponsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  async listCoupons(query: AdminCouponsQuery): Promise<PaginatedResponse<AdminCouponDto>> {
    const search = query.q?.trim();
    const where: Prisma.CouponWhereInput = {
      ...(query.status ? { status: query.status as CouponStatus } : {}),
      ...(search && search.length > 0
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.client.coupon.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.client.coupon.count({ where }),
    ]);

    return {
      items: rows.map(mapCouponDto),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async createCoupon(
    req: HttpRequestLike,
    actor: AuthenticatedActor,
    body: CreateCouponRequest,
  ): Promise<AdminCouponDto> {
    const code = body.code.trim().toUpperCase();
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);

    assertCouponInvariants({
      discountType: body.discountType,
      discountValue: body.discountValue,
      startsAt,
      endsAt,
    });

    try {
      return await this.prisma.withTransaction(async (tx) => {
        const created = await tx.coupon.create({
          data: {
            code,
            name: body.name,
            discountType: body.discountType as DiscountType,
            discountValue: BigInt(body.discountValue),
            maxDiscountIdr:
              body.maxDiscountIdr !== undefined && body.maxDiscountIdr !== null
                ? BigInt(body.maxDiscountIdr)
                : null,
            minOrderSubtotalIdr: BigInt(body.minOrderSubtotalIdr ?? 0),
            usageLimitTotal: body.usageLimitTotal ?? null,
            usageLimitPerUser: body.usageLimitPerUser ?? null,
            status: (body.status as CouponStatus | undefined) ?? CouponStatus.DRAFT,
            startsAt,
            endsAt,
          },
        });

        await this.auditLog.record(
          {
            actorId: actor.userId,
            actorRole: actor.roles[0] ?? 'ADMIN',
            action: 'coupon.created',
            resource: 'coupon',
            resourceId: created.id,
            ipAddress: extractClientIp(req),
            afterState: {
              code: created.code,
              discountType: created.discountType,
              discountValue: Number(created.discountValue),
              status: created.status,
              startsAt: created.startsAt.toISOString(),
              endsAt: created.endsAt.toISOString(),
            },
          },
          tx,
        );

        return mapCouponDto(created);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'COUPON_CODE_EXISTS',
          `Coupon code "${code}" already exists`,
          [{ field: 'code', issue: 'Coupon code already exists' }],
        );
      }
      throw error;
    }
  }

  async updateCoupon(
    req: HttpRequestLike,
    actor: AuthenticatedActor,
    couponId: string,
    body: UpdateCouponRequest,
  ): Promise<AdminCouponDto> {
    try {
      return await this.prisma.withTransaction(async (tx) => {
        const existing = await tx.coupon.findUnique({
          where: { id: couponId },
        });
        if (!existing) {
          throw new DomainHttpException(
            HttpStatus.NOT_FOUND,
            'COUPON_NOT_FOUND',
            'Coupon not found',
          );
        }

        const nextCode = body.code ? body.code.trim().toUpperCase() : existing.code;
        const nextDiscountType = body.discountType ?? existing.discountType;
        const nextDiscountValue =
          body.discountValue ?? Number(existing.discountValue);
        const nextStartsAt = body.startsAt
          ? new Date(body.startsAt)
          : existing.startsAt;
        const nextEndsAt = body.endsAt ? new Date(body.endsAt) : existing.endsAt;

        assertCouponInvariants({
          discountType: nextDiscountType,
          discountValue: nextDiscountValue,
          startsAt: nextStartsAt,
          endsAt: nextEndsAt,
        });

        const updated = await tx.coupon.update({
          where: { id: couponId },
          data: {
            ...(body.code !== undefined ? { code: nextCode } : {}),
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(body.discountType !== undefined
              ? { discountType: body.discountType as DiscountType }
              : {}),
            ...(body.discountValue !== undefined
              ? { discountValue: BigInt(body.discountValue) }
              : {}),
            ...(body.maxDiscountIdr !== undefined
              ? {
                  maxDiscountIdr:
                    body.maxDiscountIdr !== null ? BigInt(body.maxDiscountIdr) : null,
                }
              : {}),
            ...(body.minOrderSubtotalIdr !== undefined
              ? { minOrderSubtotalIdr: BigInt(body.minOrderSubtotalIdr) }
              : {}),
            ...(body.usageLimitTotal !== undefined
              ? { usageLimitTotal: body.usageLimitTotal }
              : {}),
            ...(body.usageLimitPerUser !== undefined
              ? { usageLimitPerUser: body.usageLimitPerUser }
              : {}),
            ...(body.status !== undefined
              ? { status: body.status as CouponStatus }
              : {}),
            ...(body.startsAt !== undefined ? { startsAt: nextStartsAt } : {}),
            ...(body.endsAt !== undefined ? { endsAt: nextEndsAt } : {}),
          },
        });

        await this.auditLog.record(
          {
            actorId: actor.userId,
            actorRole: actor.roles[0] ?? 'ADMIN',
            action: 'coupon.updated',
            resource: 'coupon',
            resourceId: updated.id,
            ipAddress: extractClientIp(req),
            beforeState: {
              code: existing.code,
              discountType: existing.discountType,
              discountValue: Number(existing.discountValue),
              status: existing.status,
              startsAt: existing.startsAt.toISOString(),
              endsAt: existing.endsAt.toISOString(),
            },
            afterState: {
              code: updated.code,
              discountType: updated.discountType,
              discountValue: Number(updated.discountValue),
              status: updated.status,
              startsAt: updated.startsAt.toISOString(),
              endsAt: updated.endsAt.toISOString(),
            },
          },
          tx,
        );

        return mapCouponDto(updated);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'COUPON_CODE_EXISTS',
          'Coupon code already exists',
          [{ field: 'code', issue: 'Coupon code already exists' }],
        );
      }
      throw error;
    }
  }

  async deleteCoupon(
    req: HttpRequestLike,
    actor: AuthenticatedActor,
    couponId: string,
  ): Promise<void> {
    await this.prisma.withTransaction(async (tx) => {
      const existing = await tx.coupon.findUnique({
        where: { id: couponId },
      });
      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'COUPON_NOT_FOUND',
          'Coupon not found',
        );
      }

      if (existing.status !== CouponStatus.ARCHIVED) {
        await tx.coupon.update({
          where: { id: couponId },
          data: { status: CouponStatus.ARCHIVED },
        });
      }

      await this.auditLog.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'ADMIN',
          action: 'coupon.archived',
          resource: 'coupon',
          resourceId: existing.id,
          ipAddress: extractClientIp(req),
          beforeState: { status: existing.status },
          afterState: { status: CouponStatus.ARCHIVED },
        },
        tx,
      );
    });
  }
}
