import { HttpStatus, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AUTH_POLICY } from '@arven/config';
import { DomainHttpException } from '../http/domain-http.exception.js';

const ARGON2_OPTIONS: argon2.HashOptions & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: AUTH_POLICY.ARGON2_MEMORY_COST_KIB,
  timeCost: AUTH_POLICY.ARGON2_TIME_COST,
  parallelism: AUTH_POLICY.ARGON2_PARALLELISM,
  hashLength: AUTH_POLICY.ARGON2_HASH_LENGTH,
  raw: false,
};

const BREACHED_PASSWORD_DENYLIST = new Set<string>([
  'password',
  'password123',
  'password1234',
  'password12345',
  'password123456',
  'password!123',
  'passw0rd1234',
  'p@ssw0rd1234',
  '123456789012',
  '1234567890123',
  '111111111111',
  '000000000000',
  'qwertyuiop12',
  'qwerty123456',
  'letmein12345',
  'welcome12345',
  'admin1234567',
  'administrator',
  'changeme1234',
  'iloveyou1234',
  'abc123456789',
  'supersecret1',
  'correcthorse',
  'luxurybrand1',
  'arven1234567',
  'arvenluxury1',
  'beyondtrends',
]);

const TRIVIAL_DICTIONARY_PATTERN =
  /^(?:password|passw0rd|qwerty|admin|administrator|welcome|letmein|changeme|iloveyou|arven|\d+)[\d!@#$%^&*._-]*$/i;

@Injectable()
export class PasswordHasherService {
  private dummyHashPromise: Promise<string> | null = null;

  private getDummyHash(): Promise<string> {
    if (!this.dummyHashPromise) {
      const nextPromise = argon2.hash(
        'arven-dummy-timing-calibration-secret-2026!',
        ARGON2_OPTIONS,
      );
      this.dummyHashPromise = nextPromise;
      return nextPromise;
    }
    return this.dummyHashPromise;
  }

  ensureValidPasswordInput(password: string): void {
    if (password.includes('\u0000')) {
      throw new DomainHttpException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Password contains disallowed null character',
        [{ field: 'password', issue: 'Password cannot contain null bytes' }],
      );
    }

    if (password.length < AUTH_POLICY.PASSWORD_MIN_LENGTH) {
      throw new DomainHttpException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        `Password must be at least ${AUTH_POLICY.PASSWORD_MIN_LENGTH} characters`,
        [
          {
            field: 'password',
            issue: `Minimum length is ${AUTH_POLICY.PASSWORD_MIN_LENGTH} characters`,
          },
        ],
      );
    }

    if (password.length > AUTH_POLICY.PASSWORD_MAX_LENGTH) {
      throw new DomainHttpException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        `Password cannot exceed ${AUTH_POLICY.PASSWORD_MAX_LENGTH} characters`,
        [
          {
            field: 'password',
            issue: `Maximum length is ${AUTH_POLICY.PASSWORD_MAX_LENGTH} characters`,
          },
        ],
      );
    }
  }

  assertNotBreachedOrTrivial(password: string, email?: string): void {
    this.ensureValidPasswordInput(password);

    const lowered = password.toLowerCase();
    const compactAlnum = lowered.replace(/[^a-z0-9]/g, '');

    if (BREACHED_PASSWORD_DENYLIST.has(lowered) || BREACHED_PASSWORD_DENYLIST.has(compactAlnum)) {
      throw new DomainHttpException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Password is too common or has appeared in known breaches',
        [{ field: 'password', issue: 'Choose a stronger unique password' }],
      );
    }

    if (TRIVIAL_DICTIONARY_PATTERN.test(password)) {
      throw new DomainHttpException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Password uses an easily guessable dictionary or numeric pattern',
        [{ field: 'password', issue: 'Choose a stronger unique password' }],
      );
    }

    const distinctChars = new Set(password).size;
    if (distinctChars < 4) {
      throw new DomainHttpException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Password must contain greater character variety',
        [{ field: 'password', issue: 'Use at least 4 distinct characters' }],
      );
    }

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      const [localPart] = normalizedEmail.split('@');
      if (
        lowered === normalizedEmail ||
        (localPart && localPart.length >= 4 && lowered === localPart)
      ) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Password cannot match your email address',
          [{ field: 'password', issue: 'Do not reuse your email address as password' }],
        );
      }
    }
  }

  async hash(password: string): Promise<string> {
    this.ensureValidPasswordInput(password);
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(storedHash: string, candidatePassword: string): Promise<boolean> {
    if (
      candidatePassword.includes('\u0000') ||
      candidatePassword.length === 0 ||
      candidatePassword.length > AUTH_POLICY.PASSWORD_MAX_LENGTH
    ) {
      return false;
    }

    try {
      return await argon2.verify(storedHash, candidatePassword);
    } catch {
      return false;
    }
  }

  async verifyOrDummy(
    storedHash: string | null | undefined,
    candidatePassword: string,
  ): Promise<boolean> {
    const dummyHash = await this.getDummyHash();
    const targetHash = storedHash && storedHash.length > 0 ? storedHash : dummyHash;

    if (
      candidatePassword.includes('\u0000') ||
      candidatePassword.length > AUTH_POLICY.PASSWORD_MAX_LENGTH
    ) {
      await argon2.verify(dummyHash, 'arven-invalid-candidate-probe').catch(() => false);
      return false;
    }

    const matched = await this.verify(targetHash, candidatePassword);
    return Boolean(storedHash && storedHash.length > 0 && matched);
  }
}
