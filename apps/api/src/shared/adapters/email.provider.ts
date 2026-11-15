import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RuntimeConfig } from '@arven/config';
import { createLogger, maskEmail, type ArvenLogger } from '@arven/observability';
import { createTransport, type Transporter } from 'nodemailer';

export const EMAIL_PROVIDER = Symbol('ARVEN_EMAIL_PROVIDER');

export interface TransactionalEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface TemplateEmailInput {
  to: string;
  template: string;
  subject: string;
  variables: Record<string, unknown>;
  locale?: 'en' | 'id';
}

export interface EmailSendResult {
  messageId: string;
  driver: 'local_capture' | 'smtp';
  capturedAtUtc?: string;
  captureFilePath?: string;
}

export interface EmailProvider {
  sendTransactional(input: TransactionalEmailInput): Promise<EmailSendResult>;
  sendTemplate(input: TemplateEmailInput): Promise<EmailSendResult>;
}

function escapeHtml(value: unknown): string {
  const raw =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : JSON.stringify(value);
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function resolveWorkspaceCaptureDir(rawDir: string): string {
  if (path.isAbsolute(rawDir)) {
    return path.normalize(rawDir);
  }
  let current = import.meta.dirname;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return path.resolve(current, rawDir);
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return path.resolve(rawDir);
}

export function renderTransactionalTemplate(input: TemplateEmailInput): {
  html: string;
  text: string;
  actionUrl?: string;
} {
  const locale = input.locale ?? 'en';
  const greeting =
    typeof input.variables['recipientName'] === 'string' &&
    input.variables['recipientName'].trim().length > 0
      ? input.variables['recipientName'].trim()
      : typeof input.variables['fullName'] === 'string' &&
          input.variables['fullName'].trim().length > 0
        ? input.variables['fullName'].trim()
        : locale === 'id'
          ? 'Pelanggan Terhormat'
          : 'Valued Client';
  const token =
    typeof input.variables['token'] === 'string' && input.variables['token'].trim().length > 0
      ? input.variables['token'].trim()
      : undefined;
  const appUrl =
    typeof input.variables['appUrl'] === 'string' && input.variables['appUrl'].trim().length > 0
      ? input.variables['appUrl'].trim().replace(/\/$/, '')
      : 'http://localhost:3000';
  const explicitActionUrl =
    typeof input.variables['actionUrl'] === 'string' &&
    input.variables['actionUrl'].trim().length > 0
      ? input.variables['actionUrl'].trim()
      : undefined;
  const actionUrl =
    explicitActionUrl ??
    (token && input.template === 'auth.verification.requested'
      ? `${appUrl}/auth/verify-email?token=${encodeURIComponent(token)}`
      : token && input.template === 'auth.password_reset.requested'
        ? `${appUrl}/auth/reset-password?token=${encodeURIComponent(token)}`
        : undefined);

  let bodyLead = '';
  let actionLabel = '';

  switch (input.template) {
    case 'auth.verification.requested':
      bodyLead =
        locale === 'id'
          ? 'Konfirmasikan alamat email Anda untuk mengaktifkan akun ARVEN Anda.'
          : 'Confirm your email address to activate your ARVEN account.';
      actionLabel = locale === 'id' ? 'Verifikasi Email' : 'Verify Email';
      break;
    case 'auth.password_reset.requested':
      bodyLead =
        locale === 'id'
          ? 'Kami menerima permintaan untuk mengatur ulang kata sandi akun ARVEN Anda.'
          : 'We received a request to reset your ARVEN account password.';
      actionLabel = locale === 'id' ? 'Atur Ulang Kata Sandi' : 'Reset Password';
      break;
    case 'auth.password_reset.completed':
      bodyLead =
        locale === 'id'
          ? 'Kata sandi akun ARVEN Anda telah berhasil diperbarui.'
          : 'Your ARVEN account password has been updated.';
      break;
    case 'auth.mfa.enabled':
      bodyLead =
        locale === 'id'
          ? 'Autentikasi dua faktor (TOTP) telah diaktifkan pada akun admin ARVEN Anda.'
          : 'Two-factor authentication (TOTP) has been enabled on your ARVEN admin account.';
      break;
    case 'user.registered':
      bodyLead =
        locale === 'id'
          ? 'Selamat datang di ARVEN. Beyond Trends. Beyond Time.'
          : 'Welcome to ARVEN. Beyond Trends. Beyond Time.';
      break;
    default:
      bodyLead = escapeHtml(input.subject);
      break;
  }

  const ctaHtml = actionUrl
    ? [
        `<p style="margin:24px 0;"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 24px;background:#17191B;color:#F8F7F3;text-decoration:none;letter-spacing:0.08em;text-transform:uppercase;font-size:12px;">${escapeHtml(actionLabel || 'Continue')}</a></p>`,
        `<p style="margin:0 0 12px;font-size:12px;color:#5E5C54;word-break:break-all;">${escapeHtml(actionUrl)}</p>`,
      ].join('')
    : '';
  const tokenHtml = token
    ? `<p style="margin:0 0 12px;font-size:12px;color:#5E5C54;font-family:monospace;">Token: ${escapeHtml(token)}</p>`
    : '';

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<body style="margin:0;padding:32px;background:#F8F7F3;color:#17191B;font-family:Georgia,serif;">',
    '<div style="max-width:560px;margin:0 auto;border:1px solid #B7B3AA;background:#F8F7F3;padding:32px;">',
    '<p style="margin:0 0 24px;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#5E5C54;">ARVEN ATELIER</p>',
    `<h1 style="margin:0 0 16px;font-size:22px;font-weight:400;color:#17191B;">${escapeHtml(input.subject)}</h1>`,
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${escapeHtml(greeting)},</p>`,
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escapeHtml(bodyLead)}</p>`,
    ctaHtml,
    tokenHtml,
    '<p style="margin:32px 0 0;font-size:12px;color:#5E5C54;">Beyond Trends. Beyond Time.</p>',
    '</div>',
    '</body>',
    '</html>',
  ].join('');

  const textLines = [
    'ARVEN ATELIER',
    '',
    input.subject,
    `${greeting},`,
    bodyLead,
    ...(actionUrl ? ['', `${actionLabel || 'Continue'}: ${actionUrl}`] : []),
    ...(token ? [`Token: ${token}`] : []),
    '',
    'Beyond Trends. Beyond Time.',
  ];

  return {
    html,
    text: textLines.join('\n'),
    ...(actionUrl ? { actionUrl } : {}),
  };
}

export class LocalCaptureEmailAdapter implements EmailProvider {
  private readonly captureDir: string;
  private readonly defaultFrom: string;
  private readonly logger: ArvenLogger;

  constructor(options: {
    captureDir: string;
    defaultFrom: string;
    nodeEnv: string;
    logLevel?: RuntimeConfig['LOG_LEVEL'];
  }) {
    if (options.nodeEnv === 'production') {
      throw new Error('LocalCaptureEmailAdapter is strictly forbidden when NODE_ENV=production');
    }
    this.captureDir = resolveWorkspaceCaptureDir(options.captureDir);
    this.defaultFrom = options.defaultFrom;
    this.logger = createLogger({
      service: '@arven/email:local_capture',
      level: options.logLevel ?? 'info',
      env: options.nodeEnv,
    });
  }

  async sendTransactional(input: TransactionalEmailInput): Promise<EmailSendResult> {
    await mkdir(this.captureDir, { recursive: true });
    const messageId = `${Date.now()}-${randomUUID()}`;
    const capturedAtUtc = new Date().toISOString();

    const htmlFileName = `${messageId}.html`;
    const jsonFileName = `${messageId}.json`;
    const htmlPath = path.join(this.captureDir, htmlFileName);
    const jsonPath = path.join(this.captureDir, jsonFileName);

    const htmlTempPath = path.join(this.captureDir, `.${htmlFileName}.${randomUUID()}.tmp`);
    const jsonTempPath = path.join(this.captureDir, `.${jsonFileName}.${randomUUID()}.tmp`);

    const payload = {
      messageId,
      from: this.defaultFrom,
      to: input.to,
      subject: input.subject,
      text: input.text ?? null,
      htmlFile: htmlFileName,
      headers: input.headers ?? {},
      metadata: input.metadata ?? {},
      capturedAtUtc,
    };

    await writeFile(htmlTempPath, input.html, 'utf8');
    await rename(htmlTempPath, htmlPath);

    await writeFile(jsonTempPath, JSON.stringify(payload, null, 2), 'utf8');
    await rename(jsonTempPath, jsonPath);

    this.logger.info(
      {
        messageId,
        toMasked: maskEmail(input.to),
        subject: input.subject,
      },
      'Captured transactional email locally',
    );

    return {
      messageId,
      driver: 'local_capture',
      capturedAtUtc,
      captureFilePath: jsonPath,
    };
  }

  async sendTemplate(input: TemplateEmailInput): Promise<EmailSendResult> {
    const rendered = renderTransactionalTemplate(input);
    const token =
      typeof input.variables['token'] === 'string' && input.variables['token'].trim().length > 0
        ? input.variables['token'].trim()
        : undefined;
    return this.sendTransactional({
      to: input.to,
      subject: input.subject,
      html: rendered.html,
      text: rendered.text,
      metadata: {
        template: input.template,
        locale: input.locale ?? 'en',
        ...(rendered.actionUrl ? { actionUrl: rendered.actionUrl } : {}),
        ...(token ? { token } : {}),
        variables: input.variables,
      },
    });
  }
}

export class SmtpEmailAdapter implements EmailProvider {
  private readonly transporter: Transporter;
  private readonly defaultFrom: string;
  private readonly logger: ArvenLogger;

  constructor(config: RuntimeConfig) {
    this.defaultFrom = config.EMAIL_FROM;
    this.logger = createLogger({
      service: '@arven/email:smtp',
      level: config.LOG_LEVEL,
      env: config.NODE_ENV,
    });
    this.transporter = createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      ...(config.SMTP_USER
        ? {
            auth: {
              user: config.SMTP_USER,
              pass: config.SMTP_PASS,
            },
          }
        : {}),
    });
  }

  async sendTransactional(input: TransactionalEmailInput): Promise<EmailSendResult> {
    const info = await this.transporter.sendMail({
      from: this.defaultFrom,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      ...(input.headers ? { headers: input.headers } : {}),
    });

    this.logger.info(
      {
        messageId: info.messageId,
        toMasked: maskEmail(input.to),
      },
      'Sent transactional email via SMTP',
    );

    return {
      messageId: info.messageId,
      driver: 'smtp',
    };
  }

  async sendTemplate(input: TemplateEmailInput): Promise<EmailSendResult> {
    const rendered = renderTransactionalTemplate(input);
    return this.sendTransactional({
      to: input.to,
      subject: input.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }
}

export function createEmailProvider(config: RuntimeConfig): EmailProvider {
  if (config.EMAIL_DRIVER === 'local_capture') {
    return new LocalCaptureEmailAdapter({
      captureDir: config.EMAIL_LOCAL_DIR,
      defaultFrom: config.EMAIL_FROM,
      nodeEnv: config.NODE_ENV,
      logLevel: config.LOG_LEVEL,
    });
  }
  return new SmtpEmailAdapter(config);
}
