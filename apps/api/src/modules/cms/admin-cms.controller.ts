import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  CmsJournalArticleDto,
  CmsLookbookDto,
  CmsPageDto,
} from '@arven/contracts';
import {
  adminCmsListQuerySchema,
  createCmsJournalSchema,
  createCmsLookbookSchema,
  createCmsPageSchema,
  transitionCmsStatusSchema,
  updateCmsJournalSchema,
  updateCmsLookbookSchema,
  updateCmsPageSchema,
  uuidSchema,
  type AdminCmsListQuery,
  type CreateCmsJournalRequest,
  type CreateCmsLookbookRequest,
  type CreateCmsPageRequest,
  type TransitionCmsStatusRequest,
  type UpdateCmsJournalRequest,
  type UpdateCmsLookbookRequest,
  type UpdateCmsPageRequest,
} from '@arven/validators';
import type { PaginatedResponse } from '../../common/http/index.js';
import {
  AdminAuth,
  AuditAction,
  CurrentActor,
  RequireAnyPermission,
  RequirePermissions,
  markAuditRecordedInTransaction,
  type AuthenticatedActor,
  type HttpRequestLike,
} from '../../common/security/index.js';
import { CmsService } from './cms.service.js';

@ApiTags('Admin CMS')
@Controller('admin/cms')
@AdminAuth()
export class AdminCmsController {
  constructor(@Inject(CmsService) private readonly cmsService: CmsService) {}

  // =========================================================================
  // Pages
  // =========================================================================

  @Get('pages')
  @RequirePermissions('cms.read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List CMS pages (including DRAFT/PREVIEW/ARCHIVED)' })
  async listPages(
    @Query({ schema: adminCmsListQuerySchema }) query: AdminCmsListQuery,
  ): Promise<PaginatedResponse<CmsPageDto>> {
    return this.cmsService.listAdminPages(query);
  }

  @Get('pages/:id')
  @RequirePermissions('cms.read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get CMS page by ID' })
  async getPageById(
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<CmsPageDto> {
    return this.cmsService.getAdminPageById(id);
  }

  @Post('pages')
  @RequirePermissions('cms.write')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @AuditAction('cms.page.created', 'page')
  @ApiOperation({ summary: 'Create a DRAFT CMS page' })
  async createPage(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Body({ schema: createCmsPageSchema }) body: CreateCmsPageRequest,
  ): Promise<CmsPageDto> {
    markAuditRecordedInTransaction(req);
    return this.cmsService.createPage(req, actor, body);
  }

  @Patch('pages/:id')
  @RequirePermissions('cms.write')
  @Header('Cache-Control', 'no-store')
  @AuditAction('cms.page.updated', 'page')
  @ApiOperation({ summary: 'Update CMS page fields' })
  async updatePage(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateCmsPageSchema }) body: UpdateCmsPageRequest,
  ): Promise<CmsPageDto> {
    markAuditRecordedInTransaction(req);
    return this.cmsService.updatePage(req, actor, id, body);
  }

  @Delete('pages/:id')
  @RequirePermissions('cms.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @AuditAction('cms.page.deleted', 'page')
  @ApiOperation({ summary: 'Soft delete a CMS page' })
  async deletePage(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<void> {
    markAuditRecordedInTransaction(req);
    await this.cmsService.deletePage(req, actor, id);
  }

  @Post('pages/:id/transition')
  @RequireAnyPermission('cms.write', 'cms.publish')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @AuditAction('cms.page.transitioned', 'page')
  @ApiOperation({
    summary:
      'Transition CMS page status (cms.write for DRAFT/PREVIEW, cms.publish for PUBLISHED/ARCHIVED)',
  })
  async transitionPage(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: transitionCmsStatusSchema }) body: TransitionCmsStatusRequest,
  ): Promise<CmsPageDto> {
    markAuditRecordedInTransaction(req);
    return this.cmsService.transitionPage(req, actor, id, body);
  }

  // =========================================================================
  // Lookbooks
  // =========================================================================

  @Get('lookbooks')
  @RequirePermissions('cms.read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List editorial lookbooks' })
  async listLookbooks(
    @Query({ schema: adminCmsListQuerySchema }) query: AdminCmsListQuery,
  ): Promise<PaginatedResponse<CmsLookbookDto>> {
    return this.cmsService.listAdminLookbooks(query);
  }

  @Get('lookbooks/:id')
  @RequirePermissions('cms.read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get lookbook by ID' })
  async getLookbookById(
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<CmsLookbookDto> {
    return this.cmsService.getAdminLookbookById(id);
  }

  @Post('lookbooks')
  @RequirePermissions('cms.write')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @AuditAction('cms.lookbook.created', 'lookbook')
  @ApiOperation({ summary: 'Create a DRAFT editorial lookbook' })
  async createLookbook(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Body({ schema: createCmsLookbookSchema }) body: CreateCmsLookbookRequest,
  ): Promise<CmsLookbookDto> {
    markAuditRecordedInTransaction(req);
    return this.cmsService.createLookbook(req, actor, body);
  }

  @Patch('lookbooks/:id')
  @RequirePermissions('cms.write')
  @Header('Cache-Control', 'no-store')
  @AuditAction('cms.lookbook.updated', 'lookbook')
  @ApiOperation({ summary: 'Update editorial lookbook fields' })
  async updateLookbook(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateCmsLookbookSchema }) body: UpdateCmsLookbookRequest,
  ): Promise<CmsLookbookDto> {
    markAuditRecordedInTransaction(req);
    return this.cmsService.updateLookbook(req, actor, id, body);
  }

  @Delete('lookbooks/:id')
  @RequirePermissions('cms.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @AuditAction('cms.lookbook.deleted', 'lookbook')
  @ApiOperation({ summary: 'Soft delete an editorial lookbook' })
  async deleteLookbook(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<void> {
    markAuditRecordedInTransaction(req);
    await this.cmsService.deleteLookbook(req, actor, id);
  }

  @Post('lookbooks/:id/transition')
  @RequireAnyPermission('cms.write', 'cms.publish')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @AuditAction('cms.lookbook.transitioned', 'lookbook')
  @ApiOperation({
    summary:
      'Transition lookbook status (cms.write for DRAFT/PREVIEW, cms.publish for PUBLISHED/ARCHIVED)',
  })
  async transitionLookbook(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: transitionCmsStatusSchema }) body: TransitionCmsStatusRequest,
  ): Promise<CmsLookbookDto> {
    markAuditRecordedInTransaction(req);
    return this.cmsService.transitionLookbook(req, actor, id, body);
  }

  // =========================================================================
  // Journal Articles
  // =========================================================================

  @Get('journal')
  @RequirePermissions('cms.read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List editorial journal articles' })
  async listJournal(
    @Query({ schema: adminCmsListQuerySchema }) query: AdminCmsListQuery,
  ): Promise<PaginatedResponse<CmsJournalArticleDto>> {
    return this.cmsService.listAdminJournal(query);
  }

  @Get('journal/:id')
  @RequirePermissions('cms.read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get journal article by ID' })
  async getJournalById(
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<CmsJournalArticleDto> {
    return this.cmsService.getAdminJournalById(id);
  }

  @Post('journal')
  @RequirePermissions('cms.write')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @AuditAction('cms.journal.created', 'journal_article')
  @ApiOperation({ summary: 'Create a DRAFT editorial journal article' })
  async createJournal(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Body({ schema: createCmsJournalSchema }) body: CreateCmsJournalRequest,
  ): Promise<CmsJournalArticleDto> {
    markAuditRecordedInTransaction(req);
    return this.cmsService.createJournal(req, actor, body);
  }

  @Patch('journal/:id')
  @RequirePermissions('cms.write')
  @Header('Cache-Control', 'no-store')
  @AuditAction('cms.journal.updated', 'journal_article')
  @ApiOperation({ summary: 'Update editorial journal article fields' })
  async updateJournal(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateCmsJournalSchema }) body: UpdateCmsJournalRequest,
  ): Promise<CmsJournalArticleDto> {
    markAuditRecordedInTransaction(req);
    return this.cmsService.updateJournal(req, actor, id, body);
  }

  @Delete('journal/:id')
  @RequirePermissions('cms.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @AuditAction('cms.journal.deleted', 'journal_article')
  @ApiOperation({ summary: 'Soft delete an editorial journal article' })
  async deleteJournal(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<void> {
    markAuditRecordedInTransaction(req);
    await this.cmsService.deleteJournal(req, actor, id);
  }

  @Post('journal/:id/transition')
  @RequireAnyPermission('cms.write', 'cms.publish')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @AuditAction('cms.journal.transitioned', 'journal_article')
  @ApiOperation({
    summary:
      'Transition journal article status (cms.write for DRAFT/PREVIEW, cms.publish for PUBLISHED/ARCHIVED)',
  })
  async transitionJournal(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: transitionCmsStatusSchema }) body: TransitionCmsStatusRequest,
  ): Promise<CmsJournalArticleDto> {
    markAuditRecordedInTransaction(req);
    return this.cmsService.transitionJournal(req, actor, id, body);
  }
}
