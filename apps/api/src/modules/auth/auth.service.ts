import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verify } from 'otplib';
import type { Redis } from 'ioredis';
import {
  ADMIN_ROLE_CODES,
  AUTH_POLICY,
  type PermissionCode,
  type RoleCode,
} from '@arven/config';
import {
  SessionScope,
  UserStatus,
  VerificationTokenType,
} from '@arven/database';
import { createLogger, getRequestId } from '@arven/observability';
import type {
  AdminLoginRequest,
  AuthUserSummary,
  LoginRequest,
  MfaSetupResponse,
  MfaVerifyRequest,
  RegisterRequest,
  ResetPasswordRequest,
} from '@arven/validators';
import type { z } from 'zod';
import type {
  authSessionResponseSchema,
  forgotPasswordResponseSchema,
  mfaVerifyResponseSchema,
  registerResponseSchema,
  resetPasswordResponseSchema,
  verifyEmailResponseSchema,
} from '@arven/validators';
import { DomainHttpException } from '../../common/http/domain-http.exception.js';
import {
  PasswordHasherService,
  SessionStoreService,
  TokenCryptoService,
  extractClientIp,
  markAuditRecordedInTransaction,
  type AuthenticatedActor,
  type HttpRequestLike,
  type HttpResponseLike,
  type ResolvedSession,
} from '../../common/security/index.js';

type Request = HttpRequestLike;
type Response = HttpResponseLike;
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../shared/redis/redis.module.js';
import { AuditLogService } from '../audit-notifications/audit-log.service.js';
import { OutboxWriterService } from '../audit-notifications/outbox-writer.service.js';

export type RegisterResponse = z.infer<typeof registerResponseSchema>;
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema> & {
  mfaSetupRequired?: boolean;
};
export type MfaVerifyResponse = z.infer<typeof mfaVerifyResponseSchema> & {
  recoveryCodes?: string[];
};
export type ForgotPasswordResponse = z.infer<typeof forgotPasswordResponseSchema>;
export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;
export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;

export interface MeResponse {
  user: AuthUserSummary;
  mfaRequired: boolean;
}

const ADMIN_ROLE_SET = new Set<string>(ADMIN_ROLE_CODES);

function extractRolesAndPermissions(
  userRoles: Array<{
    role: {
      code: string;
      rolePermissions: Array<{ permission: { code: string } }>;
    };
  }>,
): { roles: RoleCode[]; permissions: PermissionCode[] } {
  const roles: RoleCode[] = [];
  const permissions = new Set<PermissionCode>();

  for (const ur of userRoles) {
    roles.push(ur.role.code as RoleCode);
    for (const rp of ur.role.rolePermissions) {
      permissions.add(rp.permission.code as PermissionCode);
    }
  }

  return {
    roles,
    permissions: Array.from(permissions),
  };
}

function buildAuthUserSummary(input: {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: UserStatus;
  roles: RoleCode[];
  permissions: PermissionCode[];
  mfaEnabled: boolean;
  mfaVerifiedAt: Date | null;
}): AuthUserSummary {
  return {
    id: input.id,
    email: input.email,
    fullName: input.fullName,
    phone: input.phone,
    status: input.status,
    roles: input.roles,
    permissions: input.permissions,
    mfaEnabled: input.mfaEnabled,
    mfaVerified: input.mfaVerifiedAt !== null,
    mfaVerifiedAt: input.mfaVerifiedAt ? input.mfaVerifiedAt.toISOString() : null,
  };
}

@Injectable()
export class AuthService {
  private readonly logger = createLogger({ service: '@arven/api:auth' });

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(PasswordHasherService) private readonly passwordHasher: PasswordHasherService,
    @Inject(TokenCryptoService) private readonly tokenCrypto: TokenCryptoService,
    @Inject(SessionStoreService) private readonly sessionStore: SessionStoreService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    @Inject(OutboxWriterService) private readonly outboxWriter: OutboxWriterService,
  ) {}

  async register(input: RegisterRequest, req: Request): Promise<RegisterResponse> {
    const email = input.email.trim().toLowerCase();
    const ipAddress = extractClientIp(req);

    this.passwordHasher.assertNotBreachedOrTrivial(input.password, email);

    const existing = await this.prisma.client.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new DomainHttpException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        'An account with this email already exists',
      );
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const rawVerifyToken = this.tokenCrypto.generateOpaqueToken(32);
    const verifyTokenHash = this.tokenCrypto.sha256Hex(rawVerifyToken);
    const expiresAt = new Date(
      Date.now() + AUTH_POLICY.VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000,
    );

    const customerRole = await this.prisma.client.role.findUnique({
      where: { code: 'CUSTOMER' },
      select: { id: true },
    });
    if (!customerRole) {
      throw new DomainHttpException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'INTERNAL_ERROR',
        'Required CUSTOMER role is not provisioned',
      );
    }

    const createdUser = await this.prisma.withTransaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName: input.fullName.trim(),
          phone: input.phone ?? null,
          status: UserStatus.PENDING_VERIFICATION,
          mfaEnabled: false,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          status: true,
          mfaEnabled: true,
        },
      });

      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: customerRole.id,
        },
      });

      await tx.verificationToken.create({
        data: {
          userId: user.id,
          type: VerificationTokenType.EMAIL_VERIFICATION,
          tokenHash: verifyTokenHash,
          expiresAt,
        },
      });

      await this.outboxWriter.enqueue(
        {
          aggregateType: 'user',
          aggregateId: user.id,
          eventType: 'auth.verification.requested',
          payload: {
            userId: user.id,
            email: user.email,
            fullName: user.fullName,
            token: rawVerifyToken,
            expiresAt: expiresAt.toISOString(),
          },
        },
        tx,
      );

      await this.auditLog.record(
        {
          actorId: user.id,
          actorRole: 'CUSTOMER',
          requestId: getRequestId() ?? null,
          action: 'auth.register',
          resource: 'user',
          resourceId: user.id,
          ipAddress,
          afterState: {
            status: user.status,
            roles: ['CUSTOMER'],
          },
        },
        tx,
      );
      markAuditRecordedInTransaction(req);

      return user;
    });

    this.logger.info({ userId: createdUser.id }, 'Customer account registered');

    return {
      user: buildAuthUserSummary({
        ...createdUser,
        roles: ['CUSTOMER'],
        permissions: [],
        mfaVerifiedAt: null,
      }),
      verificationEmailSent: true,
    };
  }

  async verifyEmail(rawToken: string, req: Request): Promise<VerifyEmailResponse> {
    const tokenHash = this.tokenCrypto.sha256Hex(rawToken);
    const now = new Date();
    const ipAddress = extractClientIp(req);

    await this.prisma.withTransaction(async (tx) => {
      const tokenRow = await tx.verificationToken.findUnique({
        where: { tokenHash },
        include: {
          user: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      });

      if (
        !tokenRow ||
        tokenRow.type !== VerificationTokenType.EMAIL_VERIFICATION ||
        tokenRow.consumedAt !== null ||
        tokenRow.expiresAt.getTime() <= now.getTime()
      ) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'INVALID_OR_EXPIRED_TOKEN',
          'Email verification token is invalid or has expired',
        );
      }

      if (tokenRow.user.status === UserStatus.SUSPENDED) {
        throw new DomainHttpException(
          HttpStatus.FORBIDDEN,
          'ACCOUNT_DISABLED',
          'Account cannot be verified in its current state',
        );
      }

      const consumed = await tx.verificationToken.updateMany({
        where: { id: tokenRow.id, consumedAt: null },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'INVALID_OR_EXPIRED_TOKEN',
          'Email verification token has already been used',
        );
      }

      if (tokenRow.user.status === UserStatus.PENDING_VERIFICATION) {
        await tx.user.update({
          where: { id: tokenRow.user.id },
          data: {
            status: UserStatus.ACTIVE,
            verifiedAt: now,
          },
        });
      }

      await this.auditLog.record(
        {
          actorId: tokenRow.user.id,
          actorRole: 'CUSTOMER',
          requestId: getRequestId() ?? null,
          action: 'auth.email_verified',
          resource: 'user',
          resourceId: tokenRow.user.id,
          ipAddress,
          beforeState: { status: tokenRow.user.status },
          afterState: { status: UserStatus.ACTIVE },
        },
        tx,
      );
      markAuditRecordedInTransaction(req);
    });

    return { verified: true };
  }

  async loginCustomer(
    input: LoginRequest,
    req: Request,
    res: Response,
  ): Promise<AuthSessionResponse> {
    const email = input.email.trim().toLowerCase();
    const ipAddress = extractClientIp(req);
    const userAgent =
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;

    const user = await this.prisma.client.user.findUnique({
      where: { email },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const passwordMatches = await this.passwordHasher.verifyOrDummy(
      user?.passwordHash,
      input.password,
    );

    if (!user || !passwordMatches || user.status !== UserStatus.ACTIVE) {
      await this.auditLog
        .record({
          actorId: user?.id ?? null,
          requestId: getRequestId() ?? null,
          action: 'auth.login.failed',
          resource: 'session',
          resourceId: user?.id ?? 'unknown',
          ipAddress,
          afterState: { scope: SessionScope.CUSTOMER, reason: 'invalid_credentials' },
        })
        .catch(() => undefined);

      throw new DomainHttpException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'Invalid email or password',
      );
    }

    const { roles, permissions } = extractRolesAndPermissions(user.userRoles);
    const now = new Date();

    const createdSession = await this.prisma.withTransaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now },
      });

      const session = await this.sessionStore.createSession({
        userId: user.id,
        scope: SessionScope.CUSTOMER,
        ipAddress,
        userAgent,
        mfaVerifiedAt: null,
        tx,
      });

      await this.auditLog.record(
        {
          actorId: user.id,
          actorRole: roles[0] ?? 'CUSTOMER',
          requestId: getRequestId() ?? null,
          action: 'auth.login.succeeded',
          resource: 'session',
          resourceId: session.sessionId,
          ipAddress,
          afterState: { scope: SessionScope.CUSTOMER },
        },
        tx,
      );
      markAuditRecordedInTransaction(req);

      return session;
    });

    this.sessionStore.setSessionCookie(
      res,
      SessionScope.CUSTOMER,
      createdSession.rawToken,
      createdSession.expiresAt,
    );

    return {
      user: buildAuthUserSummary({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        status: user.status,
        roles,
        permissions,
        mfaEnabled: user.mfaEnabled,
        mfaVerifiedAt: null,
      }),
      mfaRequired: false,
      sessionExpiresAt: createdSession.expiresAt.toISOString(),
    };
  }

  async loginAdmin(
    input: AdminLoginRequest,
    req: Request,
    res: Response,
  ): Promise<AuthSessionResponse> {
    const email = input.email.trim().toLowerCase();
    const ipAddress = extractClientIp(req);
    const userAgent =
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;

    const user = await this.prisma.client.user.findUnique({
      where: { email },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const passwordMatches = await this.passwordHasher.verifyOrDummy(
      user?.passwordHash,
      input.password,
    );

    const { roles, permissions } = user
      ? extractRolesAndPermissions(user.userRoles)
      : { roles: [], permissions: [] };
    const hasAdminRole = roles.some((role) => ADMIN_ROLE_SET.has(role));

    if (!user || !passwordMatches || user.status !== UserStatus.ACTIVE || !hasAdminRole) {
      await this.auditLog
        .record({
          actorId: user?.id ?? null,
          requestId: getRequestId() ?? null,
          action: 'auth.admin.login.failed',
          resource: 'session',
          resourceId: user?.id ?? 'unknown',
          ipAddress,
          afterState: { scope: SessionScope.ADMIN, reason: 'invalid_credentials' },
        })
        .catch(() => undefined);

      throw new DomainHttpException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
        'Invalid email or password',
      );
    }

    const now = new Date();
    const createdSession = await this.prisma.withTransaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now },
      });

      const session = await this.sessionStore.createSession({
        userId: user.id,
        scope: SessionScope.ADMIN,
        ipAddress,
        userAgent,
        mfaVerifiedAt: null,
        tx,
      });

      await this.auditLog.record(
        {
          actorId: user.id,
          actorRole: roles[0] ?? null,
          requestId: getRequestId() ?? null,
          action: 'auth.admin.login.succeeded',
          resource: 'session',
          resourceId: session.sessionId,
          ipAddress,
          afterState: { scope: SessionScope.ADMIN, mfaRequired: true },
        },
        tx,
      );
      markAuditRecordedInTransaction(req);

      return session;
    });

    this.sessionStore.setSessionCookie(
      res,
      SessionScope.ADMIN,
      createdSession.rawToken,
      createdSession.expiresAt,
    );

    return {
      user: buildAuthUserSummary({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        status: user.status,
        roles,
        permissions,
        mfaEnabled: user.mfaEnabled,
        mfaVerifiedAt: null,
      }),
      mfaRequired: true,
      mfaSetupRequired: !user.mfaEnabled,
      sessionExpiresAt: createdSession.expiresAt.toISOString(),
    };
  }

  async setupMfa(actor: AuthenticatedActor, req: Request): Promise<MfaSetupResponse> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: actor.userId },
      select: {
        id: true,
        email: true,
        mfaEnabled: true,
      },
    });

    if (!user) {
      throw new DomainHttpException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Account not found',
      );
    }

    if (user.mfaEnabled) {
      throw new DomainHttpException(
        HttpStatus.FORBIDDEN,
        'MFA_ALREADY_ENROLLED',
        'MFA is already enrolled for this account',
      );
    }

    const secret = generateSecret();
    const encryptedSecret = this.tokenCrypto.encryptTotpSecret(secret);

    await this.prisma.withTransaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: user.id, mfaEnabled: false },
        data: { mfaSecretEncrypted: encryptedSecret },
      });

      if (updated.count !== 1) {
        throw new DomainHttpException(
          HttpStatus.FORBIDDEN,
          'MFA_ALREADY_ENROLLED',
          'MFA is already enrolled for this account',
        );
      }

      await this.auditLog.record(
        {
          actorId: user.id,
          actorRole: actor.roles[0] ?? null,
          requestId: getRequestId() ?? null,
          action: 'auth.mfa.setup',
          resource: 'user',
          resourceId: user.id,
          ipAddress: extractClientIp(req),
          afterState: { mfaPendingActivation: true },
        },
        tx,
      );
      markAuditRecordedInTransaction(req);
    });

    const otpauthUri = generateURI({
      issuer: AUTH_POLICY.TOTP_ISSUER,
      label: user.email,
      secret,
    });

    return {
      otpauthUri,
      manualEntryKey: secret,
      issuer: AUTH_POLICY.TOTP_ISSUER,
      accountName: user.email,
    };
  }

  async verifyMfa(
    actor: AuthenticatedActor,
    input: MfaVerifyRequest,
    req: Request,
  ): Promise<MfaVerifyResponse> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: actor.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        mfaEnabled: true,
        mfaSecretEncrypted: true,
        mfaLastTimeStep: true,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new DomainHttpException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Account not active',
      );
    }

    if (!user.mfaSecretEncrypted) {
      throw new DomainHttpException(
        HttpStatus.BAD_REQUEST,
        'MFA_NOT_CONFIGURED',
        'MFA setup must be initiated before verification',
      );
    }

    const secret = this.tokenCrypto.decryptTotpSecret(user.mfaSecretEncrypted);
    const verification = await verify({
      strategy: 'totp',
      secret,
      token: input.code,
      epochTolerance: 30,
      ...(user.mfaLastTimeStep !== null ? { afterTimeStep: user.mfaLastTimeStep } : {}),
    });

    if (!verification.valid) {
      throw new DomainHttpException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_MFA_CODE',
        'Invalid or already used authenticator code',
      );
    }

    const verifiedTimeStep =
      'timeStep' in verification && typeof verification.timeStep === 'number'
        ? verification.timeStep
        : 'epoch' in verification && typeof verification.epoch === 'number'
          ? Math.floor(verification.epoch / 30)
          : Math.floor(Date.now() / 30_000);

    const replayLockKey = `mfa:timestep:${user.id}:${verifiedTimeStep}`;
    const lockAcquired = await this.redis.set(
      replayLockKey,
      actor.sessionId,
      'EX',
      120,
      'NX',
    );
    if (lockAcquired !== 'OK') {
      throw new DomainHttpException(
        HttpStatus.UNAUTHORIZED,
        'INVALID_MFA_CODE',
        'Authenticator code has already been used',
      );
    }

    const now = new Date();
    const isInitialEnrollment = !user.mfaEnabled;
    let generatedRecoveryPlaintext: string[] | undefined;

    await this.prisma.withTransaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: user.id,
          OR: [
            { mfaLastTimeStep: null },
            { mfaLastTimeStep: { lt: verifiedTimeStep } },
          ],
        },
        data: {
          mfaLastTimeStep: verifiedTimeStep,
          ...(isInitialEnrollment ? { mfaEnabled: true } : {}),
        },
      });

      if (updated.count !== 1) {
        throw new DomainHttpException(
          HttpStatus.UNAUTHORIZED,
          'INVALID_MFA_CODE',
          'Authenticator code has already been used',
        );
      }

      if (isInitialEnrollment) {
        const codes = this.tokenCrypto.generateRecoveryCodes(8);
        generatedRecoveryPlaintext = codes.map((c) => c.plaintext);
        await tx.mfaRecoveryCode.createMany({
          data: codes.map((c) => ({
            userId: user.id,
            codeHash: c.hash,
          })),
        });

        await this.outboxWriter.enqueue(
          {
            aggregateType: 'user',
            aggregateId: user.id,
            eventType: 'auth.mfa.enabled',
            payload: {
              userId: user.id,
              email: user.email,
              enabledAt: now.toISOString(),
            },
          },
          tx,
        );
      }

      await this.sessionStore.markMfaVerified(
        actor.sessionId,
        actor.sessionTokenHash,
        now,
        tx,
      );

      await this.auditLog.record(
        {
          actorId: user.id,
          actorRole: actor.roles[0] ?? null,
          requestId: getRequestId() ?? null,
          action: isInitialEnrollment ? 'auth.mfa.enrolled' : 'auth.mfa.verified',
          resource: 'session',
          resourceId: actor.sessionId,
          ipAddress: extractClientIp(req),
          afterState: {
            mfaEnabled: true,
            mfaVerifiedAt: now.toISOString(),
          },
        },
        tx,
      );
      markAuditRecordedInTransaction(req);
    });

    return {
      verified: true,
      mfaVerifiedAt: now.toISOString(),
      user: buildAuthUserSummary({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        status: user.status,
        roles: actor.roles,
        permissions: actor.permissions,
        mfaEnabled: true,
        mfaVerifiedAt: now,
      }),
      ...(generatedRecoveryPlaintext ? { recoveryCodes: generatedRecoveryPlaintext } : {}),
    };
  }

  async logout(
    actor: AuthenticatedActor,
    res: Response,
  ): Promise<{ loggedOut: true }> {
    await this.sessionStore.revokeCurrentSession(actor.sessionTokenHash);
    this.sessionStore.clearSessionCookie(res, actor.scope);
    return { loggedOut: true };
  }

  async logoutAll(
    actor: AuthenticatedActor,
    res: Response,
  ): Promise<{ loggedOutAll: true }> {
    await this.sessionStore.revokeAllUserSessions(actor.userId);
    this.sessionStore.clearSessionCookie(res, SessionScope.CUSTOMER);
    this.sessionStore.clearSessionCookie(res, SessionScope.ADMIN);
    return { loggedOutAll: true };
  }

  async refresh(
    resolvedSession: ResolvedSession,
    req: Request,
    res: Response,
  ): Promise<AuthSessionResponse> {
    const ipAddress = extractClientIp(req);
    const userAgent =
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;

    const rotated = await this.sessionStore.rotateSession(
      resolvedSession,
      ipAddress,
      userAgent,
    );

    this.sessionStore.setSessionCookie(
      res,
      resolvedSession.actor.scope,
      rotated.rawToken,
      rotated.expiresAt,
    );

    const freshUser = await this.prisma.client.user.findUnique({
      where: { id: resolvedSession.actor.userId },
      select: {
        phone: true,
        status: true,
      },
    });

    return {
      user: buildAuthUserSummary({
        id: resolvedSession.actor.userId,
        email: resolvedSession.actor.email,
        fullName: resolvedSession.actor.fullName,
        phone: freshUser?.phone ?? null,
        status: freshUser?.status ?? UserStatus.ACTIVE,
        roles: resolvedSession.actor.roles,
        permissions: resolvedSession.actor.permissions,
        mfaEnabled: resolvedSession.actor.mfaEnabled,
        mfaVerifiedAt: resolvedSession.actor.mfaVerifiedAt,
      }),
      mfaRequired:
        resolvedSession.actor.scope === SessionScope.ADMIN &&
        resolvedSession.actor.mfaVerifiedAt === null,
      sessionExpiresAt: rotated.expiresAt.toISOString(),
    };
  }

  async forgotPassword(
    emailInput: string,
    req: Request,
  ): Promise<ForgotPasswordResponse> {
    const email = emailInput.trim().toLowerCase();
    const ipAddress = extractClientIp(req);

    const user = await this.prisma.client.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
      },
    });

    if (user && user.status === UserStatus.ACTIVE) {
      const rawToken = this.tokenCrypto.generateOpaqueToken(32);
      const tokenHash = this.tokenCrypto.sha256Hex(rawToken);
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + AUTH_POLICY.RESET_TOKEN_TTL_MINUTES * 60 * 1000,
      );

      await this.prisma.withTransaction(async (tx) => {
        await tx.verificationToken.updateMany({
          where: {
            userId: user.id,
            type: VerificationTokenType.PASSWORD_RESET,
            consumedAt: null,
          },
          data: { consumedAt: now },
        });

        await tx.verificationToken.create({
          data: {
            userId: user.id,
            type: VerificationTokenType.PASSWORD_RESET,
            tokenHash,
            expiresAt,
          },
        });

        await this.outboxWriter.enqueue(
          {
            aggregateType: 'user',
            aggregateId: user.id,
            eventType: 'auth.password_reset.requested',
            payload: {
              userId: user.id,
              email: user.email,
              fullName: user.fullName,
              token: rawToken,
              expiresAt: expiresAt.toISOString(),
            },
          },
          tx,
        );

        await this.auditLog.record(
          {
            actorId: user.id,
            requestId: getRequestId() ?? null,
            action: 'auth.password_reset.requested',
            resource: 'user',
            resourceId: user.id,
            ipAddress,
          },
          tx,
        );
        markAuditRecordedInTransaction(req);
      });
    }

    return { accepted: true };
  }

  async resetPassword(
    input: ResetPasswordRequest,
    req: Request,
  ): Promise<ResetPasswordResponse> {
    this.passwordHasher.assertNotBreachedOrTrivial(input.newPassword);

    const tokenHash = this.tokenCrypto.sha256Hex(input.token);
    const now = new Date();
    const ipAddress = extractClientIp(req);

    const tokenLookup = await this.prisma.client.verificationToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            status: true,
          },
        },
      },
    });

    if (
      !tokenLookup ||
      tokenLookup.type !== VerificationTokenType.PASSWORD_RESET ||
      tokenLookup.consumedAt !== null ||
      tokenLookup.expiresAt.getTime() <= now.getTime() ||
      tokenLookup.user.status !== UserStatus.ACTIVE
    ) {
      throw new DomainHttpException(
        HttpStatus.BAD_REQUEST,
        'INVALID_OR_EXPIRED_TOKEN',
        'Password reset token is invalid or has expired',
      );
    }

    this.passwordHasher.assertNotBreachedOrTrivial(
      input.newPassword,
      tokenLookup.user.email,
    );

    const newPasswordHash = await this.passwordHasher.hash(input.newPassword);

    await this.prisma.withTransaction(async (tx) => {
      const consumed = await tx.verificationToken.updateMany({
        where: { id: tokenLookup.id, consumedAt: null },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new DomainHttpException(
          HttpStatus.BAD_REQUEST,
          'INVALID_OR_EXPIRED_TOKEN',
          'Password reset token has already been used',
        );
      }

      await tx.user.update({
        where: { id: tokenLookup.user.id },
        data: { passwordHash: newPasswordHash },
      });

      await this.sessionStore.revokeAllUserSessions(tokenLookup.user.id, tx);

      await this.auditLog.record(
        {
          actorId: tokenLookup.user.id,
          requestId: getRequestId() ?? null,
          action: 'auth.password_reset.completed',
          resource: 'user',
          resourceId: tokenLookup.user.id,
          ipAddress,
        },
        tx,
      );
      markAuditRecordedInTransaction(req);
    });

    return { reset: true };
  }

  async getMe(actor: AuthenticatedActor): Promise<MeResponse> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: actor.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        status: true,
        mfaEnabled: true,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new DomainHttpException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHORIZED',
        'Account is not active',
      );
    }

    return {
      user: buildAuthUserSummary({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        status: user.status,
        roles: actor.roles,
        permissions: actor.permissions,
        mfaEnabled: user.mfaEnabled,
        mfaVerifiedAt: actor.mfaVerifiedAt,
      }),
      mfaRequired:
        actor.scope === SessionScope.ADMIN && actor.mfaVerifiedAt === null,
    };
  }
}
