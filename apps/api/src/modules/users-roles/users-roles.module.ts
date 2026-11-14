import { Module } from '@nestjs/common';
import { AdminUsersRolesController } from './admin-users-roles.controller.js';
import { UsersController } from './users.controller.js';
import { UsersRolesService } from './users-roles.service.js';

@Module({
  controllers: [UsersController, AdminUsersRolesController],
  providers: [UsersRolesService],
  exports: [UsersRolesService],
})
export class UsersRolesModule {}
