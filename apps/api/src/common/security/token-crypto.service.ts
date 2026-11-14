import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { RuntimeConfig } from '@arven/config';
import { RUNTIME_CONFIG } from '../../shared/config/config.module.js';

const TOTP_CIPHER_VERSION = 'v1';
const TOTP_CIPHER_AAD = Buffer.from('arven:mfa:totp:v1', 'utf8');
const PRE_AUTH_CSRF_TTL_SECONDS = 2 * 60 * 60;
const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class TokenCryptoService {
  private readonly mfaKey: Buffer;
  private readonly csrfSecret: string;

  constructor(@Inject(RUNTIME_CONFIG) config: RuntimeConfig) {
    const keyBytes = Buffer.from(config.MFA_ENCRYPTION_KEY, 'hex');
    if (keyBytes.length !== 32) {
      throw new Error('MFA_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex chars)');
    }
    this.mfaKey = keyBytes;
    this.csrfSecret = config.CSRF_SECRET;
  }

  generateOpaqueToken(byteLength = 32): string {
    return randomBytes(byteLength).toString('base64url');
  }

  sha256Hex(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  timingSafeEqualUtf8(left: string, right: string): boolean {
    const leftBuf = Buffer.from(left, 'utf8');
    const rightBuf = Buffer.from(right, 'utf8');
    if (leftBuf.length !== rightBuf.length || leftBuf.length === 0) {
      return false;
    }
    return timingSafeEqual(leftBuf, rightBuf);
  }

  encryptTotpSecret(plaintextSecret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.mfaKey, iv);
    cipher.setAAD(TOTP_CIPHER_AAD);
    const encrypted = Buffer.concat([
      cipher.update(plaintextSecret, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${TOTP_CIPHER_VERSION}:${iv.toString('base64url')}.${authTag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  decryptTotpSecret(serializedPayload: string): string {
    const [version, rest] = serializedPayload.split(':');
    if (version !== TOTP_CIPHER_VERSION || !rest) {
      throw new Error('Unsupported or malformed TOTP secret payload');
    }

    const parts = rest.split('.');
    if (parts.length !== 3) {
      throw new Error('Malformed encrypted TOTP payload segments');
    }

    const [ivPart, tagPart, cipherPart] = parts;
    if (!ivPart || !tagPart || !cipherPart) {
      throw new Error('Missing encrypted TOTP payload segments');
    }

    const iv = Buffer.from(ivPart, 'base64url');
    const authTag = Buffer.from(tagPart, 'base64url');
    const ciphertext = Buffer.from(cipherPart, 'base64url');

    if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
      throw new Error('Invalid AES-256-GCM envelope dimensions');
    }

    const decipher = createDecipheriv('aes-256-gcm', this.mfaKey, iv);
    decipher.setAAD(TOTP_CIPHER_AAD);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }

  createSessionCsrfSecret(): string {
    return randomBytes(32).toString('hex');
  }

  deriveSessionCsrfToken(csrfSecret: string): string {
    return createHmac('sha256', this.csrfSecret)
      .update(`session:${csrfSecret}`, 'utf8')
      .digest('base64url');
  }

  verifySessionCsrfToken(csrfSecret: string, candidateToken: string): boolean {
    const expected = this.deriveSessionCsrfToken(csrfSecret);
    return this.timingSafeEqualUtf8(expected, candidateToken);
  }

  issuePreAuthCsrf(nowMs = Date.now()): {
    token: string;
    cookieValue: string;
    maxAgeMs: number;
  } {
    const nonce = randomBytes(24).toString('base64url');
    const expiresAtSec = Math.floor(nowMs / 1000) + PRE_AUTH_CSRF_TTL_SECONDS;
    const payload = `${nonce}.${expiresAtSec}`;
    const sig = createHmac('sha256', this.csrfSecret)
      .update(`preauth:${payload}`, 'utf8')
      .digest('base64url');
    const cookieValue = `${payload}.${sig}`;
    const token = this.derivePreAuthHeaderToken(cookieValue);
    return {
      token,
      cookieValue,
      maxAgeMs: PRE_AUTH_CSRF_TTL_SECONDS * 1000,
    };
  }

  derivePreAuthHeaderToken(cookieValue: string): string {
    return createHmac('sha256', this.csrfSecret)
      .update(`preauth-header:${cookieValue}`, 'utf8')
      .digest('base64url');
  }

  verifyPreAuthCsrf(
    cookieValue: string | undefined,
    headerToken: string | undefined,
    nowMs = Date.now(),
  ): boolean {
    if (!cookieValue || !headerToken) {
      return false;
    }

    const parts = cookieValue.split('.');
    if (parts.length !== 3) {
      return false;
    }
    const [nonce, expRaw, sig] = parts;
    if (!nonce || !expRaw || !sig) {
      return false;
    }

    const expiresAtSec = Number(expRaw);
    if (!Number.isInteger(expiresAtSec) || expiresAtSec <= Math.floor(nowMs / 1000)) {
      return false;
    }

    const expectedSig = createHmac('sha256', this.csrfSecret)
      .update(`preauth:${nonce}.${expRaw}`, 'utf8')
      .digest('base64url');
    if (!this.timingSafeEqualUtf8(expectedSig, sig)) {
      return false;
    }

    const expectedHeader = this.derivePreAuthHeaderToken(cookieValue);
    return this.timingSafeEqualUtf8(expectedHeader, headerToken);
  }

  normalizeRecoveryCode(rawCode: string): string {
    return rawCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }

  generateRecoveryCodes(count = 8): Array<{ plaintext: string; hash: string }> {
    const codes: Array<{ plaintext: string; hash: string }> = [];
    const seen = new Set<string>();

    while (codes.length < count) {
      const bytes = randomBytes(10);
      let raw = '';
      for (let i = 0; i < 10; i++) {
        const byte = bytes[i] ?? 0;
        raw += RECOVERY_CODE_ALPHABET[byte % RECOVERY_CODE_ALPHABET.length];
      }
      if (seen.has(raw)) {
        continue;
      }
      seen.add(raw);
      const plaintext = `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
      codes.push({
        plaintext,
        hash: this.sha256Hex(raw),
      });
    }

    return codes;
  }
}
