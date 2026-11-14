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
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type {
  AddressResponse,
  CreateAddressRequest,
  UpdateAddressRequest,
  UpdateProfileRequest,
  UserProfileResponse,
  UserSessionSummary,
} from '@arven/validators';
import {
  createAddressRequestSchema,
  updateAddressRequestSchema,
  updateProfileRequestSchema,
  uuidSchema,
} from '@arven/validators';
import {
  AuditAction,
  CurrentActor,
  CustomerAuth,
  extractClientIp,
  markAuditRecordedInTransaction,
  type AuthenticatedActor,
} from '../../common/security/index.js';
import { UsersRolesService } from './users-roles.service.js';

type ControllerRequest = Parameters<typeof extractClientIp>[0];

@ApiTags('Users')
@Controller('users')
@CustomerAuth()
export class UsersController {
  constructor(
    @Inject(UsersRolesService) private readonly usersRolesService: UsersRolesService,
  ) {}

  @Get('me')
  async getProfile(@CurrentActor() actor: AuthenticatedActor): Promise<UserProfileResponse> {
    return this.usersRolesService.getMyProfile(actor.userId);
  }

  @Patch('me')
  @AuditAction('user.profile.updated', 'User')
  async updateProfile(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Body({ schema: updateProfileRequestSchema }) body: UpdateProfileRequest,
  ): Promise<UserProfileResponse> {
    markAuditRecordedInTransaction(req);
    return this.usersRolesService.updateMyProfile(actor, body, extractClientIp(req));
  }

  @Get('me/sessions')
  async listSessions(
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<UserSessionSummary[]> {
    return this.usersRolesService.listMySessions(actor.userId, actor.sessionId);
  }

  @Delete('me/sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuditAction('user.session.revoked', 'Session')
  async revokeSession(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<void> {
    markAuditRecordedInTransaction(req);
    await this.usersRolesService.revokeMySession(actor, id, extractClientIp(req));
  }

  @Get('me/addresses')
  async listAddresses(
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<AddressResponse[]> {
    return this.usersRolesService.listMyAddresses(actor.userId);
  }

  @Post('me/addresses')
  @HttpCode(HttpStatus.CREATED)
  @AuditAction('user.address.created', 'Address')
  async createAddress(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Body({ schema: createAddressRequestSchema }) body: CreateAddressRequest,
  ): Promise<AddressResponse> {
    markAuditRecordedInTransaction(req);
    return this.usersRolesService.createMyAddress(actor, body, extractClientIp(req));
  }

  @Patch('me/addresses/:id')
  @AuditAction('user.address.updated', 'Address')
  async updateAddress(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateAddressRequestSchema }) body: UpdateAddressRequest,
  ): Promise<AddressResponse> {
    markAuditRecordedInTransaction(req);
    return this.usersRolesService.updateMyAddress(actor, id, body, extractClientIp(req));
  }

  @Delete('me/addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuditAction('user.address.deleted', 'Address')
  async deleteAddress(
    @Req() req: ControllerRequest,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<void> {
    markAuditRecordedInTransaction(req);
    await this.usersRolesService.deleteMyAddress(actor, id, extractClientIp(req));
  }
}
