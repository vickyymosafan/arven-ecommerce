import { Controller, Get, Header, Inject, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  CmsJournalArticleDto,
  CmsLookbookDto,
  CmsPageDto,
} from '@arven/contracts';
import { paginationQuerySchema, slugParamSchema } from '@arven/validators';
import type { PaginatedResponse } from '../../common/http/index.js';
import { Public } from '../../common/security/index.js';
import { CmsService } from './cms.service.js';

@ApiTags('CMS')
@Controller('cms')
@Public()
export class CmsPublicController {
  constructor(@Inject(CmsService) private readonly cmsService: CmsService) {}

  @Get('pages/:slug')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({ summary: 'Get a published CMS page by slug' })
  async getPageBySlug(
    @Param('slug', { schema: slugParamSchema }) slug: string,
  ): Promise<CmsPageDto> {
    return this.cmsService.getPublicPageBySlug(slug);
  }

  @Get('lookbooks')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({ summary: 'List published editorial lookbooks' })
  async listLookbooks(
    @Query({ schema: paginationQuerySchema }) query: { page: number; limit: number },
  ): Promise<PaginatedResponse<CmsLookbookDto>> {
    return this.cmsService.listPublicLookbooks(query);
  }

  @Get('lookbooks/:slug')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({ summary: 'Get a published lookbook by slug' })
  async getLookbookBySlug(
    @Param('slug', { schema: slugParamSchema }) slug: string,
  ): Promise<CmsLookbookDto> {
    return this.cmsService.getPublicLookbookBySlug(slug);
  }

  @Get('journal')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({ summary: 'List published editorial journal articles' })
  async listJournal(
    @Query({ schema: paginationQuerySchema }) query: { page: number; limit: number },
  ): Promise<PaginatedResponse<CmsJournalArticleDto>> {
    return this.cmsService.listPublicJournal(query);
  }

  @Get('journal/:slug')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({ summary: 'Get a published journal article by slug' })
  async getJournalBySlug(
    @Param('slug', { schema: slugParamSchema }) slug: string,
  ): Promise<CmsJournalArticleDto> {
    return this.cmsService.getPublicJournalBySlug(slug);
  }
}
