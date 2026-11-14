import { z } from 'zod';
import {
  paginationQuerySchema,
  userStatusSchema,
  uuidSchema,
} from './common.js';

export const permissionCodeSchema = z.enum([
  'analytics.read',
  'analytics.read.limited',
  'analytics.export',
  'product.read',
  'product.write',
  'product.publish',
  'asset.read',
  'asset.upload',
  'asset.publish',
  'inventory.read',
  'inventory.receive',
  'inventory.adjust',
  'order.read',
  'order.read.limited',
  'order.fulfill',
  'order.cancel',
  'return.read',
  'return.review',
  'return.inspect',
  'return.approve',
  'refund.request',
  'refund.approve',
  'coupon.read',
  'coupon.manage',
  'customer.read',
  'customer.note.write',
  'review.moderate',
  'cms.read',
  'cms.write',
  'cms.publish',
  'user.read',
  'user.manage.limited',
  'user.role.manage',
  'settings.provider.manage',
  'audit.read',
  'audit.read.scoped',
]);

export type PermissionCodeInput = z.infer<typeof permissionCodeSchema>;

export const customRoleCodeSchema = z
  .string()
  .trim()
  .min(2, 'Role code must be at least 2 characters')
  .max(40, 'Role code must be at most 40 characters')
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Role code must start with an uppercase ASCII letter and contain only A-Z, 0-9, or _');

const uniquePermissionsSchema = z
  .array(permissionCodeSchema)
  .max(36)
  .refine((items) => new Set(items).size === items.length, 'Duplicate permission codes are not allowed');

export const createRoleRequestSchema = z.strictObject({
  code: customRoleCodeSchema,
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullable().optional(),
  permissions: uniquePermissionsSchema.default([]),
});

export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;

export const updateRoleRequestSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(300).nullable().optional(),
    permissions: uniquePermissionsSchema.optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one role field must be provided',
  });

export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;

export const assignUserRolesRequestSchema = z.strictObject({
  roleCodes: z
    .array(customRoleCodeSchema)
    .min(1, 'At least one role code is required')
    .max(16)
    .refine((items) => new Set(items).size === items.length, 'Duplicate role codes are not allowed'),
  reason: z.string().trim().min(3).max(300).optional(),
});

export type AssignUserRolesRequest = z.infer<typeof assignUserRolesRequestSchema>;

export const updateUserStatusRequestSchema = z.strictObject({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().trim().min(3).max(300).optional(),
});

export type UpdateUserStatusRequest = z.infer<typeof updateUserStatusRequestSchema>;

export const adminUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional(),
  status: userStatusSchema.optional(),
  roleCode: customRoleCodeSchema.optional(),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const auditLogsQuerySchema = paginationQuerySchema.extend({
  actorId: uuidSchema.optional(),
  action: z.string().trim().min(1).max(100).optional(),
  resourceType: z.string().trim().min(1).max(64).optional(),
  resourceId: z.string().trim().min(1).max(100).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export type AuditLogsQuery = z.infer<typeof auditLogsQuerySchema>;
