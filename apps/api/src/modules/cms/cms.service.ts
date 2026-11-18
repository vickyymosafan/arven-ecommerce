import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  CmsJournalArticleDto,
  CmsLookbookDto,
  CmsLookbookSlideDto,
  CmsPageBlockDto,
  CmsPageDto,
} from '@arven/contracts';
import {
  CmsStatus,
  Prisma,
  type JournalArticle,
  type Lookbook,
  type Page,
} from '@arven/database';
import type {
  AdminCmsListQuery,
  CmsStatusInput,
  CreateCmsJournalRequest,
  CreateCmsLookbookRequest,
  CreateCmsPageRequest,
  TransitionCmsStatusRequest,
  UpdateCmsJournalRequest,
  UpdateCmsLookbookRequest,
  UpdateCmsPageRequest,
} from '@arven/validators';
import {
  DomainHttpException,
  type PaginatedResponse,
} from '../../common/http/index.js';
import {
  extractClientIp,
  type AuthenticatedActor,
  type HttpRequestLike,
} from '../../common/security/index.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { AuditLogService } from '../audit-notifications/audit-log.service.js';

type JournalWithAuthor = JournalArticle & {
  author: { fullName: string } | null;
};

const CMS_ALLOWED_TRANSITIONS: Record<CmsStatus, readonly CmsStatus[]> = {
  [CmsStatus.DRAFT]: [CmsStatus.PREVIEW, CmsStatus.PUBLISHED, CmsStatus.ARCHIVED],
  [CmsStatus.PREVIEW]: [CmsStatus.DRAFT, CmsStatus.PUBLISHED, CmsStatus.ARCHIVED],
  [CmsStatus.PUBLISHED]: [CmsStatus.ARCHIVED],
  [CmsStatus.ARCHIVED]: [CmsStatus.DRAFT],
};

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

function mapPageDto(row: Page): CmsPageDto {
  const blocks = Array.isArray(row.blocks)
    ? (row.blocks as unknown as CmsPageBlockDto[])
    : typeof row.blocks === 'object' && row.blocks !== null
      ? (row.blocks as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    blocks,
    status: row.status as CmsStatusInput,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapLookbookDto(row: Lookbook): CmsLookbookDto {
  const slides = Array.isArray(row.slides)
    ? (row.slides as unknown as CmsLookbookSlideDto[])
    : [];

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    season: row.season,
    description: row.description,
    slides,
    status: row.status as CmsStatusInput,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapJournalDto(row: JournalWithAuthor): CmsJournalArticleDto {
  const body = Array.isArray(row.body)
    ? (row.body as unknown as Array<Record<string, unknown>>)
    : typeof row.body === 'object' && row.body !== null
      ? (row.body as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body,
    coverMediaUrl: row.coverMediaUrl,
    authorId: row.authorId,
    authorName: row.author?.fullName ?? null,
    status: row.status as CmsStatusInput,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function assertCmsTransitionAuthorizedAndValid(
  actor: AuthenticatedActor,
  currentStatus: CmsStatus,
  targetStatus: CmsStatus,
): void {
  if (targetStatus === CmsStatus.PUBLISHED || targetStatus === CmsStatus.ARCHIVED) {
    if (!actor.permissions.includes('cms.publish')) {
      throw new DomainHttpException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        `cms.publish permission is required to transition CMS content to ${targetStatus}`,
      );
    }
  } else if (!actor.permissions.includes('cms.write')) {
    throw new DomainHttpException(
      HttpStatus.FORBIDDEN,
      'FORBIDDEN',
      `cms.write permission is required to transition CMS content to ${targetStatus}`,
    );
  }

  const allowed = CMS_ALLOWED_TRANSITIONS[currentStatus] ?? [];
  if (!allowed.includes(targetStatus)) {
    throw new DomainHttpException(
      HttpStatus.CONFLICT,
      'INVALID_STATE_TRANSITION',
      `Cannot transition CMS content from ${currentStatus} to ${targetStatus}`,
      [
        {
          field: 'toStatus',
          issue: `Transition ${currentStatus} -> ${targetStatus} is not permitted`,
        },
      ],
    );
  }
}

@Injectable()
export class CmsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  // =========================================================================
  // Public Storefront Reads (PUBLISHED + deletedAt IS NULL only)
  // =========================================================================

  async getPublicPageBySlug(slug: string): Promise<CmsPageDto> {
    const row = await this.prisma.client.page.findFirst({
      where: {
        slug,
        status: CmsStatus.PUBLISHED,
        deletedAt: null,
      },
    });
    if (!row) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'CMS page not found',
      );
    }
    return mapPageDto(row);
  }

  async listPublicLookbooks(
    query: { page: number; limit: number },
  ): Promise<PaginatedResponse<CmsLookbookDto>> {
    const where: Prisma.LookbookWhereInput = {
      status: CmsStatus.PUBLISHED,
      deletedAt: null,
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.client.lookbook.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.client.lookbook.count({ where }),
    ]);

    return {
      items: rows.map(mapLookbookDto),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async getPublicLookbookBySlug(slug: string): Promise<CmsLookbookDto> {
    const row = await this.prisma.client.lookbook.findFirst({
      where: {
        slug,
        status: CmsStatus.PUBLISHED,
        deletedAt: null,
      },
    });
    if (!row) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'Lookbook not found',
      );
    }
    return mapLookbookDto(row);
  }

  async listPublicJournal(
    query: { page: number; limit: number },
  ): Promise<PaginatedResponse<CmsJournalArticleDto>> {
    const where: Prisma.JournalArticleWhereInput = {
      status: CmsStatus.PUBLISHED,
      deletedAt: null,
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.client.journalArticle.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.limit,
        include: { author: { select: { fullName: true } } },
      }),
      this.prisma.client.journalArticle.count({ where }),
    ]);

    return {
      items: rows.map(mapJournalDto),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async getPublicJournalBySlug(slug: string): Promise<CmsJournalArticleDto> {
    const row = await this.prisma.client.journalArticle.findFirst({
      where: {
        slug,
        status: CmsStatus.PUBLISHED,
        deletedAt: null,
      },
      include: { author: { select: { fullName: true } } },
    });
    if (!row) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'RESOURCE_NOT_FOUND',
        'Journal article not found',
      );
    }
    return mapJournalDto(row);
  }

  // =========================================================================
  // Admin Pages
  // =========================================================================

  async listAdminPages(query: AdminCmsListQuery): Promise<PaginatedResponse<CmsPageDto>> {
    const search = query.q?.trim();
    const where: Prisma.PageWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status as CmsStatus } : {}),
      ...(search && search.length > 0
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.client.page.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.client.page.count({ where }),
    ]);

    return {
      items: rows.map(mapPageDto),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async getAdminPageById(id: string): Promise<CmsPageDto> {
    const row = await this.prisma.client.page.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'CMS_PAGE_NOT_FOUND',
        'CMS page not found',
      );
    }
    return mapPageDto(row);
  }

  async createPage(
    req: HttpRequestLike,
    actor: AuthenticatedActor,
    body: CreateCmsPageRequest,
  ): Promise<CmsPageDto> {
    try {
      return await this.prisma.withTransaction(async (tx) => {
        const created = await tx.page.create({
          data: {
            slug: body.slug,
            title: body.title,
            blocks: JSON.parse(JSON.stringify(body.blocks)) as Prisma.InputJsonValue,
            status: CmsStatus.DRAFT,
            seoTitle: body.seoTitle ?? null,
            seoDescription: body.seoDescription ?? null,
          },
        });

        await this.auditLog.record(
          {
            actorId: actor.userId,
            actorRole: actor.roles[0] ?? 'ADMIN',
            action: 'cms.page.created',
            resource: 'page',
            resourceId: created.id,
            ipAddress: extractClientIp(req),
            afterState: {
              slug: created.slug,
              title: created.title,
              status: created.status,
            },
          },
          tx,
        );

        return mapPageDto(created);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'CMS_SLUG_CONFLICT',
          `Page slug "${body.slug}" already exists`,
          [{ field: 'slug', issue: 'Slug already exists' }],
        );
      }
      throw error;
    }
  }

  async updatePage(
    req: HttpRequestLike,
    actor: AuthenticatedActor,
    id: string,
    body: UpdateCmsPageRequest,
  ): Promise<CmsPageDto> {
    try {
      return await this.prisma.withTransaction(async (tx) => {
        const existing = await tx.page.findFirst({
          where: { id, deletedAt: null },
        });
        if (!existing) {
          throw new DomainHttpException(
            HttpStatus.NOT_FOUND,
            'CMS_PAGE_NOT_FOUND',
            'CMS page not found',
          );
        }

        const updated = await tx.page.update({
          where: { id },
          data: {
            ...(body.slug !== undefined ? { slug: body.slug } : {}),
            ...(body.title !== undefined ? { title: body.title } : {}),
            ...(body.blocks !== undefined
              ? {
                  blocks: JSON.parse(
                    JSON.stringify(body.blocks),
                  ) as Prisma.InputJsonValue,
                }
              : {}),
            ...(body.seoTitle !== undefined ? { seoTitle: body.seoTitle } : {}),
            ...(body.seoDescription !== undefined
              ? { seoDescription: body.seoDescription }
              : {}),
          },
        });

        await this.auditLog.record(
          {
            actorId: actor.userId,
            actorRole: actor.roles[0] ?? 'ADMIN',
            action: 'cms.page.updated',
            resource: 'page',
            resourceId: updated.id,
            ipAddress: extractClientIp(req),
            beforeState: {
              slug: existing.slug,
              title: existing.title,
              status: existing.status,
            },
            afterState: {
              slug: updated.slug,
              title: updated.title,
              status: updated.status,
            },
          },
          tx,
        );

        return mapPageDto(updated);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'CMS_SLUG_CONFLICT',
          'Page slug already exists',
          [{ field: 'slug', issue: 'Slug already exists' }],
        );
      }
      throw error;
    }
  }

  async deletePage(
    req: HttpRequestLike,
    actor: AuthenticatedActor,
    id: string,
  ): Promise<void> {
    await this.prisma.withTransaction(async (tx) => {
      const existing = await tx.page.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'CMS_PAGE_NOT_FOUND',
          'CMS page not found',
        );
      }

      await tx.page.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await this.auditLog.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'ADMIN',
          action: 'cms.page.deleted',
          resource: 'page',
          resourceId: existing.id,
          ipAddress: extractClientIp(req),
          beforeState: { slug: existing.slug, status: existing.status },
          afterState: { deleted: true },
        },
        tx,
      );
    });
  }

  async transitionPage(
    req: HttpRequestLike,
    actor: AuthenticatedActor,
    id: string,
    body: TransitionCmsStatusRequest,
  ): Promise<CmsPageDto> {
    return this.prisma.withTransaction(async (tx) => {
      const existing = await tx.page.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'CMS_PAGE_NOT_FOUND',
          'CMS page not found',
        );
      }

      const targetStatus = body.toStatus as CmsStatus;
      assertCmsTransitionAuthorizedAndValid(actor, existing.status, targetStatus);

      const updated = await tx.page.update({
        where: { id },
        data: {
          status: targetStatus,
          ...(targetStatus === CmsStatus.PUBLISHED
            ? { publishedAt: existing.publishedAt ?? new Date() }
            : {}),
        },
      });

      await this.auditLog.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'ADMIN',
          action: 'cms.page.transitioned',
          resource: 'page',
          resourceId: updated.id,
          ipAddress: extractClientIp(req),
          beforeState: { status: existing.status },
          afterState: {
            status: updated.status,
            publishedAt: updated.publishedAt?.toISOString() ?? null,
          },
        },
        tx,
      );

      return mapPageDto(updated);
    });
  }

  // =========================================================================
  // Admin Lookbooks
  // =========================================================================

  async listAdminLookbooks(
    query: AdminCmsListQuery,
  ): Promise<PaginatedResponse<CmsLookbookDto>> {
    const search = query.q?.trim();
    const where: Prisma.LookbookWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status as CmsStatus } : {}),
      ...(search && search.length > 0
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
              { season: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.client.lookbook.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.client.lookbook.count({ where }),
    ]);

    return {
      items: rows.map(mapLookbookDto),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async getAdminLookbookById(id: string): Promise<CmsLookbookDto> {
    const row = await this.prisma.client.lookbook.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'CMS_LOOKBOOK_NOT_FOUND',
        'Lookbook not found',
      );
    }
    return mapLookbookDto(row);
  }

  async createLookbook(
    req: HttpRequestLike,
    actor: AuthenticatedActor,
    body: CreateCmsLookbookRequest,
  ): Promise<CmsLookbookDto> {
    try {
      return await this.prisma.withTransaction(async (tx) => {
        const created = await tx.lookbook.create({
          data: {
            slug: body.slug,
            title: body.title,
            season: body.season,
            description: body.description ?? null,
            slides: JSON.parse(JSON.stringify(body.slides)) as Prisma.InputJsonValue,
            status: CmsStatus.DRAFT,
          },
        });

        await this.auditLog.record(
          {
            actorId: actor.userId,
            actorRole: actor.roles[0] ?? 'ADMIN',
            action: 'cms.lookbook.created',
            resource: 'lookbook',
            resourceId: created.id,
            ipAddress: extractClientIp(req),
            afterState: {
              slug: created.slug,
              title: created.title,
              season: created.season,
              status: created.status,
            },
          },
          tx,
        );

        return mapLookbookDto(created);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'CMS_SLUG_CONFLICT',
          `Lookbook slug "${body.slug}" already exists`,
          [{ field: 'slug', issue: 'Slug already exists' }],
        );
      }
      throw error;
    }
  }

  async updateLookbook(
    req: HttpRequestLike,
    actor: AuthenticatedActor,
    id: string,
    body: UpdateCmsLookbookRequest,
  ): Promise<CmsLookbookDto> {
    try {
      return await this.prisma.withTransaction(async (tx) => {
        const existing = await tx.lookbook.findFirst({
          where: { id, deletedAt: null },
        });
        if (!existing) {
          throw new DomainHttpException(
            HttpStatus.NOT_FOUND,
            'CMS_LOOKBOOK_NOT_FOUND',
            'Lookbook not found',
          );
        }

        const updated = await tx.lookbook.update({
          where: { id },
          data: {
            ...(body.slug !== undefined ? { slug: body.slug } : {}),
            ...(body.title !== undefined ? { title: body.title } : {}),
            ...(body.season !== undefined ? { season: body.season } : {}),
            ...(body.description !== undefined
              ? { description: body.description }
              : {}),
            ...(body.slides !== undefined
              ? {
                  slides: JSON.parse(
                    JSON.stringify(body.slides),
                  ) as Prisma.InputJsonValue,
                }
              : {}),
          },
        });

        await this.auditLog.record(
          {
            actorId: actor.userId,
            actorRole: actor.roles[0] ?? 'ADMIN',
            action: 'cms.lookbook.updated',
            resource: 'lookbook',
            resourceId: updated.id,
            ipAddress: extractClientIp(req),
            beforeState: {
              slug: existing.slug,
              title: existing.title,
              status: existing.status,
            },
            afterState: {
              slug: updated.slug,
              title: updated.title,
              status: updated.status,
            },
          },
          tx,
        );

        return mapLookbookDto(updated);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'CMS_SLUG_CONFLICT',
          'Lookbook slug already exists',
          [{ field: 'slug', issue: 'Slug already exists' }],
        );
      }
      throw error;
    }
  }

  async deleteLookbook(
    req: HttpRequestLike,
    actor: AuthenticatedActor,
    id: string,
  ): Promise<void> {
    await this.prisma.withTransaction(async (tx) => {
      const existing = await tx.lookbook.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'CMS_LOOKBOOK_NOT_FOUND',
          'Lookbook not found',
        );
      }

      await tx.lookbook.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await this.auditLog.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'ADMIN',
          action: 'cms.lookbook.deleted',
          resource: 'lookbook',
          resourceId: existing.id,
          ipAddress: extractClientIp(req),
          beforeState: { slug: existing.slug, status: existing.status },
          afterState: { deleted: true },
        },
        tx,
      );
    });
  }

  async transitionLookbook(
    req: HttpRequestLike,
    actor: AuthenticatedActor,
    id: string,
    body: TransitionCmsStatusRequest,
  ): Promise<CmsLookbookDto> {
    return this.prisma.withTransaction(async (tx) => {
      const existing = await tx.lookbook.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'CMS_LOOKBOOK_NOT_FOUND',
          'Lookbook not found',
        );
      }

      const targetStatus = body.toStatus as CmsStatus;
      assertCmsTransitionAuthorizedAndValid(actor, existing.status, targetStatus);

      const updated = await tx.lookbook.update({
        where: { id },
        data: {
          status: targetStatus,
          ...(targetStatus === CmsStatus.PUBLISHED
            ? { publishedAt: existing.publishedAt ?? new Date() }
            : {}),
        },
      });

      await this.auditLog.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'ADMIN',
          action: 'cms.lookbook.transitioned',
          resource: 'lookbook',
          resourceId: updated.id,
          ipAddress: extractClientIp(req),
          beforeState: { status: existing.status },
          afterState: {
            status: updated.status,
            publishedAt: updated.publishedAt?.toISOString() ?? null,
          },
        },
        tx,
      );

      return mapLookbookDto(updated);
    });
  }

  // =========================================================================
  // Admin Journal Articles
  // =========================================================================

  async listAdminJournal(
    query: AdminCmsListQuery,
  ): Promise<PaginatedResponse<CmsJournalArticleDto>> {
    const search = query.q?.trim();
    const where: Prisma.JournalArticleWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status as CmsStatus } : {}),
      ...(search && search.length > 0
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.client.journalArticle.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
        include: { author: { select: { fullName: true } } },
      }),
      this.prisma.client.journalArticle.count({ where }),
    ]);

    return {
      items: rows.map(mapJournalDto),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async getAdminJournalById(id: string): Promise<CmsJournalArticleDto> {
    const row = await this.prisma.client.journalArticle.findFirst({
      where: { id, deletedAt: null },
      include: { author: { select: { fullName: true } } },
    });
    if (!row) {
      throw new DomainHttpException(
        HttpStatus.NOT_FOUND,
        'CMS_JOURNAL_NOT_FOUND',
        'Journal article not found',
      );
    }
    return mapJournalDto(row);
  }

  async createJournal(
    req: HttpRequestLike,
    actor: AuthenticatedActor,
    body: CreateCmsJournalRequest,
  ): Promise<CmsJournalArticleDto> {
    try {
      return await this.prisma.withTransaction(async (tx) => {
        const created = await tx.journalArticle.create({
          data: {
            slug: body.slug,
            title: body.title,
            excerpt: body.excerpt,
            body: JSON.parse(JSON.stringify(body.body)) as Prisma.InputJsonValue,
            coverMediaUrl: body.coverMediaUrl ?? null,
            authorId: actor.userId,
            status: CmsStatus.DRAFT,
          },
          include: { author: { select: { fullName: true } } },
        });

        await this.auditLog.record(
          {
            actorId: actor.userId,
            actorRole: actor.roles[0] ?? 'ADMIN',
            action: 'cms.journal.created',
            resource: 'journal_article',
            resourceId: created.id,
            ipAddress: extractClientIp(req),
            afterState: {
              slug: created.slug,
              title: created.title,
              status: created.status,
            },
          },
          tx,
        );

        return mapJournalDto(created);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'CMS_SLUG_CONFLICT',
          `Journal slug "${body.slug}" already exists`,
          [{ field: 'slug', issue: 'Slug already exists' }],
        );
      }
      throw error;
    }
  }

  async updateJournal(
    req: HttpRequestLike,
    actor: AuthenticatedActor,
    id: string,
    body: UpdateCmsJournalRequest,
  ): Promise<CmsJournalArticleDto> {
    try {
      return await this.prisma.withTransaction(async (tx) => {
        const existing = await tx.journalArticle.findFirst({
          where: { id, deletedAt: null },
        });
        if (!existing) {
          throw new DomainHttpException(
            HttpStatus.NOT_FOUND,
            'CMS_JOURNAL_NOT_FOUND',
            'Journal article not found',
          );
        }

        const updated = await tx.journalArticle.update({
          where: { id },
          data: {
            ...(body.slug !== undefined ? { slug: body.slug } : {}),
            ...(body.title !== undefined ? { title: body.title } : {}),
            ...(body.excerpt !== undefined ? { excerpt: body.excerpt } : {}),
            ...(body.body !== undefined
              ? {
                  body: JSON.parse(JSON.stringify(body.body)) as Prisma.InputJsonValue,
                }
              : {}),
            ...(body.coverMediaUrl !== undefined
              ? { coverMediaUrl: body.coverMediaUrl }
              : {}),
          },
          include: { author: { select: { fullName: true } } },
        });

        await this.auditLog.record(
          {
            actorId: actor.userId,
            actorRole: actor.roles[0] ?? 'ADMIN',
            action: 'cms.journal.updated',
            resource: 'journal_article',
            resourceId: updated.id,
            ipAddress: extractClientIp(req),
            beforeState: {
              slug: existing.slug,
              title: existing.title,
              status: existing.status,
            },
            afterState: {
              slug: updated.slug,
              title: updated.title,
              status: updated.status,
            },
          },
          tx,
        );

        return mapJournalDto(updated);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainHttpException(
          HttpStatus.CONFLICT,
          'CMS_SLUG_CONFLICT',
          'Journal slug already exists',
          [{ field: 'slug', issue: 'Slug already exists' }],
        );
      }
      throw error;
    }
  }

  async deleteJournal(
    req: HttpRequestLike,
    actor: AuthenticatedActor,
    id: string,
  ): Promise<void> {
    await this.prisma.withTransaction(async (tx) => {
      const existing = await tx.journalArticle.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'CMS_JOURNAL_NOT_FOUND',
          'Journal article not found',
        );
      }

      await tx.journalArticle.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await this.auditLog.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'ADMIN',
          action: 'cms.journal.deleted',
          resource: 'journal_article',
          resourceId: existing.id,
          ipAddress: extractClientIp(req),
          beforeState: { slug: existing.slug, status: existing.status },
          afterState: { deleted: true },
        },
        tx,
      );
    });
  }

  async transitionJournal(
    req: HttpRequestLike,
    actor: AuthenticatedActor,
    id: string,
    body: TransitionCmsStatusRequest,
  ): Promise<CmsJournalArticleDto> {
    return this.prisma.withTransaction(async (tx) => {
      const existing = await tx.journalArticle.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) {
        throw new DomainHttpException(
          HttpStatus.NOT_FOUND,
          'CMS_JOURNAL_NOT_FOUND',
          'Journal article not found',
        );
      }

      const targetStatus = body.toStatus as CmsStatus;
      assertCmsTransitionAuthorizedAndValid(actor, existing.status, targetStatus);

      const updated = await tx.journalArticle.update({
        where: { id },
        data: {
          status: targetStatus,
          ...(targetStatus === CmsStatus.PUBLISHED
            ? { publishedAt: existing.publishedAt ?? new Date() }
            : {}),
        },
        include: { author: { select: { fullName: true } } },
      });

      await this.auditLog.record(
        {
          actorId: actor.userId,
          actorRole: actor.roles[0] ?? 'ADMIN',
          action: 'cms.journal.transitioned',
          resource: 'journal_article',
          resourceId: updated.id,
          ipAddress: extractClientIp(req),
          beforeState: { status: existing.status },
          afterState: {
            status: updated.status,
            publishedAt: updated.publishedAt?.toISOString() ?? null,
          },
        },
        tx,
      );

      return mapJournalDto(updated);
    });
  }
}
