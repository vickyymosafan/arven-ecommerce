import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AdminUserSummaryDto, RoleSummaryDto } from '@arven/contracts';
import {
  adminUsersQuerySchema,
  assignUserRolesRequestSchema,
  createRoleRequestSchema,
  updateRoleRequestSchema,
  updateUserStatusRequestSchema,
  uuidSchema,
  type AdminUsersQuery,
  type AssignUserRolesRequest,
  type CreateRoleRequest,
  type UpdateRoleRequest,
  type UpdateUserStatusRequest,
} from '@arven/validators';
import type { PaginatedResponse } from '../../common/http/index.js';
import {
  AdminAuth,
  AuditAction,
  CurrentActor,
  extractClientIp,
  markAuditRecordedInTransaction,
  RequireAnyPermission,
  RequireMfaStepUp,
  RequirePermissions,
  type AuthenticatedActor,
} from '../../common/security/index.js';
import { UsersRolesService } from './users-roles.service.js';

type ControllerRequest = Parameters<typeof extractClientIp>[0];

@ApiTags('Admin Users & Roles')
@Controller('admin')
@AdminAuth()
export class AdminUsersRolesController {
  constructor(
    @Inject(UsersRolesService) private readonly usersRolesService: UsersRolesService,
  ) {}

  @Get('roles')
  @RequireAnyPermission('user.read', 'user.role.manage')
  async listRoles(): Promise<RoleSummaryDto[]> {
    return this.usersRolesService.listRoles();
  }

  @Post('roles')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('user.role.manage')
  @RequireMfaStepUp(900)
  @AuditAction('role.created', 'Role')
  async createRole(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Body({ schema: createRoleRequestSchema }) body: CreateRoleRequest,
  ): Promise<RoleSummaryDto> {
    markAuditRecordedInTransaction(req);
    return this.usersRolesService.createRole(actor, body, extractClientIp(req));
  }

  @Patch('roles/:id')
  @RequirePermissions('user.role.manage')
  @RequireMfaStepUp(900)
  @AuditAction('role.updated', 'Role')
  async updateRole(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateRoleRequestSchema }) body: UpdateRoleRequest,
  ): Promise<RoleSummaryDto> {
    markAuditRecordedInTransaction(req);
    return this.usersRolesService.updateRole(actor, id, body, extractClientIp(req));
  }

  @Delete('roles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('user.role.manage')
  @RequireMfaStepUp(900)
  @AuditAction('role.deleted', 'Role')
  async deleteRole(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<void> {
    markAuditRecordedInTransaction(req);
    await this.usersRolesService.deleteRole(actor, id, extractClientIp(req));
  }

  @Get('users')
  @RequirePermissions('user.read')
  async listUsers(
    @Query({ schema: adminUsersQuerySchema }) query: AdminUsersQuery,
  ): Promise<PaginatedResponse<AdminUserSummaryDto>> {
    return this.usersRolesService.listAdminUsers(query);
  }

  @Patch('users/:id/roles')
  @RequirePermissions('user.role.manage')
  @RequireMfaStepUp(900)
  @AuditAction('user.roles.updated', 'User')
  async assignUserRoles(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: assignUserRolesRequestSchema }) body: AssignUserRolesRequest,
  ): Promise<AdminUserSummaryDto> {
    markAuditRecordedInTransaction(req);
    return this.usersRolesService.assignUserRoles(actor, id, body, extractClientIp(req));
  }

  @Patch('users/:id/status')
  @RequireAnyPermission('user.manage.limited', 'user.role.manage')
  @AuditAction('user.status.updated', 'User')
  async updateUserStatus(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateUserStatusRequestSchema }) body: UpdateUserStatusRequest,
  ): Promise<AdminUserSummaryDto> {
    markAuditRecordedInTransaction(req);
    return this.usersRolesService.updateUserStatus(actor, id, body, extractClientIp(req));
  }
}
