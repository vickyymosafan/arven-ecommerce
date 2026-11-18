import { Injectable } from '@nestjs/common';
import type { ShipmentDto, ShipmentEventDto } from '@arven/contracts';
import type { Prisma } from '@arven/database';
import type { ShipmentStatusInput } from '@arven/validators';

export type ShipmentWithEventsRecord = Prisma.ShipmentGetPayload<{
  include: {
    warehouse: {
      select: {
        code: true;
      };
    };
    events: {
      orderBy: { occurredAt: 'asc' };
    };
  };
}>;

@Injectable()
export class ShippingMapper {
  toShipmentDto(shipment: ShipmentWithEventsRecord): ShipmentDto {
    const events: ShipmentEventDto[] = shipment.events.map((event) => ({
      id: event.id,
      shipmentId: event.shipmentId,
      status: event.status as ShipmentStatusInput,
      rawCode: event.rawCode,
      description: event.description,
      location: event.location,
      occurredAt: event.occurredAt.toISOString(),
      createdAt: event.createdAt.toISOString(),
    }));

    return {
      id: shipment.id,
      orderId: shipment.orderId,
      warehouseId: shipment.warehouseId,
      warehouseCode: shipment.warehouse?.code,
      provider: shipment.provider,
      serviceCode: shipment.serviceCode,
      providerReference: shipment.providerReference,
      trackingNumber: shipment.trackingNumber,
      labelUrl: shipment.labelUrl,
      status: shipment.status as ShipmentStatusInput,
      shippedAt: shipment.shippedAt ? shipment.shippedAt.toISOString() : null,
      deliveredAt: shipment.deliveredAt ? shipment.deliveredAt.toISOString() : null,
      events,
      createdAt: shipment.createdAt.toISOString(),
      updatedAt: shipment.updatedAt.toISOString(),
    };
  }
}
