import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  createLogger,
  getRequestId,
  maskEmail,
  maskIp,
  maskPhone,
  patchRequestContext,
  runWithRequestContext,
  scrubSensitiveMetadata,
} from '../src/index.js';

function createMemoryStream() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { stream, chunks };
}

describe('@arven/observability PII masking and Pino redaction (T-08)', () => {
  it('redacts credentials, cookies, tokens, server keys, and PII across nested payloads', () => {
    const { stream, chunks } = createMemoryStream();
    const logger = createLogger({ service: 'api-test', env: 'test', destination: stream });

    runWithRequestContext({ requestId: 'req_12345678' }, () => {
      patchRequestContext({ actorId: 'user-uuid-1' });
      expect(getRequestId()).toBe('req_12345678');

      logger.info(
        {
          req: {
            headers: {
              cookie: 'arven_sid=super_secret_session_value',
              authorization: 'Bearer secret_jwt_value',
              'x-csrf-token': 'secret_csrf_value',
            },
          },
          body: {
            password: 'UltraSecretPassword123!',
            email: 'client@arven.id',
            phone: '+6281234567890',
            address: 'Jl. Kemang Raya No. 12',
          },
          midtransServerKey: 'SB-Mid-server-SECRETKEY123',
        },
        'Auth debug event',
      );
    });

    const rawOutput = chunks.join('');
    expect(rawOutput).not.toContain('super_secret_session_value');
    expect(rawOutput).not.toContain('secret_jwt_value');
    expect(rawOutput).not.toContain('secret_csrf_value');
    expect(rawOutput).not.toContain('UltraSecretPassword123!');
    expect(rawOutput).not.toContain('client@arven.id');
    expect(rawOutput).not.toContain('+6281234567890');
    expect(rawOutput).not.toContain('Jl. Kemang Raya No. 12');
    expect(rawOutput).not.toContain('SB-Mid-server-SECRETKEY123');
    expect(rawOutput).toContain('req_12345678');
    expect(rawOutput).toContain('user-uuid-1');
  });

  it('masks email, phone, and IP addresses deterministically', () => {
    expect(maskEmail('sari@arven.id')).toBe('s***@arven.id');
    expect(maskEmail('a@b.id')).toBe('a***@b.id');
    expect(maskPhone('+6281234567890')).toBe('****7890');
    expect(maskIp('::ffff:203.0.113.42')).toBe('203.0.113.x');
    expect(maskIp('2001:db8:85a3::8a2e:370:7334')).toBe('2001:db8:85a3::x');
  });

  it('deeply scrubs audit metadata snapshots', () => {
    const scrubbed = scrubSensitiveMetadata({
      action: 'user.login',
      nested: {
        email: 'member@arven.id',
        phone: '081298765432',
        totpSecret: 'JBSWY3DPEHPK3PXP',
        notes: 'ok',
      },
    }) as { action: string; nested: Record<string, string> };

    expect(scrubbed.action).toBe('user.login');
    expect(scrubbed.nested.email).toBe('m***@arven.id');
    expect(scrubbed.nested.phone).toBe('****5432');
    expect(scrubbed.nested.totpSecret).toBe('[Redacted]');
    expect(scrubbed.nested.notes).toBe('ok');
  });
});
