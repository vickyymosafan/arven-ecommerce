import { createHash } from 'node:crypto';
import type { RuntimeConfig } from '@arven/config';
import { SHIPPING_POLICY } from '@arven/config';

export const SHIPPING_PROVIDER = Symbol('SHIPPING_PROVIDER');

export interface ShippingAddressSnapshot {
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  province: string;
  postalCode: string;
  countryCode: 'ID' | string;
}

export interface ShippingQuoteInput {
  originWarehouseCode: string;
  destination: ShippingAddressSnapshot;
  totalWeightGrams: number;
  declaredValueIdr: number;
}

export interface ShippingRateOption {
  provider: string;
  serviceCode: string;
  serviceName: string;
  costIdr: number;
  estimatedMinDays: number;
  estimatedMaxDays: number;
}

export interface CreateShipmentInput {
  orderNumber: string;
  originWarehouseCode: string;
  destination: ShippingAddressSnapshot;
  serviceCode: string;
  totalWeightGrams: number;
  items: ReadonlyArray<{ sku: string; name: string; quantity: number; weightGrams: number }>;
}

export interface ShipmentDispatchResult {
  providerReference: string;
  trackingNumber: string;
  labelUrl?: string;
}

export interface TrackingSnapshot {
  trackingNumber: string;
  status: 'READY_TO_SHIP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'RETURNED';
  events: ReadonlyArray<{
    occurredAt: Date;
    description: string;
    location?: string;
    rawCode?: string;
  }>;
}

export interface ShippingProvider {
  readonly providerCode: string;
  getRates(input: ShippingQuoteInput): Promise<ReadonlyArray<ShippingRateOption>>;
  createShipment(input: CreateShipmentInput): Promise<ShipmentDispatchResult>;
  getTracking(trackingNumber: string): Promise<TrackingSnapshot>;
  cancelShipment(providerReference: string, reason: string): Promise<{ cancelled: boolean }>;
}

export type IndonesianShippingZone = 'JABODETABEK' | 'JAVA' | 'OUTER_ISLAND';

interface RateScheduleEntry {
  provider: 'jne-adapter' | 'sicepat-adapter';
  serviceCode: 'REG' | 'YES' | 'BEST';
  serviceName: string;
  perKgIdr: Record<IndonesianShippingZone, number>;
  etaDays: Record<IndonesianShippingZone, readonly [number, number]>;
}

const RATE_SCHEDULE: ReadonlyArray<RateScheduleEntry> = [
  {
    provider: SHIPPING_POLICY.JNE_ADAPTER,
    serviceCode: 'REG',
    serviceName: 'JNE Reguler',
    perKgIdr: {
      JABODETABEK: 18_000,
      JAVA: 24_000,
      OUTER_ISLAND: 38_000,
    },
    etaDays: {
      JABODETABEK: [1, 2],
      JAVA: [2, 3],
      OUTER_ISLAND: [3, 6],
    },
  },
  {
    provider: SHIPPING_POLICY.JNE_ADAPTER,
    serviceCode: 'YES',
    serviceName: 'JNE YES (Yakin Esok Sampai)',
    perKgIdr: {
      JABODETABEK: 32_000,
      JAVA: 42_000,
      OUTER_ISLAND: 64_000,
    },
    etaDays: {
      JABODETABEK: [1, 1],
      JAVA: [1, 2],
      OUTER_ISLAND: [2, 3],
    },
  },
  {
    provider: SHIPPING_POLICY.SICEPAT_ADAPTER,
    serviceCode: 'REG',
    serviceName: 'SiCepat Reguler',
    perKgIdr: {
      JABODETABEK: 16_000,
      JAVA: 22_000,
      OUTER_ISLAND: 35_000,
    },
    etaDays: {
      JABODETABEK: [1, 2],
      JAVA: [2, 3],
      OUTER_ISLAND: [3, 5],
    },
  },
  {
    provider: SHIPPING_POLICY.SICEPAT_ADAPTER,
    serviceCode: 'BEST',
    serviceName: 'SiCepat BEST',
    perKgIdr: {
      JABODETABEK: 29_000,
      JAVA: 39_000,
      OUTER_ISLAND: 59_000,
    },
    etaDays: {
      JABODETABEK: [1, 1],
      JAVA: [1, 2],
      OUTER_ISLAND: [2, 3],
    },
  },
];

const JABODETABEK_TOKENS = [
  'jakarta',
  'bogor',
  'depok',
  'tangerang',
  'bekasi',
] as const;

const JAVA_PROVINCE_TOKENS = [
  'jawa barat',
  'west java',
  'jawa tengah',
  'central java',
  'jawa timur',
  'east java',
  'yogyakarta',
  'banten',
  'dki jakarta',
  'jakarta',
] as const;

const JAVA_CITY_TOKENS = [
  'bandung',
  'cimahi',
  'cirebon',
  'tasikmalaya',
  'sukabumi',
  'semarang',
  'surakarta',
  'solo',
  'magelang',
  'pekalongan',
  'tegal',
  'surabaya',
  'malang',
  'kediri',
  'sidoarjo',
  'gresik',
  'serang',
  'cilegon',
  'yogyakarta',
  'sleman',
  'bantul',
] as const;

export function resolveIndonesianShippingZone(
  province: string,
  city: string,
): IndonesianShippingZone {
  const normalizedProvince = province.trim().toLowerCase();
  const normalizedCity = city.trim().toLowerCase();

  if (
    normalizedProvince.includes('jakarta') ||
    JABODETABEK_TOKENS.some((token) => normalizedCity.includes(token))
  ) {
    return 'JABODETABEK';
  }

  if (
    JAVA_PROVINCE_TOKENS.some((token) => normalizedProvince.includes(token)) ||
    JAVA_CITY_TOKENS.some((token) => normalizedCity.includes(token))
  ) {
    return 'JAVA';
  }

  return 'OUTER_ISLAND';
}

export function calculateChargeableWeightKg(totalWeightGrams: number): number {
  const safeGrams =
    Number.isFinite(totalWeightGrams) && totalWeightGrams > 0
      ? totalWeightGrams
      : SHIPPING_POLICY.DEFAULT_WEIGHT_GRAMS_FALLBACK;
  return Math.max(1, Math.ceil(safeGrams / 1000));
}

export class DeterministicShippingProvider implements ShippingProvider {
  readonly providerCode = 'arven-deterministic-shipping';
  private readonly shippedReferences = new Map<string, CreateShipmentInput>();

  async getRates(input: ShippingQuoteInput): Promise<ReadonlyArray<ShippingRateOption>> {
    const zone = resolveIndonesianShippingZone(
      input.destination.province,
      input.destination.city,
    );
    const chargeableKg = calculateChargeableWeightKg(input.totalWeightGrams);

    return RATE_SCHEDULE.map((entry) => {
      const [estimatedMinDays, estimatedMaxDays] = entry.etaDays[zone];
      return {
        provider: entry.provider,
        serviceCode: entry.serviceCode,
        serviceName: entry.serviceName,
        costIdr: entry.perKgIdr[zone] * chargeableKg,
        estimatedMinDays,
        estimatedMaxDays,
      };
    });
  }

  async createShipment(input: CreateShipmentInput): Promise<ShipmentDispatchResult> {
    const digest = createHash('sha256')
      .update(`${input.orderNumber}:${input.serviceCode}:${input.originWarehouseCode}`)
      .digest('hex')
      .slice(0, 12)
      .toUpperCase();

    const providerReference = `SHP-${digest}`;
    const trackingNumber = `ARVTRK${digest}`;
    this.shippedReferences.set(providerReference, input);

    return {
      providerReference,
      trackingNumber,
    };
  }

  async getTracking(trackingNumber: string): Promise<TrackingSnapshot> {
    return {
      trackingNumber,
      status: 'READY_TO_SHIP',
      events: [
        {
          occurredAt: new Date(),
          description: 'Shipment manifest registered at origin warehouse',
          location: 'Jakarta',
          rawCode: 'MANIFEST_CREATED',
        },
      ],
    };
  }

  async cancelShipment(
    providerReference: string,
    _reason: string,
  ): Promise<{ cancelled: boolean }> {
    this.shippedReferences.delete(providerReference);
    return { cancelled: true };
  }
}

export function createShippingProvider(_config: RuntimeConfig): ShippingProvider {
  return new DeterministicShippingProvider();
}
