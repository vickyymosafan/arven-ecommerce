import { describe, expect, it } from 'vitest';
import {
  adminUsersQuerySchema,
  assignUserRolesRequestSchema,
  createAddressRequestSchema,
  createRoleRequestSchema,
  createSuccessEnvelopeSchema,
  formatIDR,
  formatWIB,
  loginRequestSchema,
  registerRequestSchema,
  updateProfileRequestSchema,
  updateUserStatusRequestSchema,
} from '../src/index.js';

describe('@arven/validators contracts', () => {
  it('enforces strict unknown-key rejection and password policy bounds', () => {
    const tooShort = registerRequestSchema.safeParse({
      email: 'USER@ARVEN.ID',
      password: 'short',
      fullName: 'Ayu Lestari',
    });
    expect(tooShort.success).toBe(false);

    const extraField = loginRequestSchema.safeParse({
      email: 'user@arven.id',
      password: 'ValidPassword123!',
      role: 'OWNER',
    });
    expect(extraField.success).toBe(false);

    expect(
      registerRequestSchema.safeParse({
        email: 'user@arven.id',
        password: 'Null\u0000Password123',
        fullName: 'Ayu Lestari',
      }).success,
    ).toBe(false);

    const spacedPass = registerRequestSchema.safeParse({
      email: 'space@arven.id',
      password: '  passphrase with spaces  ',
      fullName: 'Ayu Lestari',
    });
    expect(spacedPass.success).toBe(true);
    if (spacedPass.success) {
      expect(spacedPass.data.password).toBe('  passphrase with spaces  ');
    }

    const valid = registerRequestSchema.safeParse({
      email: '  Sari@Arven.ID ',
      password: 'LongEnoughPassword123!',
      fullName: 'Sari Kusuma',
      phone: '0812-3456-7890',
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.email).toBe('sari@arven.id');
      expect(valid.data.phone).toBe('081234567890');
    }
  });

  it('rejects empty profile updates and validates Indonesian addresses', () => {
    expect(updateProfileRequestSchema.safeParse({}).success).toBe(false);

    const addr = createAddressRequestSchema.safeParse({
      label: 'Studio',
      recipientName: 'Raka Pratama',
      phone: '+62 811 2233 4455',
      line1: 'Jl. Senopati No. 88',
      city: 'Jakarta Selatan',
      province: 'DKI Jakarta',
      postalCode: '12190',
    });
    expect(addr.success).toBe(true);
    if (addr.success) {
      expect(addr.data.country).toBe('ID');
      expect(addr.data.isDefault).toBe(false);
    }
  });

  it('formats IDR integer money and WIB timestamps deterministically', () => {
    expect(formatIDR(1890000)).toBe('Rp 1.890.000');
    expect(formatIDR(0)).toBe('Rp 0');
    expect(() => formatIDR(1890.5)).toThrow(RangeError);
    expect(formatWIB('2026-11-14T10:30:00.000Z')).toBe('14 Nov 2026, 17:30 WIB');
  });

  it('exposes Standard Schema JSON Schema compatibility for Zod 4 + NestJS 12', () => {
    const schema = createSuccessEnvelopeSchema(loginRequestSchema);
    expect(schema['~standard'].vendor).toBe('zod');
    const jsonSchema = schema['~standard'].jsonSchema.input({ target: 'openapi-3.0' });
    expect(jsonSchema).toHaveProperty('type', 'object');
  });

  it('validates admin RBAC and audit query schemas strictly', () => {
    const role = createRoleRequestSchema.safeParse({
      code: 'MERCHANDISER',
      name: 'Merchandiser',
      permissions: ['product.read', 'product.write'],
    });
    expect(role.success).toBe(true);

    expect(
      createRoleRequestSchema.safeParse({
        code: 'bad-code',
        name: 'Invalid',
        permissions: ['unknown.perm'],
      }).success,
    ).toBe(false);

    expect(assignUserRolesRequestSchema.safeParse({ roleCodes: [] }).success).toBe(false);
    expect(updateUserStatusRequestSchema.safeParse({ status: 'SUSPENDED', reason: 'Policy violation' }).success).toBe(true);
    expect(adminUsersQuerySchema.safeParse({ page: '2', limit: '25', extraKey: 'nope' }).success).toBe(false);
  });
});
