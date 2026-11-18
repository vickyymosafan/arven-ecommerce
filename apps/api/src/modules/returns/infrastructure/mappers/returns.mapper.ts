import { Injectable } from '@nestjs/common';
import type { ReturnDetailDto, ReturnItemDto } from '@arven/contracts';
import type { Prisma } from '@arven/database';
import { maskEmail } from '@arven/observability';
import type { ReturnItemConditionInput, ReturnStatusInput } from '@arven/validators';

export type ReturnWithRelations = Prisma.ReturnGetPayload<{
  include: {
    order: {
      select: {
        id: true;
        orderNumber: true;
        userId: true;
        guestEmail: true;
        guestTokenHash: true;
      };
    };
    user: {
      select: {
        email: true;
      };
    };
    items: {
      orderBy: { createdAt: 'asc' };
      include: {
        orderItem: true;
      };
    };
  };
}>;

function readEvidenceKeys(raw: Prisma.JsonValue): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((entry): entry is string => typeof entry === 'string');
}

@Injectable()
export class ReturnsMapper {
  toReturnDetailDto(
    record: ReturnWithRelations,
    options: { piiMasked: boolean },
  ): ReturnDetailDto {
    const rawEmail = record.user?.email ?? record.order.guestEmail ?? null;
    const customerEmail = rawEmail
      ? options.piiMasked
        ? maskEmail(rawEmail)
        : rawEmail
      : null;

    const items: ReturnItemDto[] = record.items.map((item) => ({
      id: item.id,
      returnId: item.returnId,
      orderItemId: item.orderItemId,
      variantId: item.orderItem.variantId,
      sku: item.orderItem.skuSnapshot,
      productName: item.orderItem.productNameSnapshot,
      size: item.orderItem.sizeSnapshot,
      color: item.orderItem.colorSnapshot,
      unitPriceIdr: Number(item.orderItem.unitPriceIdr),
      purchasedQuantity: item.orderItem.quantity,
      quantity: item.quantity,
      condition: (item.condition as ReturnItemConditionInput | null) ?? null,
      restocked: item.restocked,
      createdAt: item.createdAt.toISOString(),
    }));

    return {
      id: record.id,
      orderId: record.orderId,
      orderNumber: record.order.orderNumber,
      userId: record.userId,
      customerEmail,
      piiMasked: options.piiMasked,
      status: record.status as ReturnStatusInput,
      reason: record.reason,
      customerNotes: record.customerNotes,
      evidenceKeys: readEvidenceKeys(record.evidenceKeys),
      adminNotes: record.adminNotes,
      reviewedBy: record.reviewedBy,
      reviewedAt: record.reviewedAt ? record.reviewedAt.toISOString() : null,
      receivedAt: record.receivedAt ? record.receivedAt.toISOString() : null,
      items,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
