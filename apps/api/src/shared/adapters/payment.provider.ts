import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { RuntimeConfig } from '@arven/config';
import { DomainHttpException } from '../../common/http/index.js';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export const LOCAL_STUB_DEFAULT_MIDTRANS_SERVER_KEY = 'arven-local-stub-midtrans-server-key';
const PAYMENT_HTTP_TIMEOUT_MS = 10_000;
const STUB_REDIS_KEY_PREFIX = 'arven:payment-stub:';
const STUB_REDIS_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface PaymentSessionRequest {
  orderId: string;
  orderNumber: string;
  amountIdr: number;
  currency: 'IDR';
  customer: { fullName: string; email: string; phone?: string };
  items: ReadonlyArray<{ sku: string; name: string; unitPriceIdr: number; quantity: number }>;
  expiresAt: Date;
  idempotencyKey: string;
}

export interface PaymentSessionResult {
  provider: 'midtrans' | string;
  providerReference: string;
  snapToken?: string;
  redirectUrl: string;
  rawExpiresAt?: Date;
}

export interface ProviderPaymentStatus {
  providerReference: string;
  providerTransactionId?: string;
  status: 'PENDING' | 'AUTHORIZED' | 'SETTLEMENT' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
  grossAmountIdr: number;
  paymentMethod?: string;
  settledAt?: Date;
  rawPayload: Record<string, unknown>;
}

export interface VerifiedWebhookEvent {
  providerEventId: string;
  providerReference: string;
  eventType: string;
  statusCode: string;
  grossAmountRaw: string;
  mappedStatus: ProviderPaymentStatus['status'];
  rawPayload: Record<string, unknown>;
}

export interface RefundRequest {
  paymentId: string;
  providerReference: string;
  refundKey: string;
  amountIdr: number;
  reason: string;
}

export interface RefundResult {
  providerRefundId: string;
  status: 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  rawPayload: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly providerCode: string;
  createSession(input: PaymentSessionRequest): Promise<PaymentSessionResult>;
  getStatus(providerReference: string): Promise<ProviderPaymentStatus>;
  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    payload: unknown,
  ): Promise<VerifiedWebhookEvent>;
  refund(input: RefundRequest): Promise<RefundResult>;
}

export interface LocalStubPaymentRecord {
  providerReference: string;
  orderId: string;
  orderNumber: string;
  status: ProviderPaymentStatus['status'];
  grossAmountIdr: number;
  paymentMethod: string | null;
  providerTransactionId: string;
  snapToken: string;
  redirectUrl: string;
  expiresAt: string;
  settledAt: string | null;
  statusLocked: boolean;
  rawPayload: Record<string, unknown>;
}

interface MidtransWebhookShape {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  transaction_id?: string;
  fraud_status?: string;
  payment_type?: string;
  settlement_time?: string;
  [key: string]: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DomainHttpException(
      400,
      'VALIDATION_ERROR',
      'Payment webhook payload must be a JSON object',
    );
  }
  return value as Record<string, unknown>;
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const val = record[key];
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new DomainHttpException(
      400,
      'VALIDATION_ERROR',
      `Missing or invalid webhook field: ${key}`,
    );
  }
  return val.trim();
}

function parseGrossAmountIdr(rawAmount: unknown): number {
  const numeric =
    typeof rawAmount === 'number'
      ? rawAmount
      : typeof rawAmount === 'string'
        ? Number(rawAmount)
        : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new DomainHttpException(
      502,
      'PAYMENT_PROVIDER_ERROR',
      'Invalid gross_amount returned by payment provider',
    );
  }
  return Math.round(numeric);
}

export function mapMidtransTransactionStatus(
  transactionStatus: string,
  fraudStatus?: string,
): ProviderPaymentStatus['status'] {
  const status = transactionStatus.trim().toLowerCase();
  const fraud = fraudStatus?.trim().toLowerCase();

  if (status === 'settlement') {
    return 'SETTLEMENT';
  }
  if (status === 'capture') {
    if (fraud === 'deny') {
      return 'FAILED';
    }
    if (fraud === 'challenge') {
      return 'AUTHORIZED';
    }
    return 'SETTLEMENT';
  }
  if (status === 'authorize') {
    return 'AUTHORIZED';
  }
  if (status === 'pending') {
    return 'PENDING';
  }
  if (status === 'expire') {
    return 'EXPIRED';
  }
  if (status === 'refund' || status === 'partial_refund' || status === 'chargeback' || status === 'partial_chargeback') {
    return 'REFUNDED';
  }
  return 'FAILED';
}

export function computeMidtransSignature(params: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  serverKey: string;
}): string {
  return createHash('sha512')
    .update(`${params.orderId}${params.statusCode}${params.grossAmount}${params.serverKey}`)
    .digest('hex')
    .toLowerCase();
}

export function verifyMidtransWebhookSignature(params: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  serverKey: string;
  signatureKey: string;
}): void {
  const expectedHex = computeMidtransSignature({
    orderId: params.orderId,
    statusCode: params.statusCode,
    grossAmount: params.grossAmount,
    serverKey: params.serverKey,
  });
  const providedHex = params.signatureKey.trim().toLowerCase();

  const expectedBuf = Buffer.from(expectedHex, 'utf8');
  const providedBuf = Buffer.from(providedHex, 'utf8');

  if (
    expectedBuf.length !== providedBuf.length ||
    !timingSafeEqual(expectedBuf, providedBuf)
  ) {
    throw new DomainHttpException(
      401,
      'WEBHOOK_SIGNATURE_INVALID',
      'Payment webhook signature verification failed',
    );
  }
}

function buildProviderReference(orderNumber: string, idempotencyKey: string): string {
  const digest = createHash('sha256')
    .update(`${orderNumber}:${idempotencyKey}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
  return `${orderNumber}-${digest}`;
}

function parseWebhookEnvelope(payload: unknown): MidtransWebhookShape {
  const record = asRecord(payload);
  return {
    ...record,
    order_id: readRequiredString(record, 'order_id'),
    status_code: readRequiredString(record, 'status_code'),
    gross_amount: readRequiredString(record, 'gross_amount'),
    signature_key: readRequiredString(record, 'signature_key'),
    transaction_status: readRequiredString(record, 'transaction_status'),
    transaction_id:
      typeof record['transaction_id'] === 'string' ? record['transaction_id'] : undefined,
    fraud_status:
      typeof record['fraud_status'] === 'string' ? record['fraud_status'] : undefined,
    payment_type:
      typeof record['payment_type'] === 'string' ? record['payment_type'] : undefined,
    settlement_time:
      typeof record['settlement_time'] === 'string' ? record['settlement_time'] : undefined,
  };
}

export class MidtransPaymentAdapter implements PaymentProvider {
  readonly providerCode = 'midtrans';
  private readonly serverKey: string;
  private readonly snapBaseUrl: string;
  private readonly coreBaseUrl: string;

  constructor(config: Pick<RuntimeConfig, 'MIDTRANS_SERVER_KEY' | 'MIDTRANS_IS_PRODUCTION'>) {
    if (!config.MIDTRANS_SERVER_KEY || config.MIDTRANS_SERVER_KEY.trim().length === 0) {
      throw new Error('MIDTRANS_SERVER_KEY is required when PAYMENT_DRIVER=midtrans');
    }
    this.serverKey = config.MIDTRANS_SERVER_KEY;
    this.snapBaseUrl = config.MIDTRANS_IS_PRODUCTION
      ? 'https://app.midtrans.com'
      : 'https://app.sandbox.midtrans.com';
    this.coreBaseUrl = config.MIDTRANS_IS_PRODUCTION
      ? 'https://api.midtrans.com'
      : 'https://api.sandbox.midtrans.com';
  }

  private get basicAuthHeader(): string {
    return `Basic ${Buffer.from(`${this.serverKey}:`, 'utf8').toString('base64')}`;
  }

  private async requestJson(
    url: string,
    init: { method: 'GET' | 'POST'; body?: Record<string, unknown> },
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAYMENT_HTTP_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: init.method,
        headers: {
          Authorization: this.basicAuthHeader,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });

      const rawText = await response.text();
      let parsed: unknown = {};
      if (rawText.length > 0) {
        try {
          parsed = JSON.parse(rawText) as unknown;
        } catch {
          parsed = { rawText };
        }
      }

      if (!response.ok) {
        throw new DomainHttpException(
          response.status >= 500 ? 503 : 502,
          'PAYMENT_PROVIDER_ERROR',
          `Midtrans request failed with status ${response.status}`,
        );
      }

      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch (error) {
      if (error instanceof DomainHttpException) {
        throw error;
      }
      throw new DomainHttpException(
        503,
        'PAYMENT_PROVIDER_UNAVAILABLE',
        'Payment provider request failed or timed out',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async createSession(input: PaymentSessionRequest): Promise<PaymentSessionResult> {
    const providerReference = buildProviderReference(input.orderNumber, input.idempotencyKey);
    const remainingMinutes = Math.max(
      1,
      Math.ceil((input.expiresAt.getTime() - Date.now()) / 60_000),
    );

    const data = await this.requestJson(`${this.snapBaseUrl}/snap/v1/transactions`, {
      method: 'POST',
      body: {
        transaction_details: {
          order_id: providerReference,
          gross_amount: input.amountIdr,
        },
        item_details: input.items.map((item) => ({
          id: item.sku,
          price: item.unitPriceIdr,
          quantity: item.quantity,
          name: item.name.slice(0, 50),
        })),
        customer_details: {
          first_name: input.customer.fullName,
          email: input.customer.email,
          ...(input.customer.phone ? { phone: input.customer.phone } : {}),
        },
        expiry: {
          unit: 'minute',
          duration: remainingMinutes,
        },
      },
    });

    const snapToken = typeof data['token'] === 'string' ? data['token'] : undefined;
    const redirectUrl = typeof data['redirect_url'] === 'string' ? data['redirect_url'] : '';
    if (!redirectUrl) {
      throw new DomainHttpException(
        502,
        'PAYMENT_PROVIDER_ERROR',
        'Midtrans Snap did not return a redirect_url',
      );
    }

    return {
      provider: this.providerCode,
      providerReference,
      snapToken,
      redirectUrl,
      rawExpiresAt: input.expiresAt,
    };
  }

  async getStatus(providerReference: string): Promise<ProviderPaymentStatus> {
    const data = await this.requestJson(
      `${this.coreBaseUrl}/v2/${encodeURIComponent(providerReference)}/status`,
      { method: 'GET' },
    );

    const transactionStatus =
      typeof data['transaction_status'] === 'string' ? data['transaction_status'] : 'pending';
    const fraudStatus =
      typeof data['fraud_status'] === 'string' ? data['fraud_status'] : undefined;
    const settlementTime =
      typeof data['settlement_time'] === 'string' ? new Date(data['settlement_time']) : undefined;

    return {
      providerReference,
      providerTransactionId:
        typeof data['transaction_id'] === 'string' ? data['transaction_id'] : undefined,
      status: mapMidtransTransactionStatus(transactionStatus, fraudStatus),
      grossAmountIdr: parseGrossAmountIdr(data['gross_amount']),
      paymentMethod: typeof data['payment_type'] === 'string' ? data['payment_type'] : undefined,
      settledAt:
        settlementTime && !Number.isNaN(settlementTime.getTime()) ? settlementTime : undefined,
      rawPayload: data,
    };
  }

  async verifyWebhook(
    _headers: Record<string, string | string[] | undefined>,
    payload: unknown,
  ): Promise<VerifiedWebhookEvent> {
    const parsed = parseWebhookEnvelope(payload);

    verifyMidtransWebhookSignature({
      orderId: parsed.order_id,
      statusCode: parsed.status_code,
      grossAmount: parsed.gross_amount,
      serverKey: this.serverKey,
      signatureKey: parsed.signature_key,
    });

    const mappedStatus = mapMidtransTransactionStatus(
      parsed.transaction_status,
      parsed.fraud_status,
    );

    return {
      providerEventId:
        parsed.transaction_id ??
        `${parsed.order_id}:${parsed.status_code}:${parsed.transaction_status}`,
      providerReference: parsed.order_id,
      eventType: parsed.transaction_status,
      statusCode: parsed.status_code,
      grossAmountRaw: parsed.gross_amount,
      mappedStatus,
      rawPayload: parsed,
    };
  }

  async refund(input: RefundRequest): Promise<RefundResult> {
    const data = await this.requestJson(
      `${this.coreBaseUrl}/v2/${encodeURIComponent(input.providerReference)}/refund`,
      {
        method: 'POST',
        body: {
          refund_key: input.refundKey,
          amount: input.amountIdr,
          reason: input.reason,
        },
      },
    );

    const statusCode = typeof data['status_code'] === 'string' ? data['status_code'] : '500';
    return {
      providerRefundId:
        typeof data['refund_chargeback_id'] === 'string'
          ? data['refund_chargeback_id']
          : input.refundKey,
      status: statusCode.startsWith('2') ? 'SUCCEEDED' : 'FAILED',
      rawPayload: data,
    };
  }
}

export class LocalStubPaymentAdapter implements PaymentProvider {
  readonly providerCode = 'midtrans';
  private readonly serverKey: string;
  private readonly nodeEnv: RuntimeConfig['NODE_ENV'];
  private readonly appUrl: string;

  constructor(
    config: Pick<RuntimeConfig, 'NODE_ENV' | 'MIDTRANS_SERVER_KEY' | 'APP_URL'>,
    private readonly redis: Redis,
  ) {
    if (config.NODE_ENV === 'production') {
      throw new Error('LocalStubPaymentAdapter is strictly forbidden when NODE_ENV=production');
    }
    this.nodeEnv = config.NODE_ENV;
    this.serverKey =
      config.MIDTRANS_SERVER_KEY && config.MIDTRANS_SERVER_KEY.trim().length > 0
        ? config.MIDTRANS_SERVER_KEY
        : LOCAL_STUB_DEFAULT_MIDTRANS_SERVER_KEY;
    this.appUrl = config.APP_URL;
  }

  private assertNonProduction(): void {
    if (this.nodeEnv === 'production' || process.env['NODE_ENV'] === 'production') {
      throw new Error('LocalStubPaymentAdapter cannot execute in production environment');
    }
  }

  private redisKey(providerReference: string): string {
    return `${STUB_REDIS_KEY_PREFIX}${providerReference}`;
  }

  async getStubRecord(providerReference: string): Promise<LocalStubPaymentRecord | null> {
    this.assertNonProduction();
    const raw = await this.redis.get(this.redisKey(providerReference));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as LocalStubPaymentRecord;
  }

  async setStubStatus(
    providerReference: string,
    update: {
      status: ProviderPaymentStatus['status'];
      grossAmountIdr?: number;
      paymentMethod?: string | null;
      providerTransactionId?: string;
      settledAt?: Date | null;
      rawPayload?: Record<string, unknown>;
    },
  ): Promise<LocalStubPaymentRecord> {
    this.assertNonProduction();
    const existing = await this.getStubRecord(providerReference);
    if (!existing) {
      throw new DomainHttpException(
        404,
        'PAYMENT_NOT_FOUND',
        'Stub payment session not found in Redis',
      );
    }

    const updated: LocalStubPaymentRecord = {
      ...existing,
      status: update.status,
      grossAmountIdr: update.grossAmountIdr ?? existing.grossAmountIdr,
      paymentMethod:
        update.paymentMethod !== undefined ? update.paymentMethod : existing.paymentMethod,
      providerTransactionId:
        update.providerTransactionId ?? existing.providerTransactionId,
      settledAt:
        update.settledAt !== undefined
          ? update.settledAt?.toISOString() ?? null
          : update.status === 'SETTLEMENT'
            ? (existing.settledAt ?? new Date().toISOString())
            : existing.settledAt,
      statusLocked: true,
      rawPayload: update.rawPayload ?? existing.rawPayload,
    };

    await this.redis.set(
      this.redisKey(providerReference),
      JSON.stringify(updated),
      'EX',
      STUB_REDIS_TTL_SECONDS,
    );
    return updated;
  }

  async createSession(input: PaymentSessionRequest): Promise<PaymentSessionResult> {
    this.assertNonProduction();

    const providerReference = buildProviderReference(input.orderNumber, input.idempotencyKey);
    const existing = await this.getStubRecord(providerReference);
    if (existing) {
      return {
        provider: this.providerCode,
        providerReference: existing.providerReference,
        snapToken: existing.snapToken,
        redirectUrl: existing.redirectUrl,
        rawExpiresAt: new Date(existing.expiresAt),
      };
    }

    const tokenSuffix = randomBytes(8).toString('hex');
    const snapToken = `stub-snap-${tokenSuffix}`;
    const redirectUrl = `${this.appUrl.replace(/\/$/, '')}/checkout/payment-stub?ref=${encodeURIComponent(providerReference)}`;
    const record: LocalStubPaymentRecord = {
      providerReference,
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      status: 'PENDING',
      grossAmountIdr: input.amountIdr,
      paymentMethod: 'bank_transfer',
      providerTransactionId: `stub-tx-${tokenSuffix}`,
      snapToken,
      redirectUrl,
      expiresAt: input.expiresAt.toISOString(),
      settledAt: null,
      statusLocked: false,
      rawPayload: {
        order_id: providerReference,
        gross_amount: String(input.amountIdr),
        transaction_status: 'pending',
      },
    };

    await this.redis.set(
      this.redisKey(providerReference),
      JSON.stringify(record),
      'EX',
      STUB_REDIS_TTL_SECONDS,
    );

    return {
      provider: this.providerCode,
      providerReference,
      snapToken,
      redirectUrl,
      rawExpiresAt: input.expiresAt,
    };
  }

  async getStatus(providerReference: string): Promise<ProviderPaymentStatus> {
    this.assertNonProduction();

    const record = await this.getStubRecord(providerReference);
    if (!record) {
      throw new DomainHttpException(
        502,
        'PAYMENT_PROVIDER_ERROR',
        'Payment session was not found in local payment stub',
      );
    }

    return {
      providerReference: record.providerReference,
      providerTransactionId: record.providerTransactionId,
      status: record.status,
      grossAmountIdr: record.grossAmountIdr,
      paymentMethod: record.paymentMethod ?? undefined,
      settledAt: record.settledAt ? new Date(record.settledAt) : undefined,
      rawPayload: record.rawPayload,
    };
  }

  async verifyWebhook(
    _headers: Record<string, string | string[] | undefined>,
    payload: unknown,
  ): Promise<VerifiedWebhookEvent> {
    this.assertNonProduction();

    const parsed = parseWebhookEnvelope(payload);

    verifyMidtransWebhookSignature({
      orderId: parsed.order_id,
      statusCode: parsed.status_code,
      grossAmount: parsed.gross_amount,
      serverKey: this.serverKey,
      signatureKey: parsed.signature_key,
    });

    const mappedStatus = mapMidtransTransactionStatus(
      parsed.transaction_status,
      parsed.fraud_status,
    );

    const existing = await this.getStubRecord(parsed.order_id);
    if (existing && !existing.statusLocked) {
      const updated: LocalStubPaymentRecord = {
        ...existing,
        status: mappedStatus,
        paymentMethod: parsed.payment_type ?? existing.paymentMethod,
        providerTransactionId: parsed.transaction_id ?? existing.providerTransactionId,
        settledAt:
          mappedStatus === 'SETTLEMENT'
            ? (parsed.settlement_time ? new Date(parsed.settlement_time).toISOString() : new Date().toISOString())
            : existing.settledAt,
        rawPayload: parsed,
      };
      await this.redis.set(
        this.redisKey(parsed.order_id),
        JSON.stringify(updated),
        'EX',
        STUB_REDIS_TTL_SECONDS,
      );
    }

    return {
      providerEventId:
        parsed.transaction_id ??
        `${parsed.order_id}:${parsed.status_code}:${parsed.transaction_status}`,
      providerReference: parsed.order_id,
      eventType: parsed.transaction_status,
      statusCode: parsed.status_code,
      grossAmountRaw: parsed.gross_amount,
      mappedStatus,
      rawPayload: parsed,
    };
  }

  async refund(input: RefundRequest): Promise<RefundResult> {
    this.assertNonProduction();
    return {
      providerRefundId: `stub-ref-${input.refundKey}`,
      status: 'SUCCEEDED',
      rawPayload: {
        providerReference: input.providerReference,
        refundKey: input.refundKey,
        amountIdr: input.amountIdr,
      },
    };
  }
}

export function createPaymentProvider(
  config: RuntimeConfig,
  redis: Redis,
): PaymentProvider {
  if (config.PAYMENT_DRIVER === 'midtrans') {
    return new MidtransPaymentAdapter(config);
  }
  return new LocalStubPaymentAdapter(config, redis);
}
