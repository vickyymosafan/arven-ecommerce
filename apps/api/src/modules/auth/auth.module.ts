import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CsrfController } from './csrf.controller.js';

@Module({
  controllers: [CsrfController, AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
