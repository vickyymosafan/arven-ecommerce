import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CsrfTokenResponse } from '@arven/validators';
import { SessionScope } from '@arven/database';
import {
  Public,
  SessionStoreService,
  TokenCryptoService,
  type HttpRequestLike,
  type HttpResponseLike,
} from '../../common/security/index.js';

@ApiTags('Auth')
@Controller('csrf-token')
export class CsrfController {
  constructor(
    @Inject(SessionStoreService) private readonly sessionStore: SessionStoreService,
    @Inject(TokenCryptoService) private readonly tokenCrypto: TokenCryptoService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Issue session-bound or pre-auth CSRF token' })
  async getCsrfToken(
    @Req() req: HttpRequestLike,
    @Res({ passthrough: true }) res: HttpResponseLike,
  ): Promise<CsrfTokenResponse> {
    res.setHeader('Cache-Control', 'no-store');

    const activeSession = await this.sessionStore.resolveFromRequest(req, [
      SessionScope.CUSTOMER,
      SessionScope.ADMIN,
    ]);

    if (activeSession) {
      return {
        csrfToken: this.tokenCrypto.deriveSessionCsrfToken(activeSession.csrfSecret),
      };
    }

    const preAuth = this.tokenCrypto.issuePreAuthCsrf();
    this.sessionStore.setPreAuthCsrfCookie(res, preAuth.cookieValue, preAuth.maxAgeMs);

    return {
      csrfToken: preAuth.token,
    };
  }
}
