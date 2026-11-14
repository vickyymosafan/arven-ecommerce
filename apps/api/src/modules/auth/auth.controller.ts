import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  adminLoginRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  mfaVerifyRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  verifyEmailRequestSchema,
  type AdminLoginRequest,
  type ForgotPasswordRequest,
  type LoginRequest,
  type MfaSetupResponse,
  type MfaVerifyRequest,
  type RegisterRequest,
  type ResetPasswordRequest,
  type VerifyEmailRequest,
} from '@arven/validators';
import {
  ARVEN_RESOLVED_SESSION_KEY,
  AdminAuth,
  AuditAction,
  CurrentActor,
  PortalAuth,
  Public,
  SkipMfaCheck,
  ThrottleEmail,
  type AuthenticatedActor,
  type AuthenticatedRequest,
  type HttpRequestLike,
  type HttpResponseLike,
} from '../../common/security/index.js';
import { DomainHttpException } from '../../common/http/domain-http.exception.js';
import {
  AuthService,
  type AuthSessionResponse,
  type ForgotPasswordResponse,
  type MeResponse,
  type MfaVerifyResponse,
  type RegisterResponse,
  type ResetPasswordResponse,
  type VerifyEmailResponse,
} from './auth.service.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @ApiOperation({ summary: 'Register customer account' })
  register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
    @Req() req: HttpRequestLike,
  ): Promise<RegisterResponse> {
    return this.authService.register(body, req);
  }

  @Post('verify-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify customer email address via opaque token' })
  verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailRequestSchema)) body: VerifyEmailRequest,
    @Req() req: HttpRequestLike,
  ): Promise<VerifyEmailResponse> {
    return this.authService.verifyEmail(body.token, req);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @ThrottleEmail()
  @ApiOperation({ summary: 'Customer login' })
  login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() req: HttpRequestLike,
    @Res({ passthrough: true }) res: HttpResponseLike,
  ): Promise<AuthSessionResponse> {
    res.setHeader('Cache-Control', 'no-store');
    return this.authService.loginCustomer(body, req, res);
  }

  @Post('admin/login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @ThrottleEmail()
  @ApiOperation({ summary: 'Admin step-1 password login (MFA required next)' })
  adminLogin(
    @Body(new ZodValidationPipe(adminLoginRequestSchema)) body: AdminLoginRequest,
    @Req() req: HttpRequestLike,
    @Res({ passthrough: true }) res: HttpResponseLike,
  ): Promise<AuthSessionResponse> {
    res.setHeader('Cache-Control', 'no-store');
    return this.authService.loginAdmin(body, req, res);
  }

  @Post('mfa/setup')
  @AdminAuth()
  @SkipMfaCheck()
  @HttpCode(HttpStatus.OK)
  @AuditAction('auth.mfa.setup', 'user')
  @ApiOperation({ summary: 'Provision initial TOTP MFA secret for admin account' })
  setupMfa(
    @CurrentActor() actor: AuthenticatedActor,
    @Req() req: HttpRequestLike,
    @Res({ passthrough: true }) res: HttpResponseLike,
  ): Promise<MfaSetupResponse> {
    res.setHeader('Cache-Control', 'no-store');
    return this.authService.setupMfa(actor, req);
  }

  @Post('mfa/verify')
  @AdminAuth()
  @SkipMfaCheck()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @ThrottleEmail()
  @AuditAction('auth.mfa.verified', 'session')
  @ApiOperation({ summary: 'Verify TOTP code and elevate admin session' })
  verifyMfa(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(new ZodValidationPipe(mfaVerifyRequestSchema)) body: MfaVerifyRequest,
    @Req() req: HttpRequestLike,
    @Res({ passthrough: true }) res: HttpResponseLike,
  ): Promise<MfaVerifyResponse> {
    res.setHeader('Cache-Control', 'no-store');
    return this.authService.verifyMfa(actor, body, req);
  }

  @Post('logout')
  @PortalAuth()
  @SkipMfaCheck()
  @HttpCode(HttpStatus.OK)
  @AuditAction('auth.logout', 'session')
  @ApiOperation({ summary: 'Revoke current session and clear cookie' })
  logout(
    @CurrentActor() actor: AuthenticatedActor,
    @Res({ passthrough: true }) res: HttpResponseLike,
  ): Promise<{ loggedOut: true }> {
    return this.authService.logout(actor, res);
  }

  @Post('logout-all')
  @PortalAuth()
  @SkipMfaCheck()
  @HttpCode(HttpStatus.OK)
  @AuditAction('auth.logout_all', 'user')
  @ApiOperation({ summary: 'Revoke all active sessions for current user' })
  logoutAll(
    @CurrentActor() actor: AuthenticatedActor,
    @Res({ passthrough: true }) res: HttpResponseLike,
  ): Promise<{ loggedOutAll: true }> {
    return this.authService.logoutAll(actor, res);
  }

  @Post('refresh')
  @PortalAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rotate current session token and refresh cookie' })
  refresh(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: HttpResponseLike,
  ): Promise<AuthSessionResponse> {
    res.setHeader('Cache-Control', 'no-store');
    const resolvedSession = req[ARVEN_RESOLVED_SESSION_KEY];
    if (!resolvedSession) {
      throw new DomainHttpException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Active session not found',
      );
    }
    return this.authService.refresh(resolvedSession, req, res);
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 900_000 } })
  @ThrottleEmail()
  @ApiOperation({ summary: 'Request password reset email (enumeration-safe)' })
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema)) body: ForgotPasswordRequest,
    @Req() req: HttpRequestLike,
  ): Promise<ForgotPasswordResponse> {
    return this.authService.forgotPassword(body.email, req);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @ApiOperation({ summary: 'Complete password reset via opaque token and revoke sessions' })
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
    @Req() req: HttpRequestLike,
  ): Promise<ResetPasswordResponse> {
    return this.authService.resetPassword(body, req);
  }

  @Get('me')
  @PortalAuth()
  @SkipMfaCheck()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get authenticated actor summary and permissions' })
  getMe(
    @CurrentActor() actor: AuthenticatedActor,
    @Res({ passthrough: true }) res: HttpResponseLike,
  ): Promise<MeResponse> {
    res.setHeader('Cache-Control', 'no-store');
    return this.authService.getMe(actor);
  }
}
