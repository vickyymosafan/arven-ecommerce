'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import type {
  CmsJournalArticleDto,
  CmsLookbookDto,
  CmsPageBlockDto,
  CmsPageDto,
  CmsStatusInput,
} from '@arven/contracts';
import {
  createCmsJournalSchema,
  createCmsLookbookSchema,
  createCmsPageSchema,
  updateCmsJournalSchema,
  updateCmsLookbookSchema,
  updateCmsPageSchema,
} from '@arven/validators';
import {
  Badge,
  Button,
  DataTable,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  Select,
  StatusBanner,
  Surface,
  Textarea,
  cn,
  formatWIB,
  useToast,
  type DataTableColumn,
} from '@arven/ui';
import { AdminForbiddenPanel } from '@/components/admin-forbidden-panel';
import { AdminShell } from '@/components/admin-shell';
import {
  AdminApiClientError,
  adminApi,
  extractAdminFieldErrors,
  type PaginationMeta,
} from '@/lib/api-client';
import { formatStatusLabel, getCmsStatusBadge } from '@/lib/ops-helpers';
import { useAdminSession } from '@/lib/use-admin-session';

type CmsTab = 'lookbooks' | 'journal' | 'pages';

const CMS_STATUS_OPTIONS: readonly CmsStatusInput[] = [
  'DRAFT',
  'PREVIEW',
  'PUBLISHED',
  'ARCHIVED',
];

const STOREFRONT_BASE_URL = (
  process.env['NEXT_PUBLIC_STOREFRONT_URL'] ?? 'http://127.0.0.1:3000'
).replace(/\/$/, '');

interface SlideDraft {
  title: string;
  imageUrl: string;
  altText: string;
  caption: string;
  productSlug: string;
}

interface JournalSectionDraft {
  heading: string;
  body: string;
}

interface PageBlockDraft {
  type: string;
  heading: string;
  subheading: string;
  body: string;
  imageUrl: string;
  altText: string;
  ctaLabel: string;
  ctaHref: string;
}

function slugifyTitle(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractJournalSections(
  body: CmsJournalArticleDto['body'],
): JournalSectionDraft[] {
  if (Array.isArray(body)) {
    const mapped = body
      .map((entry) => ({
        heading: typeof entry['heading'] === 'string' ? entry['heading'] : '',
        body:
          typeof entry['body'] === 'string'
            ? entry['body']
            : typeof entry['paragraph'] === 'string'
              ? entry['paragraph']
              : typeof entry['text'] === 'string'
                ? entry['text']
                : '',
      }))
      .filter((s) => s.heading || s.body);
    return mapped.length > 0 ? mapped : [{ heading: '', body: '' }];
  }

  const sections = body['sections'];
  if (Array.isArray(sections)) {
    const mapped = sections
      .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
      .map((entry) => ({
        heading: typeof entry['heading'] === 'string' ? entry['heading'] : '',
        body:
          typeof entry['body'] === 'string'
            ? entry['body']
            : typeof entry['text'] === 'string'
              ? entry['text']
              : '',
      }));
    if (mapped.length > 0) return mapped;
  }

  const paragraphs = body['paragraphs'];
  if (Array.isArray(paragraphs)) {
    const mapped = paragraphs
      .filter((p): p is string => typeof p === 'string')
      .map((p) => ({ heading: '', body: p }));
    if (mapped.length > 0) return mapped;
  }

  if (typeof body['content'] === 'string') {
    return [{ heading: '', body: body['content'] }];
  }

  return [{ heading: '', body: '' }];
}

function extractPageBlocks(blocks: CmsPageDto['blocks']): PageBlockDraft[] {
  const list = Array.isArray(blocks)
    ? blocks
    : Array.isArray((blocks as Record<string, unknown>)['blocks'])
      ? ((blocks as Record<string, unknown>)['blocks'] as CmsPageBlockDto[])
      : [];

  if (list.length === 0) {
    return [
      {
        type: 'hero',
        heading: '',
        subheading: '',
        body: '',
        imageUrl: '',
        altText: '',
        ctaLabel: '',
        ctaHref: '',
      },
    ];
  }

  return list.map((blk) => ({
    type: blk.type || 'editorial_text',
    heading: blk.heading ?? '',
    subheading: blk.subheading ?? '',
    body: blk.body ?? '',
    imageUrl: blk.imageUrl ?? '',
    altText: blk.altText ?? '',
    ctaLabel: blk.ctaLabel ?? '',
    ctaHref: blk.ctaHref ?? '',
  }));
}

export default function AdminCmsPage() {
  const { toast } = useToast();
  const { user, loading: sessionLoading, error: sessionError, canAccess, reload } =
    useAdminSession();

  const hasCmsAccess = canAccess(['cms.read', 'cms.write', 'cms.publish']);
  const canReadCms = canAccess(['cms.read']);
  const canWriteCms = canAccess(['cms.write']);
  const canPublishCms = canAccess(['cms.publish']);

  const [activeTab, setActiveTab] = useState<CmsTab>('lookbooks');
  const lookbooksTabRef = useRef<HTMLButtonElement | null>(null);
  const journalTabRef = useRef<HTMLButtonElement | null>(null);
  const pagesTabRef = useRef<HTMLButtonElement | null>(null);

  const [draftQ, setDraftQ] = useState('');
  const [draftStatus, setDraftStatus] = useState<string>('');
  const [filters, setFilters] = useState<{ page: number; q: string; status: string }>({
    page: 1,
    q: '',
    status: '',
  });

  const [lookbooks, setLookbooks] = useState<CmsLookbookDto[]>([]);
  const [journalArticles, setJournalArticles] = useState<CmsJournalArticleDto[]>([]);
  const [pages, setPages] = useState<CmsPageDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    requestId: '',
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [loadingList, setLoadingList] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; requestId?: string | null } | null>(
    null,
  );
  const [transitioningId, setTransitioningId] = useState<string | null>(null);

  // Lookbook Modal State
  const [lookbookModalOpen, setLookbookModalOpen] = useState(false);
  const [editingLookbook, setEditingLookbook] = useState<CmsLookbookDto | null>(null);
  const [lbTitle, setLbTitle] = useState('');
  const [lbSlug, setLbSlug] = useState('');
  const [lbSeason, setLbSeason] = useState('');
  const [lbDescription, setLbDescription] = useState('');
  const [lbSlides, setLbSlides] = useState<SlideDraft[]>([]);

  // Journal Modal State
  const [journalModalOpen, setJournalModalOpen] = useState(false);
  const [editingJournal, setEditingJournal] = useState<CmsJournalArticleDto | null>(null);
  const [jnTitle, setJnTitle] = useState('');
  const [jnSlug, setJnSlug] = useState('');
  const [jnExcerpt, setJnExcerpt] = useState('');
  const [jnCoverMediaUrl, setJnCoverMediaUrl] = useState('');
  const [jnSections, setJnSections] = useState<JournalSectionDraft[]>([]);

  // Page Modal State
  const [pageModalOpen, setPageModalOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<CmsPageDto | null>(null);
  const [pgTitle, setPgTitle] = useState('');
  const [pgSlug, setPgSlug] = useState('');
  const [pgSeoTitle, setPgSeoTitle] = useState('');
  const [pgSeoDescription, setPgSeoDescription] = useState('');
  const [pgBlocks, setPgBlocks] = useState<PageBlockDraft[]>([]);

  const [modalError, setModalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const loadActiveList = useCallback(() => {
    if (!user || !canReadCms) return;
    setLoadingList(true);
    setLoadError(null);
    setReloadNonce((n) => n + 1);
  }, [canReadCms, user]);

  useEffect(() => {
    if (sessionLoading || !user || !canReadCms) {
      return;
    }

    let active = true;
    const query = {
      page: filters.page,
      limit: 20,
      status: (filters.status as CmsStatusInput) || undefined,
      q: filters.q || undefined,
    };

    const promise =
      activeTab === 'lookbooks'
        ? adminApi.listCmsLookbooks(query).then((res) => {
            if (!active) return;
            setLookbooks(res.items);
            setMeta(res.meta);
          })
        : activeTab === 'journal'
          ? adminApi.listCmsJournal(query).then((res) => {
              if (!active) return;
              setJournalArticles(res.items);
              setMeta(res.meta);
            })
          : adminApi.listCmsPages(query).then((res) => {
              if (!active) return;
              setPages(res.items);
              setMeta(res.meta);
            });

    promise
      .then(() => {
        if (active) setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminApiClientError) {
          setLoadError({ message: err.message, requestId: err.requestId });
        } else {
          setLoadError({ message: 'Unable to load CMS records right now.' });
        }
      })
      .finally(() => {
        if (active) {
          setLoadingList(false);
        }
      });

    return () => {
      active = false;
    };
  }, [activeTab, canReadCms, filters, reloadNonce, sessionLoading, user]);

  const handleTabChange = (next: CmsTab) => {
    setActiveTab(next);
    setFilters((prev) => ({ ...prev, page: 1 }));
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: CmsTab) => {
    const order: readonly CmsTab[] = ['lookbooks', 'journal', 'pages'];
    const idx = order.indexOf(current);
    let nextIdx: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIdx = (idx + 1) % order.length;
    } else if (event.key === 'ArrowLeft') {
      nextIdx = (idx - 1 + order.length) % order.length;
    } else if (event.key === 'Home') {
      nextIdx = 0;
    } else if (event.key === 'End') {
      nextIdx = order.length - 1;
    }
    if (nextIdx === null) return;
    event.preventDefault();
    const nextTab = order[nextIdx]!;
    handleTabChange(nextTab);
    if (nextTab === 'lookbooks') lookbooksTabRef.current?.focus();
    if (nextTab === 'journal') journalTabRef.current?.focus();
    if (nextTab === 'pages') pagesTabRef.current?.focus();
  };

  const openLookbookEditor = (item: CmsLookbookDto | null) => {
    setEditingLookbook(item);
    setLbTitle(item?.title ?? '');
    setLbSlug(item?.slug ?? '');
    setLbSeason(item?.season ?? 'AW26');
    setLbDescription(item?.description ?? '');
    setLbSlides(
      item && item.slides.length > 0
        ? item.slides.map((s) => ({
            title: s.title,
            imageUrl: s.imageUrl,
            altText: s.altText ?? '',
            caption: s.caption ?? '',
            productSlug: s.productSlug ?? '',
          }))
        : [{ title: '', imageUrl: '', altText: '', caption: '', productSlug: '' }],
    );
    setModalError(null);
    setFieldErrors({});
    setLookbookModalOpen(true);
  };

  const openJournalEditor = (item: CmsJournalArticleDto | null) => {
    setEditingJournal(item);
    setJnTitle(item?.title ?? '');
    setJnSlug(item?.slug ?? '');
    setJnExcerpt(item?.excerpt ?? '');
    setJnCoverMediaUrl(item?.coverMediaUrl ?? '');
    setJnSections(
      item ? extractJournalSections(item.body) : [{ heading: '', body: '' }],
    );
    setModalError(null);
    setFieldErrors({});
    setJournalModalOpen(true);
  };

  const openPageEditor = (item: CmsPageDto | null) => {
    setEditingPage(item);
    setPgTitle(item?.title ?? '');
    setPgSlug(item?.slug ?? '');
    setPgSeoTitle(item?.seoTitle ?? '');
    setPgSeoDescription(item?.seoDescription ?? '');
    setPgBlocks(
      item
        ? extractPageBlocks(item.blocks)
        : [
            {
              type: 'hero',
              heading: '',
              subheading: '',
              body: '',
              imageUrl: '',
              altText: '',
              ctaLabel: '',
              ctaHref: '',
            },
          ],
    );
    setModalError(null);
    setFieldErrors({});
    setPageModalOpen(true);
  };

  const handleTransition = useCallback(
    async (kind: CmsTab, id: string, toStatus: CmsStatusInput) => {
      setTransitioningId(id);
      try {
        if (kind === 'lookbooks') {
          await adminApi.transitionCmsLookbook(id, { toStatus });
        } else if (kind === 'journal') {
          await adminApi.transitionCmsJournal(id, { toStatus });
        } else {
          await adminApi.transitionCmsPage(id, { toStatus });
        }
        await loadActiveList();
        toast({
          tone: 'success',
          title: `Status updated to ${toStatus}`,
          description: 'Editorial state transition recorded.',
        });
      } catch (err) {
        toast({
          tone: 'danger',
          title: 'Status transition failed',
          description:
            err instanceof AdminApiClientError
              ? err.message
              : 'Unable to transition CMS record right now.',
        });
      } finally {
        setTransitioningId(null);
      }
    },
    [loadActiveList, toast],
  );

  const handleSaveLookbook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalError(null);
    setFieldErrors({});

    for (let i = 0; i < lbSlides.length; i += 1) {
      const slide = lbSlides[i]!;
      if (!slide.altText.trim()) {
        setModalError(`Slide ${i + 1}: Alt text is required for accessibility.`);
        return;
      }
    }

    const payload = {
      title: lbTitle.trim(),
      slug: lbSlug.trim() || slugifyTitle(lbTitle),
      season: lbSeason.trim(),
      description: lbDescription.trim() ? lbDescription.trim() : null,
      slides: lbSlides.map((slide, idx) => ({
        title: slide.title.trim(),
        imageUrl: slide.imageUrl.trim(),
        altText: slide.altText.trim(),
        ...(slide.caption.trim() ? { caption: slide.caption.trim() } : {}),
        ...(slide.productSlug.trim() ? { productSlug: slide.productSlug.trim() } : {}),
        position: idx + 1,
      })),
    };

    const schema = editingLookbook ? updateCmsLookbookSchema : createCmsLookbookSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'title');
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setFieldErrors(nextErrors);
      setModalError(parsed.error.issues[0]?.message ?? 'Please review the highlighted fields.');
      return;
    }

    setSaving(true);
    try {
      if (editingLookbook) {
        await adminApi.updateCmsLookbook(editingLookbook.id, payload);
        toast({ tone: 'success', title: 'Lookbook updated', description: payload.title });
      } else {
        await adminApi.createCmsLookbook(payload);
        toast({ tone: 'success', title: 'Lookbook draft created', description: payload.title });
      }
      setLookbookModalOpen(false);
      await loadActiveList();
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setFieldErrors(extractAdminFieldErrors(err));
        setModalError(err.message);
      } else {
        setModalError('Unable to save lookbook right now.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveJournal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalError(null);
    setFieldErrors({});

    const cleanedSections = jnSections
      .map((s) => ({
        ...(s.heading.trim() ? { heading: s.heading.trim() } : {}),
        body: s.body.trim(),
      }))
      .filter((s) => s.body.length > 0);

    if (cleanedSections.length === 0) {
      setModalError('At least one article body section is required.');
      return;
    }

    const payload = {
      title: jnTitle.trim(),
      slug: jnSlug.trim() || slugifyTitle(jnTitle),
      excerpt: jnExcerpt.trim(),
      coverMediaUrl: jnCoverMediaUrl.trim() ? jnCoverMediaUrl.trim() : null,
      body: { sections: cleanedSections },
    };

    const schema = editingJournal ? updateCmsJournalSchema : createCmsJournalSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'title');
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setFieldErrors(nextErrors);
      setModalError(parsed.error.issues[0]?.message ?? 'Please review the highlighted fields.');
      return;
    }

    setSaving(true);
    try {
      if (editingJournal) {
        await adminApi.updateCmsJournal(editingJournal.id, payload);
        toast({ tone: 'success', title: 'Journal article updated', description: payload.title });
      } else {
        await adminApi.createCmsJournal(payload);
        toast({ tone: 'success', title: 'Journal draft created', description: payload.title });
      }
      setJournalModalOpen(false);
      await loadActiveList();
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setFieldErrors(extractAdminFieldErrors(err));
        setModalError(err.message);
      } else {
        setModalError('Unable to save journal article right now.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSavePage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalError(null);
    setFieldErrors({});

    const cleanedBlocks = pgBlocks.map((blk, idx) => ({
      id: `block-${idx + 1}`,
      type: blk.type.trim() || 'editorial_text',
      ...(blk.heading.trim() ? { heading: blk.heading.trim() } : {}),
      ...(blk.subheading.trim() ? { subheading: blk.subheading.trim() } : {}),
      ...(blk.body.trim() ? { body: blk.body.trim() } : {}),
      ...(blk.imageUrl.trim() ? { imageUrl: blk.imageUrl.trim() } : {}),
      ...(blk.altText.trim() ? { altText: blk.altText.trim() } : {}),
      ...(blk.ctaLabel.trim() ? { ctaLabel: blk.ctaLabel.trim() } : {}),
      ...(blk.ctaHref.trim() ? { ctaHref: blk.ctaHref.trim() } : {}),
    }));

    const payload = {
      title: pgTitle.trim(),
      slug: pgSlug.trim() || slugifyTitle(pgTitle),
      seoTitle: pgSeoTitle.trim() ? pgSeoTitle.trim() : null,
      seoDescription: pgSeoDescription.trim() ? pgSeoDescription.trim() : null,
      blocks: cleanedBlocks,
    };

    const schema = editingPage ? updateCmsPageSchema : createCmsPageSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'title');
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setFieldErrors(nextErrors);
      setModalError(parsed.error.issues[0]?.message ?? 'Please review the highlighted fields.');
      return;
    }

    setSaving(true);
    try {
      if (editingPage) {
        await adminApi.updateCmsPage(editingPage.id, payload);
        toast({ tone: 'success', title: 'Page updated', description: payload.title });
      } else {
        await adminApi.createCmsPage(payload);
        toast({ tone: 'success', title: 'Page draft created', description: payload.title });
      }
      setPageModalOpen(false);
      await loadActiveList();
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setFieldErrors(extractAdminFieldErrors(err));
        setModalError(err.message);
      } else {
        setModalError('Unable to save CMS page right now.');
      }
    } finally {
      setSaving(false);
    }
  };

  const renderWorkflowActions = useCallback(
    (
      kind: CmsTab,
      record: { id: string; slug: string; status: CmsStatusInput },
      onEdit: () => void,
    ) => {
      const isBusy = transitioningId === record.id;
      const storefrontPath =
        kind === 'lookbooks'
          ? `/lookbook/${encodeURIComponent(record.slug)}`
          : kind === 'journal'
            ? `/journal/${encodeURIComponent(record.slug)}`
            : `/${encodeURIComponent(record.slug)}`;

      return (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canWriteCms ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-11"
              onClick={onEdit}
            >
              Edit
            </Button>
          ) : null}

          {canWriteCms && record.status === 'DRAFT' ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-11"
              isLoading={isBusy}
              onClick={() => void handleTransition(kind, record.id, 'PREVIEW')}
            >
              Move to Preview
            </Button>
          ) : null}

          {canWriteCms && (record.status === 'PREVIEW' || record.status === 'ARCHIVED') ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-11"
              isLoading={isBusy}
              onClick={() => void handleTransition(kind, record.id, 'DRAFT')}
            >
              Return to Draft
            </Button>
          ) : null}

          {canPublishCms && (record.status === 'DRAFT' || record.status === 'PREVIEW') ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="min-h-11"
              isLoading={isBusy}
              onClick={() => void handleTransition(kind, record.id, 'PUBLISHED')}
            >
              Publish
            </Button>
          ) : null}

          {canPublishCms && record.status === 'PUBLISHED' ? (
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="min-h-11"
              isLoading={isBusy}
              onClick={() => void handleTransition(kind, record.id, 'ARCHIVED')}
            >
              Archive
            </Button>
          ) : null}

          {record.status === 'PUBLISHED' ? (
            <a
              href={`${STOREFRONT_BASE_URL}${storefrontPath}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-control-border px-3 py-2 text-xs font-medium text-link hover:bg-subtle hover:underline"
            >
              View on Storefront
            </a>
          ) : null}
        </div>
      );
    },
    [canPublishCms, canWriteCms, handleTransition, transitioningId],
  );

  const lookbookColumns = useMemo<DataTableColumn<CmsLookbookDto>[]>(
    () => [
      {
        key: 'title',
        header: 'Title',
        render: (row) => <span className="font-medium text-ink">{row.title}</span>,
      },
      {
        key: 'slug',
        header: 'Slug',
        render: (row) => <span className="font-mono text-xs text-ink-muted">{row.slug}</span>,
      },
      {
        key: 'season',
        header: 'Season',
        render: (row) => (
          <span className="text-xs text-ink-secondary">
            {row.season} ({row.slides.length} slide{row.slides.length === 1 ? '' : 's'})
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => {
          const badge = getCmsStatusBadge(row.status);
          return <Badge tone={badge.tone}>{badge.label}</Badge>;
        },
      },
      {
        key: 'publishedAt',
        header: 'Published (WIB)',
        render: (row) => (
          <span className="font-mono text-xs tabular-nums text-ink-muted">
            {formatWIB(row.publishedAt)}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        render: (row) =>
          renderWorkflowActions('lookbooks', row, () => openLookbookEditor(row)),
      },
    ],
    [renderWorkflowActions],
  );

  const journalColumns = useMemo<DataTableColumn<CmsJournalArticleDto>[]>(
    () => [
      {
        key: 'title',
        header: 'Title',
        render: (row) => <span className="font-medium text-ink">{row.title}</span>,
      },
      {
        key: 'slug',
        header: 'Slug',
        render: (row) => <span className="font-mono text-xs text-ink-muted">{row.slug}</span>,
      },
      {
        key: 'excerpt',
        header: 'Excerpt',
        render: (row) => (
          <p className="max-w-xs truncate text-xs text-ink-secondary">{row.excerpt}</p>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => {
          const badge = getCmsStatusBadge(row.status);
          return <Badge tone={badge.tone}>{badge.label}</Badge>;
        },
      },
      {
        key: 'publishedAt',
        header: 'Published (WIB)',
        render: (row) => (
          <span className="font-mono text-xs tabular-nums text-ink-muted">
            {formatWIB(row.publishedAt)}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        render: (row) => renderWorkflowActions('journal', row, () => openJournalEditor(row)),
      },
    ],
    [renderWorkflowActions],
  );

  const pageColumns = useMemo<DataTableColumn<CmsPageDto>[]>(
    () => [
      {
        key: 'title',
        header: 'Title',
        render: (row) => <span className="font-medium text-ink">{row.title}</span>,
      },
      {
        key: 'slug',
        header: 'Slug',
        render: (row) => <span className="font-mono text-xs text-ink-muted">{row.slug}</span>,
      },
      {
        key: 'seoTitle',
        header: 'SEO Title',
        render: (row) => (
          <span className="text-xs text-ink-secondary">{row.seoTitle ?? 'Default title'}</span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => {
          const badge = getCmsStatusBadge(row.status);
          return <Badge tone={badge.tone}>{badge.label}</Badge>;
        },
      },
      {
        key: 'publishedAt',
        header: 'Published (WIB)',
        render: (row) => (
          <span className="font-mono text-xs tabular-nums text-ink-muted">
            {formatWIB(row.publishedAt)}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        render: (row) => renderWorkflowActions('pages', row, () => openPageEditor(row)),
      },
    ],
    [renderWorkflowActions],
  );

  const createLabel =
    activeTab === 'lookbooks'
      ? 'New Lookbook'
      : activeTab === 'journal'
        ? 'New Journal Article'
        : 'New Page';

  return (
    <AdminShell
      title="Editorial CMS"
      description="Author Lookbooks, Journal essays, and Storefront Pages with DRAFT, PREVIEW, PUBLISHED, and ARCHIVED gating."
      user={user}
      actions={
        canWriteCms ? (
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => {
              if (activeTab === 'lookbooks') openLookbookEditor(null);
              if (activeTab === 'journal') openJournalEditor(null);
              if (activeTab === 'pages') openPageEditor(null);
            }}
          >
            {createLabel}
          </Button>
        ) : undefined
      }
    >
      {sessionLoading ? (
        <LoadingState label="Checking CMS permissions" rows={4} />
      ) : sessionError ? (
        <ErrorState
          title="Unable to verify staff session"
          message={sessionError.message}
          requestId={sessionError.requestId}
          onRetry={() => void reload()}
        />
      ) : !hasCmsAccess ? (
        <AdminForbiddenPanel description="Your assigned role does not include cms.read, cms.write, or cms.publish permissions." />
      ) : !canReadCms ? (
        <AdminForbiddenPanel description="Listing editorial CMS content requires cms.read permission." />
      ) : (
        <div className="space-y-6">
          <div
            role="tablist"
            aria-label="Editorial CMS Sections"
            className="flex flex-wrap items-center gap-2 border-b border-hairline pb-3"
          >
            <button
              ref={lookbooksTabRef}
              id="tab-cms-lookbooks"
              type="button"
              role="tab"
              aria-selected={activeTab === 'lookbooks'}
              aria-controls="panel-cms-content"
              tabIndex={activeTab === 'lookbooks' ? 0 : -1}
              onClick={() => handleTabChange('lookbooks')}
              onKeyDown={(e) => handleTabKeyDown(e, 'lookbooks')}
              className={cn(
                'inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border px-4 py-2 text-xs font-medium uppercase tracking-[0.06em] transition-colors cursor-pointer',
                activeTab === 'lookbooks'
                  ? 'border-strong-border bg-panel text-ink'
                  : 'border-hairline bg-subtle text-ink-secondary hover:border-control-border hover:text-ink',
              )}
            >
              Lookbooks
            </button>
            <button
              ref={journalTabRef}
              id="tab-cms-journal"
              type="button"
              role="tab"
              aria-selected={activeTab === 'journal'}
              aria-controls="panel-cms-content"
              tabIndex={activeTab === 'journal' ? 0 : -1}
              onClick={() => handleTabChange('journal')}
              onKeyDown={(e) => handleTabKeyDown(e, 'journal')}
              className={cn(
                'inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border px-4 py-2 text-xs font-medium uppercase tracking-[0.06em] transition-colors cursor-pointer',
                activeTab === 'journal'
                  ? 'border-strong-border bg-panel text-ink'
                  : 'border-hairline bg-subtle text-ink-secondary hover:border-control-border hover:text-ink',
              )}
            >
              Journal
            </button>
            <button
              ref={pagesTabRef}
              id="tab-cms-pages"
              type="button"
              role="tab"
              aria-selected={activeTab === 'pages'}
              aria-controls="panel-cms-content"
              tabIndex={activeTab === 'pages' ? 0 : -1}
              onClick={() => handleTabChange('pages')}
              onKeyDown={(e) => handleTabKeyDown(e, 'pages')}
              className={cn(
                'inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border px-4 py-2 text-xs font-medium uppercase tracking-[0.06em] transition-colors cursor-pointer',
                activeTab === 'pages'
                  ? 'border-strong-border bg-panel text-ink'
                  : 'border-hairline bg-subtle text-ink-secondary hover:border-control-border hover:text-ink',
              )}
            >
              Pages
            </button>
          </div>

          {!canPublishCms ? (
            <StatusBanner
              tone="info"
              description="Draft and preview authoring enabled (cms.write). Publishing or archiving requires cms.publish permission."
            />
          ) : null}

          <div
            id="panel-cms-content"
            role="tabpanel"
            aria-labelledby={`tab-cms-${activeTab}`}
            className="space-y-6"
          >
            <Surface variant="subtle" border="hairline" padding="md">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setFilters({ page: 1, q: draftQ.trim(), status: draftStatus });
                }}
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:items-end"
              >
                <div className="lg:col-span-5">
                  <FormField id="cms-search" label="Search Title or Slug">
                    <Input
                      id="cms-search"
                      placeholder="autumn-tailoring"
                      value={draftQ}
                      onChange={(event) => setDraftQ(event.target.value)}
                    />
                  </FormField>
                </div>
                <div className="lg:col-span-4">
                  <FormField id="cms-status-filter" label="Editorial Status">
                    <Select
                      id="cms-status-filter"
                      value={draftStatus}
                      onChange={(event) => setDraftStatus(event.target.value)}
                    >
                      <option value="">ALL</option>
                      {CMS_STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st}>
                          {formatStatusLabel(st)}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </div>
                <div className="flex flex-wrap gap-2 lg:col-span-3 lg:justify-end">
                  <Button type="submit" variant="primary" size="md">
                    Filter
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={() => {
                      setDraftQ('');
                      setDraftStatus('');
                      setFilters({ page: 1, q: '', status: '' });
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </form>
            </Surface>

            {activeTab === 'lookbooks' ? (
              <DataTable
                caption="ARVEN editorial lookbooks"
                tableBreakpoint="lg"
                columns={lookbookColumns}
                rows={lookbooks}
                getRowKey={(row) => row.id}
                isLoading={loadingList}
                loadingLabel="Loading lookbooks"
                error={loadError?.message ?? null}
                errorRequestId={loadError?.requestId ?? null}
                onRetry={() => void loadActiveList()}
                emptyTitle="No lookbooks found"
                emptyDescription="Create a new lookbook draft or adjust the status filter."
              />
            ) : activeTab === 'journal' ? (
              <DataTable
                caption="ARVEN editorial journal articles"
                tableBreakpoint="lg"
                columns={journalColumns}
                rows={journalArticles}
                getRowKey={(row) => row.id}
                isLoading={loadingList}
                loadingLabel="Loading journal articles"
                error={loadError?.message ?? null}
                errorRequestId={loadError?.requestId ?? null}
                onRetry={() => void loadActiveList()}
                emptyTitle="No journal articles found"
                emptyDescription="Create a new journal article draft or adjust the status filter."
              />
            ) : (
              <DataTable
                caption="ARVEN editorial pages"
                tableBreakpoint="lg"
                columns={pageColumns}
                rows={pages}
                getRowKey={(row) => row.id}
                isLoading={loadingList}
                loadingLabel="Loading CMS pages"
                error={loadError?.message ?? null}
                errorRequestId={loadError?.requestId ?? null}
                onRetry={() => void loadActiveList()}
                emptyTitle="No CMS pages found"
                emptyDescription="Create a new storefront page draft or adjust the status filter."
              />
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4 text-xs text-ink-muted">
              <span className="font-mono tabular-nums">
                Page {meta.page} of {meta.totalPages} ({meta.total} total records)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  className="min-h-11"
                  disabled={meta.page <= 1 || loadingList}
                  onClick={() => setFilters((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  className="min-h-11"
                  disabled={meta.page >= meta.totalPages || loadingList}
                  onClick={() => setFilters((p) => ({ ...p, page: p.page + 1 }))}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lookbook Editor Modal */}
      <Modal
        isOpen={lookbookModalOpen}
        onClose={() => setLookbookModalOpen(false)}
        title={editingLookbook ? `Edit Lookbook: ${editingLookbook.title}` : 'New Lookbook'}
        description="Configure seasonal lookbook metadata and structured editorial slides with required alt text."
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setLookbookModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="cms-lookbook-form"
              variant="primary"
              isLoading={saving}
              loadingLabel="Saving..."
            >
              Save Lookbook
            </Button>
          </>
        }
      >
        <form id="cms-lookbook-form" onSubmit={handleSaveLookbook} noValidate className="space-y-4">
          {modalError ? <StatusBanner tone="danger" description={modalError} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="lb-title" label="Title" error={fieldErrors['title']} required>
              <Input
                id="lb-title"
                value={lbTitle}
                onChange={(e) => {
                  setLbTitle(e.target.value);
                  if (!editingLookbook && !lbSlug) {
                    setLbSlug(slugifyTitle(e.target.value));
                  }
                }}
                invalid={Boolean(fieldErrors['title'])}
              />
            </FormField>
            <FormField id="lb-slug" label="Slug" error={fieldErrors['slug']} required>
              <Input
                id="lb-slug"
                value={lbSlug}
                onChange={(e) => setLbSlug(e.target.value)}
                invalid={Boolean(fieldErrors['slug'])}
                className="font-mono"
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="lb-season" label="Season" error={fieldErrors['season']} required>
              <Input
                id="lb-season"
                value={lbSeason}
                onChange={(e) => setLbSeason(e.target.value)}
                placeholder="AW26"
                invalid={Boolean(fieldErrors['season'])}
              />
            </FormField>
            <FormField id="lb-description" label="Description" error={fieldErrors['description']}>
              <Input
                id="lb-description"
                value={lbDescription}
                onChange={(e) => setLbDescription(e.target.value)}
              />
            </FormField>
          </div>

          <div className="space-y-3 border-t border-hairline pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                Lookbook Slides ({lbSlides.length})
              </h3>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setLbSlides((prev) => [
                    ...prev,
                    { title: '', imageUrl: '', altText: '', caption: '', productSlug: '' },
                  ])
                }
              >
                Add Slide
              </Button>
            </div>

            {lbSlides.map((slide, idx) => (
              <div
                key={idx}
                className="space-y-3 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-medium text-ink">
                    Slide {idx + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={idx === 0}
                      onClick={() =>
                        setLbSlides((prev) => {
                          const next = [...prev];
                          const current = next[idx]!;
                          next[idx] = next[idx - 1]!;
                          next[idx - 1] = current;
                          return next;
                        })
                      }
                    >
                      Up
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={idx === lbSlides.length - 1}
                      onClick={() =>
                        setLbSlides((prev) => {
                          const next = [...prev];
                          const current = next[idx]!;
                          next[idx] = next[idx + 1]!;
                          next[idx + 1] = current;
                          return next;
                        })
                      }
                    >
                      Down
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={lbSlides.length <= 1}
                      onClick={() =>
                        setLbSlides((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField id={`slide-title-${idx}`} label="Slide Title" required>
                    <Input
                      id={`slide-title-${idx}`}
                      value={slide.title}
                      onChange={(e) =>
                        setLbSlides((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, title: e.target.value } : s)),
                        )
                      }
                    />
                  </FormField>
                  <FormField id={`slide-img-${idx}`} label="Image URL" required>
                    <Input
                      id={`slide-img-${idx}`}
                      value={slide.imageUrl}
                      placeholder="/images/lookbook-01.jpg"
                      onChange={(e) =>
                        setLbSlides((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, imageUrl: e.target.value } : s)),
                        )
                      }
                    />
                  </FormField>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField id={`slide-alt-${idx}`} label="Alt Text (Required)" required>
                    <Input
                      id={`slide-alt-${idx}`}
                      value={slide.altText}
                      placeholder="Tailored charcoal wool overcoat on editorial plinth"
                      onChange={(e) =>
                        setLbSlides((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, altText: e.target.value } : s)),
                        )
                      }
                    />
                  </FormField>
                  <FormField id={`slide-product-${idx}`} label="Featured Product Slug (Optional)">
                    <Input
                      id={`slide-product-${idx}`}
                      value={slide.productSlug}
                      placeholder="architectural-wool-coat"
                      className="font-mono"
                      onChange={(e) =>
                        setLbSlides((prev) =>
                          prev.map((s, i) =>
                            i === idx ? { ...s, productSlug: e.target.value } : s,
                          ),
                        )
                      }
                    />
                  </FormField>
                </div>

                <FormField id={`slide-caption-${idx}`} label="Editorial Caption (Optional)">
                  <Textarea
                    id={`slide-caption-${idx}`}
                    rows={2}
                    value={slide.caption}
                    onChange={(e) =>
                      setLbSlides((prev) =>
                        prev.map((s, i) => (i === idx ? { ...s, caption: e.target.value } : s)),
                      )
                    }
                  />
                </FormField>
              </div>
            ))}
          </div>
        </form>
      </Modal>

      {/* Journal Editor Modal */}
      <Modal
        isOpen={journalModalOpen}
        onClose={() => setJournalModalOpen(false)}
        title={
          editingJournal ? `Edit Article: ${editingJournal.title}` : 'New Journal Article'
        }
        description="Author structured editorial journal sections with lead excerpt and cover imagery."
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setJournalModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="cms-journal-form"
              variant="primary"
              isLoading={saving}
              loadingLabel="Saving..."
            >
              Save Article
            </Button>
          </>
        }
      >
        <form id="cms-journal-form" onSubmit={handleSaveJournal} noValidate className="space-y-4">
          {modalError ? <StatusBanner tone="danger" description={modalError} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="jn-title" label="Article Title" error={fieldErrors['title']} required>
              <Input
                id="jn-title"
                value={jnTitle}
                onChange={(e) => {
                  setJnTitle(e.target.value);
                  if (!editingJournal && !jnSlug) setJnSlug(slugifyTitle(e.target.value));
                }}
                invalid={Boolean(fieldErrors['title'])}
              />
            </FormField>
            <FormField id="jn-slug" label="Slug" error={fieldErrors['slug']} required>
              <Input
                id="jn-slug"
                value={jnSlug}
                onChange={(e) => setJnSlug(e.target.value)}
                invalid={Boolean(fieldErrors['slug'])}
                className="font-mono"
              />
            </FormField>
          </div>
          <FormField id="jn-cover" label="Cover Image URL (Optional)" error={fieldErrors['coverMediaUrl']}>
            <Input
              id="jn-cover"
              value={jnCoverMediaUrl}
              onChange={(e) => setJnCoverMediaUrl(e.target.value)}
              placeholder="/images/journal-cover.jpg"
            />
          </FormField>
          <FormField id="jn-excerpt" label="Excerpt" error={fieldErrors['excerpt']} required>
            <Textarea
              id="jn-excerpt"
              rows={2}
              value={jnExcerpt}
              onChange={(e) => setJnExcerpt(e.target.value)}
              invalid={Boolean(fieldErrors['excerpt'])}
            />
          </FormField>

          <div className="space-y-3 border-t border-hairline pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                Article Sections ({jnSections.length})
              </h3>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setJnSections((prev) => [...prev, { heading: '', body: '' }])}
              >
                Add Section
              </Button>
            </div>
            {jnSections.map((sec, idx) => (
              <div
                key={idx}
                className="space-y-3 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-ink">Section {idx + 1}</span>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={jnSections.length <= 1}
                    onClick={() =>
                      setJnSections((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    Remove
                  </Button>
                </div>
                <FormField id={`jn-sec-head-${idx}`} label="Section Heading (Optional)">
                  <Input
                    id={`jn-sec-head-${idx}`}
                    value={sec.heading}
                    onChange={(e) =>
                      setJnSections((prev) =>
                        prev.map((s, i) => (i === idx ? { ...s, heading: e.target.value } : s)),
                      )
                    }
                  />
                </FormField>
                <FormField id={`jn-sec-body-${idx}`} label="Paragraph Copy" required>
                  <Textarea
                    id={`jn-sec-body-${idx}`}
                    rows={3}
                    value={sec.body}
                    onChange={(e) =>
                      setJnSections((prev) =>
                        prev.map((s, i) => (i === idx ? { ...s, body: e.target.value } : s)),
                      )
                    }
                  />
                </FormField>
              </div>
            ))}
          </div>
        </form>
      </Modal>

      {/* Page Editor Modal */}
      <Modal
        isOpen={pageModalOpen}
        onClose={() => setPageModalOpen(false)}
        title={editingPage ? `Edit Page: ${editingPage.title}` : 'New CMS Page'}
        description="Build structured storefront CMS pages (such as about) with hero, editorial text, and callout blocks."
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setPageModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="cms-page-form"
              variant="primary"
              isLoading={saving}
              loadingLabel="Saving..."
            >
              Save Page
            </Button>
          </>
        }
      >
        <form id="cms-page-form" onSubmit={handleSavePage} noValidate className="space-y-4">
          {modalError ? <StatusBanner tone="danger" description={modalError} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="pg-title" label="Page Title" error={fieldErrors['title']} required>
              <Input
                id="pg-title"
                value={pgTitle}
                onChange={(e) => {
                  setPgTitle(e.target.value);
                  if (!editingPage && !pgSlug) setPgSlug(slugifyTitle(e.target.value));
                }}
                invalid={Boolean(fieldErrors['title'])}
              />
            </FormField>
            <FormField id="pg-slug" label="Slug" error={fieldErrors['slug']} required>
              <Input
                id="pg-slug"
                value={pgSlug}
                onChange={(e) => setPgSlug(e.target.value)}
                invalid={Boolean(fieldErrors['slug'])}
                placeholder="about"
                className="font-mono"
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="pg-seo-title" label="SEO Title">
              <Input
                id="pg-seo-title"
                value={pgSeoTitle}
                onChange={(e) => setPgSeoTitle(e.target.value)}
              />
            </FormField>
            <FormField id="pg-seo-desc" label="SEO Description">
              <Input
                id="pg-seo-desc"
                value={pgSeoDescription}
                onChange={(e) => setPgSeoDescription(e.target.value)}
              />
            </FormField>
          </div>

          <div className="space-y-3 border-t border-hairline pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                Content Blocks ({pgBlocks.length})
              </h3>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setPgBlocks((prev) => [
                    ...prev,
                    {
                      type: 'editorial_text',
                      heading: '',
                      subheading: '',
                      body: '',
                      imageUrl: '',
                      altText: '',
                      ctaLabel: '',
                      ctaHref: '',
                    },
                  ])
                }
              >
                Add Block
              </Button>
            </div>
            {pgBlocks.map((blk, idx) => (
              <div
                key={idx}
                className="space-y-3 rounded-[var(--radius-sm)] border border-hairline bg-subtle p-3.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-ink">Block {idx + 1}</span>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={pgBlocks.length <= 1}
                    onClick={() =>
                      setPgBlocks((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    Remove
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField id={`pg-blk-type-${idx}`} label="Block Type">
                    <Select
                      id={`pg-blk-type-${idx}`}
                      value={blk.type}
                      onChange={(e) =>
                        setPgBlocks((prev) =>
                          prev.map((b, i) => (i === idx ? { ...b, type: e.target.value } : b)),
                        )
                      }
                    >
                      <option value="hero">hero</option>
                      <option value="editorial_text">editorial_text</option>
                      <option value="callout">callout</option>
                    </Select>
                  </FormField>
                  <FormField id={`pg-blk-head-${idx}`} label="Heading">
                    <Input
                      id={`pg-blk-head-${idx}`}
                      value={blk.heading}
                      onChange={(e) =>
                        setPgBlocks((prev) =>
                          prev.map((b, i) => (i === idx ? { ...b, heading: e.target.value } : b)),
                        )
                      }
                    />
                  </FormField>
                </div>
                <FormField id={`pg-blk-body-${idx}`} label="Body Copy">
                  <Textarea
                    id={`pg-blk-body-${idx}`}
                    rows={3}
                    value={blk.body}
                    onChange={(e) =>
                      setPgBlocks((prev) =>
                        prev.map((b, i) => (i === idx ? { ...b, body: e.target.value } : b)),
                      )
                    }
                  />
                </FormField>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField id={`pg-blk-cta-label-${idx}`} label="CTA Label (Optional)">
                    <Input
                      id={`pg-blk-cta-label-${idx}`}
                      value={blk.ctaLabel}
                      onChange={(e) =>
                        setPgBlocks((prev) =>
                          prev.map((b, i) =>
                            i === idx ? { ...b, ctaLabel: e.target.value } : b,
                          ),
                        )
                      }
                    />
                  </FormField>
                  <FormField id={`pg-blk-cta-href-${idx}`} label="CTA Href (Optional)">
                    <Input
                      id={`pg-blk-cta-href-${idx}`}
                      value={blk.ctaHref}
                      placeholder="/shop"
                      onChange={(e) =>
                        setPgBlocks((prev) =>
                          prev.map((b, i) => (i === idx ? { ...b, ctaHref: e.target.value } : b)),
                        )
                      }
                    />
                  </FormField>
                </div>
              </div>
            ))}
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}
