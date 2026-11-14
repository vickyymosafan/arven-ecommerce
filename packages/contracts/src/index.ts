import type {
  AddressResponse,
  AdminLoginRequest,
  ApiErrorEnvelope,
  ApiPaginatedEnvelope,
  ApiSuccessEnvelope,
  AuthUserSummary,
  CreateAddressRequest,
  CsrfTokenResponse,
  ForgotPasswordRequest,
  HealthLiveResponse,
  HealthReadyResponse,
  LoginRequest,
  MfaSetupResponse,
  MfaVerifyRequest,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateAddressRequest,
  UpdateProfileRequest,
  UserProfileResponse,
  UserSessionSummary,
  VerifyEmailRequest,
} from '@arven/validators';

export type {
  AddressResponse,
  AdminLoginRequest,
  ApiErrorEnvelope,
  ApiPaginatedEnvelope,
  ApiSuccessEnvelope,
  AuthUserSummary,
  CreateAddressRequest,
  CsrfTokenResponse,
  ForgotPasswordRequest,
  HealthLiveResponse,
  HealthReadyResponse,
  LoginRequest,
  MfaSetupResponse,
  MfaVerifyRequest,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateAddressRequest,
  UpdateProfileRequest,
  UserProfileResponse,
  UserSessionSummary,
  VerifyEmailRequest,
};

export interface RoleSummaryDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

export interface AdminUserSummaryDto {
  id: string;
  email: string;
  fullName: string;
  phoneMasked: string | null;
  status: string;
  mfaEnabled: boolean;
  roles: string[];
  createdAt: string;
}

export interface AuditLogEntryDto {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ipMasked: string | null;
  requestId: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  createdAt: string;
}
