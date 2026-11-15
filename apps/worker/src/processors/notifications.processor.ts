import { Inject } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { QUEUE_NAMES, type RuntimeConfig } from '@arven/config';
import { createLogger, maskEmail, type ArvenLogger } from '@arven/observability';
import type { Job } from 'bullmq';
import {
  WORKER_EMAIL_PROVIDER,
  type WorkerEmailProvider,
} from '../adapters/worker-email.provider.js';
import { WORKER_CONFIG } from '../config/worker-config.module.js';

export interface NotificationJobData {
  outboxEventId?: string;
  eventType?: string;
  payload?: Record<string, unknown>;
  to?: string;
  email?: string;
  subject?: string;
  template?: string;
  locale?: 'en' | 'id';
  variables?: Record<string, unknown>;
}

const SUBJECT_BY_EVENT: Readonly<Record<string, string>> = {
  'auth.verification.requested': 'Confirm your ARVEN email address',
  'auth.password_reset.requested': 'Reset your ARVEN password',
  'auth.password_reset.completed': 'Your ARVEN password was updated',
  'auth.mfa.enabled': 'Two-factor authentication enabled',
  'user.registered': 'Welcome to ARVEN',
};

function readStringField(
  source: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!source) {
    return undefined;
  }
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

@Processor(QUEUE_NAMES.NOTIFICATION)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger: ArvenLogger;

  constructor(
    @Inject(WORKER_CONFIG) private readonly config: RuntimeConfig,
    @Inject(WORKER_EMAIL_PROVIDER) private readonly emailProvider: WorkerEmailProvider,
  ) {
    super();
    this.logger = createLogger({
      service: '@arven/worker:notifications',
      level: config.LOG_LEVEL,
      env: config.NODE_ENV,
    });
  }

  async process(job: Job<NotificationJobData>): Promise<{ messageId: string }> {
    const data = job.data ?? {};
    const eventType = data.eventType ?? job.name;
    const innerPayload =
      data.payload && typeof data.payload === 'object' ? data.payload : undefined;

    const to =
      readStringField(innerPayload, 'email') ??
      readStringField(innerPayload, 'to') ??
      readStringField(data as unknown as Record<string, unknown>, 'email') ??
      readStringField(data as unknown as Record<string, unknown>, 'to');

    if (!to) {
      throw new Error(`Notification job ${job.id ?? 'unknown'} missing recipient email`);
    }

    const template =
      readStringField(data as unknown as Record<string, unknown>, 'template') ?? eventType;
    const subject =
      readStringField(innerPayload, 'subject') ??
      readStringField(data as unknown as Record<string, unknown>, 'subject') ??
      SUBJECT_BY_EVENT[eventType] ??
      'ARVEN Notification';

    const localeRaw =
      readStringField(innerPayload, 'locale') ??
      readStringField(data as unknown as Record<string, unknown>, 'locale');
    const locale: 'en' | 'id' = localeRaw === 'id' ? 'id' : 'en';

    const variables: Record<string, unknown> = {
      appUrl: this.config.APP_URL,
      ...(data.variables ?? {}),
      ...(innerPayload ?? {}),
    };

    const fullName = readStringField(variables, 'fullName');
    if (fullName && !readStringField(variables, 'recipientName')) {
      variables['recipientName'] = fullName;
    }

    const token = readStringField(variables, 'token');
    if (token && !readStringField(variables, 'actionUrl')) {
      const appUrl = this.config.APP_URL.replace(/\/$/, '');
      if (template === 'auth.verification.requested') {
        variables['actionUrl'] = `${appUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
      } else if (template === 'auth.password_reset.requested') {
        variables['actionUrl'] = `${appUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;
      }
    }

    const result = await this.emailProvider.sendTemplate({
      to,
      template,
      subject,
      locale,
      variables,
    });

    this.logger.info(
      {
        jobId: job.id ?? null,
        eventType,
        toMasked: maskEmail(to),
        driver: result.driver,
      },
      'Processed notification job',
    );

    return { messageId: result.messageId };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<NotificationJobData> | undefined, error: Error): void {
    this.logger.error(
      {
        jobId: job?.id ?? null,
        eventType: job?.data?.eventType ?? job?.name ?? 'unknown',
        attemptsMade: job?.attemptsMade ?? 0,
        errorName: error.name,
        errorMessage: error.message,
      },
      'Notification job failed',
    );
  }
}
