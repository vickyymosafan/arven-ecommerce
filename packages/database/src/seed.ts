import argon2 from 'argon2';
import {
  AUTH_POLICY,
  PERMISSION_CODES,
  PERMISSION_DESCRIPTIONS,
  ROLE_CODES,
  ROLE_PERMISSION_MATRIX,
  type RoleCode,
} from '@arven/config';
import {
  CollectionStatus,
  InventoryMovementType,
  MediaType,
  ProductStatus,
  UserStatus,
  WarehouseStatus,
  type Prisma,
  type PrismaClient,
} from './generated/prisma/client.js';
import { withTransaction, type PrismaTransactionClient } from './client.js';

export interface RoleSeedDefinition {
  readonly code: RoleCode;
  readonly name: string;
  readonly description: string;
}

export interface SizeGuideSeedData {
  readonly unit: 'cm' | 'mm' | 'eu';
  readonly notes?: string;
  readonly columns: readonly string[];
  readonly rows: ReadonlyArray<Readonly<Record<string, string>>>;
}

export interface CategorySeedDefinition {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly sortOrder: number;
  readonly sizeGuideJson: SizeGuideSeedData;
}

export interface CollectionSeedDefinition {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly startsAt: string;
  readonly bannerUrl: string;
}

export interface ProductVariantSeedDefinition {
  readonly sku: string;
  readonly size: string;
  readonly color: string;
  readonly colorHex: string;
  readonly priceIdr: bigint;
  readonly compareAtPriceIdr?: bigint | null;
  readonly weightGrams: number;
  readonly lengthCm?: number;
  readonly widthCm?: number;
  readonly heightCm?: number;
  readonly initialStock: number;
  readonly lowStockThreshold?: number;
}

export interface ProductMediaSeedDefinition {
  readonly objectKey: string;
  readonly type: MediaType;
  readonly url: string;
  readonly altText: string;
  readonly position: number;
  readonly width: number;
  readonly height: number;
  readonly isPrimary: boolean;
}

export interface ProductSeedDefinition {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly material: string;
  readonly fit: string;
  readonly careInstruction: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly sizeGuideOverride?: SizeGuideSeedData | null;
  readonly categorySlug: string;
  readonly collectionSlug: string;
  readonly isFeatured: boolean;
  readonly sku: string;
  readonly size: string;
  readonly color: string;
  readonly colorHex: string;
  readonly priceIdr: bigint;
  readonly compareAtPriceIdr?: bigint | null;
  readonly weightGrams: number;
  readonly initialStock: number;
  readonly lowStockThreshold?: number;
  readonly additionalVariants: readonly ProductVariantSeedDefinition[];
  readonly media: readonly ProductMediaSeedDefinition[];
}

export interface SeedDatabaseOptions {
  readonly nodeEnv?: string;
  readonly seedDevUsers?: boolean;
  readonly devUserPassword?: string;
}

export interface SeedDatabaseResult {
  readonly rolesUpserted: number;
  readonly permissionsUpserted: number;
  readonly rolePermissionsAssigned: number;
  readonly warehouseCode: string;
  readonly categoriesUpserted: number;
  readonly collectionsUpserted: number;
  readonly productsUpserted: number;
  readonly variantsUpserted: number;
  readonly mediaUpserted: number;
  readonly inventoryLevelsCreated: number;
  readonly devUsersSeeded: number;
}

function toSvgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildCollectionBannerSvg(opts: {
  readonly title: string;
  readonly subtitle: string;
  readonly bgHex: string;
  readonly surfaceHex: string;
  readonly accentHex: string;
  readonly textHex: string;
}): string {
  const safeTitle = escapeXml(opts.title);
  const safeSubtitle = escapeXml(opts.subtitle);
  return toSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 640" width="1600" height="640" role="img" aria-label="${safeTitle}">
  <rect width="1600" height="640" fill="${opts.bgHex}" />
  <g stroke="${opts.surfaceHex}" stroke-width="1" opacity="0.55">
    <line x1="200" y1="0" x2="200" y2="640" />
    <line x1="800" y1="0" x2="800" y2="640" />
    <line x1="1400" y1="0" x2="1400" y2="640" />
    <line x1="0" y1="140" x2="1600" y2="140" />
    <line x1="0" y1="500" x2="1600" y2="500" />
  </g>
  <rect x="200" y="140" width="1200" height="360" fill="none" stroke="${opts.accentHex}" stroke-width="1.5" opacity="0.6" />
  <circle cx="1220" cy="320" r="140" fill="none" stroke="${opts.accentHex}" stroke-width="1.5" opacity="0.45" />
  <rect x="1120" y="220" width="200" height="200" fill="none" stroke="${opts.textHex}" stroke-width="1" opacity="0.3" />
  <text x="260" y="230" fill="${opts.accentHex}" font-family="sans-serif" font-size="16" letter-spacing="6">ARVEN ARCHIVE SERIES</text>
  <text x="260" y="330" fill="${opts.textHex}" font-family="serif" font-size="68" letter-spacing="2">${safeTitle}</text>
  <text x="260" y="395" fill="${opts.textHex}" opacity="0.78" font-family="sans-serif" font-size="22" letter-spacing="1">${safeSubtitle}</text>
</svg>`);
}

function buildProductEditorialSvg(opts: {
  readonly code: string;
  readonly title: string;
  readonly viewLabel: string;
  readonly specNote: string;
  readonly bgHex: string;
  readonly panelHex: string;
  readonly primaryHex: string;
  readonly accentHex: string;
  readonly textHex: string;
  readonly mode: 'silhouette' | 'detail' | 'swatch';
}): string {
  const safeCode = escapeXml(opts.code);
  const safeTitle = escapeXml(opts.title);
  const safeViewLabel = escapeXml(opts.viewLabel);
  const safeSpecNote = escapeXml(opts.specNote);

  const centerGraphic =
    opts.mode === 'silhouette'
      ? `
    <g transform="translate(220, 260)">
      <path d="M130,40 L210,10 L250,10 L330,40 L410,160 L345,205 L310,140 L310,560 L150,560 L150,140 L115,205 L50,160 Z" fill="${opts.primaryHex}" stroke="${opts.accentHex}" stroke-width="2" />
      <line x1="230" y1="10" x2="230" y2="560" stroke="${opts.accentHex}" stroke-width="1" stroke-dasharray="6 6" opacity="0.65" />
      <rect x="165" y="190" width="55" height="68" fill="none" stroke="${opts.accentHex}" stroke-width="1.2" opacity="0.8" />
    </g>`
      : opts.mode === 'detail'
        ? `
    <g transform="translate(170, 250)">
      <rect x="40" y="40" width="480" height="520" fill="${opts.panelHex}" stroke="${opts.accentHex}" stroke-width="1.5" />
      <line x1="40" y1="180" x2="520" y2="180" stroke="${opts.primaryHex}" stroke-width="3" />
      <line x1="40" y1="196" x2="520" y2="196" stroke="${opts.accentHex}" stroke-width="1" stroke-dasharray="5 5" />
      <line x1="280" y1="40" x2="280" y2="560" stroke="${opts.primaryHex}" stroke-width="2" />
      <circle cx="250" cy="280" r="14" fill="${opts.primaryHex}" stroke="${opts.accentHex}" stroke-width="2" />
      <circle cx="250" cy="400" r="14" fill="${opts.primaryHex}" stroke="${opts.accentHex}" stroke-width="2" />
    </g>`
        : `
    <g transform="translate(170, 250)">
      <rect x="40" y="40" width="480" height="520" fill="${opts.primaryHex}" stroke="${opts.accentHex}" stroke-width="2" />
      <g stroke="${opts.accentHex}" stroke-width="1" opacity="0.38">
        <line x1="40" y1="120" x2="520" y2="120" />
        <line x1="40" y1="200" x2="520" y2="200" />
        <line x1="40" y1="280" x2="520" y2="280" />
        <line x1="40" y1="360" x2="520" y2="360" />
        <line x1="40" y1="440" x2="520" y2="440" />
        <line x1="120" y1="40" x2="120" y2="560" />
        <line x1="200" y1="40" x2="200" y2="560" />
        <line x1="280" y1="40" x2="280" y2="560" />
        <line x1="360" y1="40" x2="360" y2="560" />
        <line x1="440" y1="40" x2="440" y2="560" />
      </g>
      <rect x="90" y="410" width="380" height="100" fill="${opts.bgHex}" opacity="0.92" />
      <text x="115" y="452" fill="${opts.textHex}" font-family="sans-serif" font-size="16" letter-spacing="3">MATERIAL SPECIMEN</text>
      <text x="115" y="484" fill="${opts.textHex}" opacity="0.8" font-family="monospace" font-size="14">${safeSpecNote}</text>
    </g>`;

  return toSvgDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200" width="900" height="1200" role="img" aria-label="${safeTitle} - ${safeViewLabel}">
  <rect width="900" height="1200" fill="${opts.bgHex}" />
  <rect x="56" y="56" width="788" height="1088" fill="${opts.panelHex}" stroke="${opts.accentHex}" stroke-width="1.2" opacity="0.95" />
  <line x1="56" y1="168" x2="844" y2="168" stroke="${opts.accentHex}" stroke-width="0.8" opacity="0.5" />
  <line x1="56" y1="980" x2="844" y2="980" stroke="${opts.accentHex}" stroke-width="0.8" opacity="0.5" />
  <text x="96" y="112" fill="${opts.textHex}" font-family="sans-serif" font-size="14" letter-spacing="5">ARVEN STUDIO ARCHIVE // ${safeCode}</text>
  <text x="96" y="142" fill="${opts.accentHex}" font-family="monospace" font-size="13" letter-spacing="2">${safeViewLabel}</text>
  ${centerGraphic}
  <text x="96" y="1038" fill="${opts.textHex}" font-family="serif" font-size="30" letter-spacing="1">${safeTitle}</text>
  <text x="96" y="1076" fill="${opts.textHex}" opacity="0.75" font-family="sans-serif" font-size="16" letter-spacing="1">${safeSpecNote}</text>
  <text x="96" y="1112" fill="${opts.accentHex}" font-family="monospace" font-size="12" letter-spacing="3">BEYOND TRENDS. BEYOND TIME.</text>
</svg>`);
}

function buildProductSeedMedia(opts: {
  readonly slug: string;
  readonly sku: string;
  readonly name: string;
  readonly material: string;
  readonly fit: string;
  readonly primaryHex: string;
  readonly lightBackdrop?: boolean;
}): readonly ProductMediaSeedDefinition[] {
  const bgHex = opts.lightBackdrop ? '#F8F7F3' : '#E9E4DA';
  const panelHex = opts.lightBackdrop ? '#E9E4DA' : '#F8F7F3';
  const textHex = '#17191B';
  const accentHex = '#C5A572';

  return [
    {
      objectKey: `seed/products/${opts.slug}/01-primary.svg`,
      type: MediaType.IMAGE,
      url: buildProductEditorialSvg({
        code: opts.sku,
        title: opts.name,
        viewLabel: '01 / ARCHITECTURAL SILHOUETTE',
        specNote: `${opts.fit} - Primary Editorial View`,
        bgHex,
        panelHex,
        primaryHex: opts.primaryHex,
        accentHex,
        textHex,
        mode: 'silhouette',
      }),
      altText: `${opts.name} front studio silhouette in primary colorway`,
      position: 0,
      width: 900,
      height: 1200,
      isPrimary: true,
    },
    {
      objectKey: `seed/products/${opts.slug}/02-detail.svg`,
      type: MediaType.IMAGE,
      url: buildProductEditorialSvg({
        code: opts.sku,
        title: opts.name,
        viewLabel: '02 / SEAM & HARDWARE CONSTRUCTION',
        specNote: `Tailored seam allowance and tonal finishing`,
        bgHex: '#17191B',
        panelHex: '#35383A',
        primaryHex: opts.primaryHex,
        accentHex: '#C5A572',
        textHex: '#F8F7F3',
        mode: 'detail',
      }),
      altText: `${opts.name} close-up construction and seam detail studio view`,
      position: 1,
      width: 900,
      height: 1200,
      isPrimary: false,
    },
    {
      objectKey: `seed/products/${opts.slug}/03-swatch.svg`,
      type: MediaType.SWATCH,
      url: buildProductEditorialSvg({
        code: opts.sku,
        title: opts.name,
        viewLabel: '03 / TEXTILE WEAVE & GRAIN SPECIMEN',
        specNote: opts.material,
        bgHex,
        panelHex,
        primaryHex: opts.primaryHex,
        accentHex: '#5E5C54',
        textHex,
        mode: 'swatch',
      }),
      altText: `${opts.name} material swatch highlighting ${opts.material}`,
      position: 2,
      width: 900,
      height: 1200,
      isPrimary: false,
    },
  ];
}

export const ARVEN_ROLE_DEFINITIONS: Readonly<Record<RoleCode, RoleSeedDefinition>> = {
  OWNER: {
    code: 'OWNER',
    name: 'Owner',
    description:
      'Unrestricted platform owner with authority over roles, refund approvals, and payment providers',
  },
  MANAGER: {
    code: 'MANAGER',
    name: 'Manager',
    description: 'Full operational administration except Owner-exclusive security controls',
  },
  PRODUCT: {
    code: 'PRODUCT',
    name: 'Product Manager',
    description: 'Manages catalog products, variants, categories, collections, coupons, and 3D assets',
  },
  INVENTORY: {
    code: 'INVENTORY',
    name: 'Inventory Manager',
    description: 'Manages warehouses, stock levels, inventory adjustments, and stock receipts',
  },
  ORDER: {
    code: 'ORDER',
    name: 'Order Operations',
    description: 'Manages order fulfillment, shipments, return inspections, and refund requests',
  },
  CONTENT: {
    code: 'CONTENT',
    name: 'Content Editor',
    description: 'Publishes editorial pages, journal articles, lookbooks, and media assets',
  },
  SUPPORT: {
    code: 'SUPPORT',
    name: 'Support Agent',
    description: 'Handles customer inquiries, return triage, order visibility, and review moderation',
  },
  CUSTOMER: {
    code: 'CUSTOMER',
    name: 'Customer',
    description: 'Registered storefront customer account',
  },
};

export const ARVEN_SEED_WAREHOUSE = {
  code: 'JKT-MAIN-01',
  name: 'Jakarta Main Fulfillment Center',
  city: 'Jakarta Selatan',
  province: 'DKI Jakarta',
  postalCode: '12190',
} as const;

export const ARVEN_SEED_CATEGORIES: readonly CategorySeedDefinition[] = [
  {
    slug: 'tops',
    name: 'Tops',
    description: 'Structured jersey essentials and tailored woven shirting.',
    sortOrder: 1,
    sizeGuideJson: {
      unit: 'cm',
      notes: 'Garments are measured flat across chest, shoulder, and center back length.',
      columns: ['Size', 'Chest', 'Body Length', 'Shoulder Width'],
      rows: [
        { Size: 'S', Chest: '112', 'Body Length': '69', 'Shoulder Width': '50' },
        { Size: 'M', Chest: '118', 'Body Length': '71', 'Shoulder Width': '52' },
        { Size: 'L', Chest: '124', 'Body Length': '73', 'Shoulder Width': '54' },
        { Size: 'XL', Chest: '130', 'Body Length': '75', 'Shoulder Width': '56' },
      ],
    },
  },
  {
    slug: 'bottoms',
    name: 'Bottoms',
    description: 'Architectural trousers engineered for drape and longevity.',
    sortOrder: 2,
    sizeGuideJson: {
      unit: 'cm',
      notes: 'Waistband measured flat and doubled; inseam measured from crotch seam to hem.',
      columns: ['Size', 'Waist', 'Front Rise', 'Inseam', 'Hem Width'],
      rows: [
        { Size: '28', Waist: '74', 'Front Rise': '31', Inseam: '76', 'Hem Width': '23' },
        { Size: '30', Waist: '79', 'Front Rise': '32', Inseam: '77', 'Hem Width': '24' },
        { Size: '32', Waist: '84', 'Front Rise': '33', Inseam: '78', 'Hem Width': '25' },
        { Size: '34', Waist: '89', 'Front Rise': '34', Inseam: '79', 'Hem Width': '26' },
      ],
    },
  },
  {
    slug: 'outerwear',
    name: 'Outerwear',
    description: 'Relaxed coats and boxy overshirts in heavyweight natural fibers.',
    sortOrder: 3,
    sizeGuideJson: {
      unit: 'cm',
      notes: 'Cut with generous room to layer comfortably over mid-weight knitwear.',
      columns: ['Size', 'Chest', 'Center Back Length', 'Sleeve Length'],
      rows: [
        { Size: 'S', Chest: '118', 'Center Back Length': '70', 'Sleeve Length': '61' },
        { Size: 'M', Chest: '124', 'Center Back Length': '72', 'Sleeve Length': '62.5' },
        { Size: 'L', Chest: '130', 'Center Back Length': '74', 'Sleeve Length': '64' },
        { Size: 'XL', Chest: '136', 'Center Back Length': '76', 'Sleeve Length': '65.5' },
      ],
    },
  },
  {
    slug: 'footwear',
    name: 'Footwear',
    description: 'Minimalist leather silhouettes crafted for everyday movement.',
    sortOrder: 4,
    sizeGuideJson: {
      unit: 'cm',
      notes: 'True to European last sizing. Between sizes, select the next full size up.',
      columns: ['Size', 'Foot Length (cm)', 'UK Equivalent', 'US Equivalent'],
      rows: [
        { Size: '39', 'Foot Length (cm)': '25.0', 'UK Equivalent': '6', 'US Equivalent': '7' },
        { Size: '40', 'Foot Length (cm)': '25.7', 'UK Equivalent': '6.5', 'US Equivalent': '7.5' },
        { Size: '41', 'Foot Length (cm)': '26.3', 'UK Equivalent': '7.5', 'US Equivalent': '8.5' },
        { Size: '42', 'Foot Length (cm)': '27.0', 'UK Equivalent': '8', 'US Equivalent': '9' },
        { Size: '43', 'Foot Length (cm)': '27.7', 'UK Equivalent': '9', 'US Equivalent': '10' },
        { Size: '44', 'Foot Length (cm)': '28.3', 'UK Equivalent': '9.5', 'US Equivalent': '10.5' },
      ],
    },
  },
  {
    slug: 'accessories',
    name: 'Accessories',
    description: 'Structured leather carry goods and refined finishing pieces.',
    sortOrder: 5,
    sizeGuideJson: {
      unit: 'cm',
      notes: 'External dimensions measured across base width, body height, and gusset depth.',
      columns: ['Size', 'Width', 'Height', 'Depth', 'Strap Drop'],
      rows: [
        { Size: 'ONE_SIZE', Width: '24', Height: '17', Depth: '8', 'Strap Drop': '45 - 58' },
      ],
    },
  },
];

export const ARVEN_SEED_COLLECTIONS: readonly CollectionSeedDefinition[] = [
  {
    slug: 'essentials',
    name: 'Essentials',
    description: 'Foundational daily uniforms built with disciplined proportions.',
    startsAt: '2026-01-01T00:00:00.000Z',
    bannerUrl: buildCollectionBannerSvg({
      title: 'ESSENTIALS',
      subtitle: 'Foundational daily uniforms built with disciplined proportions.',
      bgHex: '#17191B',
      surfaceHex: '#35383A',
      accentHex: '#C5A572',
      textHex: '#F8F7F3',
    }),
  },
  {
    slug: 'form',
    name: 'Form',
    description: 'Clean tailoring and structured silhouettes for sharp versatility.',
    startsAt: '2026-01-15T00:00:00.000Z',
    bannerUrl: buildCollectionBannerSvg({
      title: 'FORM',
      subtitle: 'Clean tailoring and structured silhouettes for sharp versatility.',
      bgHex: '#E9E4DA',
      surfaceHex: '#C5A572',
      accentHex: '#5E5C54',
      textHex: '#17191B',
    }),
  },
  {
    slug: 'atelier',
    name: 'Atelier',
    description: 'Elevated seasonal craft highlighting tactile wool and crisp poplin.',
    startsAt: '2026-02-01T00:00:00.000Z',
    bannerUrl: buildCollectionBannerSvg({
      title: 'ATELIER',
      subtitle: 'Elevated seasonal craft highlighting tactile wool and crisp poplin.',
      bgHex: '#35383A',
      surfaceHex: '#5E5C54',
      accentHex: '#C5A572',
      textHex: '#F8F7F3',
    }),
  },
  {
    slug: 'movement',
    name: 'Movement',
    description: 'Functional refinement designed to transition seamlessly through the city.',
    startsAt: '2026-02-15T00:00:00.000Z',
    bannerUrl: buildCollectionBannerSvg({
      title: 'MOVEMENT',
      subtitle: 'Functional refinement designed to transition seamlessly through the city.',
      bgHex: '#F8F7F3',
      surfaceHex: '#E9E4DA',
      accentHex: '#C5A572',
      textHex: '#17191B',
    }),
  },
];

export const ARVEN_SEED_PRODUCTS: readonly ProductSeedDefinition[] = [
  {
    slug: 'essentials-heavyweight-crew-tee',
    name: 'Essentials Heavyweight Crew Tee',
    description: 'Dense combed cotton jersey tee with a clean ribbed collar and relaxed drop shoulder.',
    material: '100% Combed Organic Cotton (280 gsm)',
    fit: 'Relaxed Fit',
    careInstruction: 'Machine wash cold inside out. Lay flat to dry. Do not tumble dry.',
    seoTitle: 'Essentials Heavyweight Crew Tee | ARVEN Contemporary Apparel',
    seoDescription:
      '280 gsm organic combed cotton crew neck tee engineered with a relaxed drop shoulder and durable rib-knit collar.',
    sizeGuideOverride: {
      unit: 'cm',
      notes: 'Custom boxy jersey block for the 280 gsm Heavyweight Tee.',
      columns: ['Size', 'Chest', 'Body Length', 'Shoulder Width', 'Sleeve Length'],
      rows: [
        { Size: 'S', Chest: '114', 'Body Length': '68', 'Shoulder Width': '52', 'Sleeve Length': '22' },
        { Size: 'M', Chest: '120', 'Body Length': '70', 'Shoulder Width': '54', 'Sleeve Length': '23' },
        { Size: 'L', Chest: '126', 'Body Length': '72', 'Shoulder Width': '56', 'Sleeve Length': '24' },
        { Size: 'XL', Chest: '132', 'Body Length': '74', 'Shoulder Width': '58', 'Sleeve Length': '25' },
      ],
    },
    categorySlug: 'tops',
    collectionSlug: 'essentials',
    isFeatured: true,
    sku: 'ARV-TOP-001',
    size: 'M',
    color: 'Charcoal',
    colorHex: '#17191B',
    priceIdr: 299_000n,
    compareAtPriceIdr: 349_000n,
    weightGrams: 320,
    initialStock: 25,
    additionalVariants: [
      {
        sku: 'ARV-TOP-001-S-CHR',
        size: 'S',
        color: 'Charcoal',
        colorHex: '#17191B',
        priceIdr: 299_000n,
        compareAtPriceIdr: 349_000n,
        weightGrams: 310,
        initialStock: 15,
      },
      {
        sku: 'ARV-TOP-001-L-CHR',
        size: 'L',
        color: 'Charcoal',
        colorHex: '#17191B',
        priceIdr: 299_000n,
        compareAtPriceIdr: 349_000n,
        weightGrams: 335,
        initialStock: 18,
      },
      {
        sku: 'ARV-TOP-001-XL-CHR',
        size: 'XL',
        color: 'Charcoal',
        colorHex: '#17191B',
        priceIdr: 299_000n,
        compareAtPriceIdr: 349_000n,
        weightGrams: 350,
        initialStock: 3,
        lowStockThreshold: 5,
      },
      {
        sku: 'ARV-TOP-001-M-IVR',
        size: 'M',
        color: 'Ivory',
        colorHex: '#F8F7F3',
        priceIdr: 299_000n,
        compareAtPriceIdr: 349_000n,
        weightGrams: 320,
        initialStock: 20,
      },
      {
        sku: 'ARV-TOP-001-L-IVR',
        size: 'L',
        color: 'Ivory',
        colorHex: '#F8F7F3',
        priceIdr: 299_000n,
        compareAtPriceIdr: 349_000n,
        weightGrams: 335,
        initialStock: 12,
      },
    ],
    media: buildProductSeedMedia({
      slug: 'essentials-heavyweight-crew-tee',
      sku: 'ARV-TOP-001',
      name: 'Essentials Heavyweight Crew Tee',
      material: '100% Combed Organic Cotton (280 gsm)',
      fit: 'Relaxed Fit',
      primaryHex: '#17191B',
    }),
  },
  {
    slug: 'atelier-oversized-poplin-shirt',
    name: 'Atelier Oversized Poplin Shirt',
    description: 'Crisp high-twist cotton poplin overshirt featuring concealed placket buttons and dropped hem.',
    material: '100% Long-Staple Cotton Poplin',
    fit: 'Oversized Fit',
    careInstruction: 'Gentle cold wash or dry clean. Steam on low heat.',
    seoTitle: 'Atelier Oversized Poplin Shirt | ARVEN Tailored Shirting',
    seoDescription:
      'Long-staple high-twist cotton poplin shirt with concealed placket architecture and relaxed editorial drape.',
    categorySlug: 'tops',
    collectionSlug: 'atelier',
    isFeatured: true,
    sku: 'ARV-TOP-002',
    size: 'L',
    color: 'Ivory',
    colorHex: '#F8F7F3',
    priceIdr: 499_000n,
    weightGrams: 380,
    initialStock: 18,
    additionalVariants: [
      {
        sku: 'ARV-TOP-002-S-IVR',
        size: 'S',
        color: 'Ivory',
        colorHex: '#F8F7F3',
        priceIdr: 499_000n,
        weightGrams: 360,
        initialStock: 10,
      },
      {
        sku: 'ARV-TOP-002-M-IVR',
        size: 'M',
        color: 'Ivory',
        colorHex: '#F8F7F3',
        priceIdr: 499_000n,
        weightGrams: 370,
        initialStock: 14,
      },
      {
        sku: 'ARV-TOP-002-M-CHR',
        size: 'M',
        color: 'Charcoal',
        colorHex: '#17191B',
        priceIdr: 499_000n,
        weightGrams: 370,
        initialStock: 4,
        lowStockThreshold: 5,
      },
    ],
    media: buildProductSeedMedia({
      slug: 'atelier-oversized-poplin-shirt',
      sku: 'ARV-TOP-002',
      name: 'Atelier Oversized Poplin Shirt',
      material: '100% Long-Staple Cotton Poplin',
      fit: 'Oversized Fit',
      primaryHex: '#E9E4DA',
      lightBackdrop: true,
    }),
  },
  {
    slug: 'form-wide-leg-tailored-trouser',
    name: 'Form Wide-Leg Tailored Trouser',
    description: 'Double-pleated wide-leg trouser with extended waistband tab and clean pressed crease.',
    material: '68% Wool Blend, 30% Recycled Polyester, 2% Elastane',
    fit: 'Wide Tailored Fit',
    careInstruction: 'Dry clean only. Press with damp cloth on low setting.',
    seoTitle: 'Form Wide-Leg Tailored Trouser | ARVEN Architectural Bottoms',
    seoDescription:
      'Double-pleated tailored wool-blend trouser with extended tab closure and fluid full-length leg.',
    categorySlug: 'bottoms',
    collectionSlug: 'form',
    isFeatured: false,
    sku: 'ARV-BOT-001',
    size: '32',
    color: 'Graphite',
    colorHex: '#35383A',
    priceIdr: 649_000n,
    compareAtPriceIdr: 749_000n,
    weightGrams: 540,
    initialStock: 15,
    additionalVariants: [
      {
        sku: 'ARV-BOT-001-30-GRP',
        size: '30',
        color: 'Graphite',
        colorHex: '#35383A',
        priceIdr: 649_000n,
        compareAtPriceIdr: 749_000n,
        weightGrams: 520,
        initialStock: 12,
      },
      {
        sku: 'ARV-BOT-001-34-GRP',
        size: '34',
        color: 'Graphite',
        colorHex: '#35383A',
        priceIdr: 649_000n,
        compareAtPriceIdr: 749_000n,
        weightGrams: 560,
        initialStock: 9,
      },
      {
        sku: 'ARV-BOT-001-32-STN',
        size: '32',
        color: 'Deep Stone',
        colorHex: '#5E5C54',
        priceIdr: 649_000n,
        compareAtPriceIdr: 749_000n,
        weightGrams: 540,
        initialStock: 11,
      },
    ],
    media: buildProductSeedMedia({
      slug: 'form-wide-leg-tailored-trouser',
      sku: 'ARV-BOT-001',
      name: 'Form Wide-Leg Tailored Trouser',
      material: '68% Wool Blend, 30% Recycled Polyester, 2% Elastane',
      fit: 'Wide Tailored Fit',
      primaryHex: '#35383A',
    }),
  },
  {
    slug: 'atelier-boxy-wool-overshirt',
    name: 'Atelier Boxy Wool Overshirt',
    description: 'Unlined double-faced wool overshirt with welt chest pockets and matte horn hardware.',
    material: '80% Virgin Wool, 20% Polyamide',
    fit: 'Boxy Cropped Fit',
    careInstruction: 'Specialist dry clean only. Brush gently with soft garment brush.',
    seoTitle: 'Atelier Boxy Wool Overshirt | ARVEN Contemporary Outerwear',
    seoDescription:
      'Double-faced virgin wool overshirt crafted with clean welt pockets, horn buttons, and architectural boxy proportions.',
    categorySlug: 'outerwear',
    collectionSlug: 'atelier',
    isFeatured: true,
    sku: 'ARV-OUT-001',
    size: 'L',
    color: 'Obsidian',
    colorHex: '#1D1E20',
    priceIdr: 899_000n,
    weightGrams: 780,
    initialStock: 12,
    additionalVariants: [
      {
        sku: 'ARV-OUT-001-M-OBS',
        size: 'M',
        color: 'Obsidian',
        colorHex: '#1D1E20',
        priceIdr: 899_000n,
        weightGrams: 750,
        initialStock: 8,
      },
      {
        sku: 'ARV-OUT-001-XL-OBS',
        size: 'XL',
        color: 'Obsidian',
        colorHex: '#1D1E20',
        priceIdr: 899_000n,
        weightGrams: 810,
        initialStock: 3,
        lowStockThreshold: 5,
      },
      {
        sku: 'ARV-OUT-001-L-STN',
        size: 'L',
        color: 'Deep Stone',
        colorHex: '#5E5C54',
        priceIdr: 899_000n,
        weightGrams: 780,
        initialStock: 7,
      },
    ],
    media: buildProductSeedMedia({
      slug: 'atelier-boxy-wool-overshirt',
      sku: 'ARV-OUT-001',
      name: 'Atelier Boxy Wool Overshirt',
      material: '80% Virgin Wool, 20% Polyamide',
      fit: 'Boxy Cropped Fit',
      primaryHex: '#17191B',
    }),
  },
  {
    slug: 'movement-minimalist-leather-sneaker',
    name: 'Movement Minimalist Leather Sneaker',
    description: 'Low-profile tonal court sneaker stitched onto a Margom-inspired natural rubber cup sole.',
    material: 'Full-Grain Calfskin Upper, Calf Leather Lining, Rubber Sole',
    fit: 'True to EU Sizing',
    careInstruction: 'Wipe with damp soft cloth. Condition leather periodically and store with shoe trees.',
    seoTitle: 'Movement Minimalist Leather Sneaker | ARVEN Footwear',
    seoDescription:
      'Full-grain calfskin minimalist court sneaker with calf leather lining and stitched rubber cup sole.',
    categorySlug: 'footwear',
    collectionSlug: 'movement',
    isFeatured: true,
    sku: 'ARV-FW-001',
    size: '42',
    color: 'Cream',
    colorHex: '#E9E4DA',
    priceIdr: 1_299_000n,
    weightGrams: 980,
    initialStock: 10,
    additionalVariants: [
      {
        sku: 'ARV-FW-001-40-CRM',
        size: '40',
        color: 'Cream',
        colorHex: '#E9E4DA',
        priceIdr: 1_299_000n,
        weightGrams: 940,
        initialStock: 6,
      },
      {
        sku: 'ARV-FW-001-41-CRM',
        size: '41',
        color: 'Cream',
        colorHex: '#E9E4DA',
        priceIdr: 1_299_000n,
        weightGrams: 960,
        initialStock: 8,
      },
      {
        sku: 'ARV-FW-001-43-CHR',
        size: '43',
        color: 'Charcoal',
        colorHex: '#17191B',
        priceIdr: 1_299_000n,
        weightGrams: 1000,
        initialStock: 9,
      },
    ],
    media: buildProductSeedMedia({
      slug: 'movement-minimalist-leather-sneaker',
      sku: 'ARV-FW-001',
      name: 'Movement Minimalist Leather Sneaker',
      material: 'Full-Grain Calfskin Upper, Calf Leather Lining, Rubber Sole',
      fit: 'True to EU Sizing',
      primaryHex: '#5E5C54',
      lightBackdrop: true,
    }),
  },
  {
    slug: 'form-structured-calfskin-crossbody',
    name: 'Form Structured Calfskin Crossbody',
    description: 'Architectural rectangular crossbody bag with tonal edge paint and detachable webbing strap.',
    material: '100% Vegetable-Tanned Calfskin Leather',
    fit: 'One Size',
    careInstruction: 'Avoid prolonged moisture exposure. Store inside cotton dust bag.',
    seoTitle: 'Form Structured Calfskin Crossbody | ARVEN Leather Goods',
    seoDescription:
      'Vegetable-tanned calfskin crossbody bag with architectural gusset construction and tonal hand-painted edges.',
    categorySlug: 'accessories',
    collectionSlug: 'form',
    isFeatured: false,
    sku: 'ARV-ACC-001',
    size: 'ONE_SIZE',
    color: 'Deep Stone',
    colorHex: '#5E5C54',
    priceIdr: 799_000n,
    weightGrams: 460,
    initialStock: 14,
    additionalVariants: [
      {
        sku: 'ARV-ACC-001-OS-CHR',
        size: 'ONE_SIZE',
        color: 'Charcoal',
        colorHex: '#17191B',
        priceIdr: 799_000n,
        weightGrams: 460,
        initialStock: 10,
      },
      {
        sku: 'ARV-ACC-001-OS-BRZ',
        size: 'ONE_SIZE',
        color: 'Warm Bronze',
        colorHex: '#C5A572',
        priceIdr: 799_000n,
        weightGrams: 460,
        initialStock: 3,
        lowStockThreshold: 5,
      },
    ],
    media: buildProductSeedMedia({
      slug: 'form-structured-calfskin-crossbody',
      sku: 'ARV-ACC-001',
      name: 'Form Structured Calfskin Crossbody',
      material: '100% Vegetable-Tanned Calfskin Leather',
      fit: 'One Size',
      primaryHex: '#5E5C54',
    }),
  },
];

interface DevUserBlueprint {
  readonly email: string;
  readonly fullName: string;
  readonly roleCode: RoleCode;
}

const DEV_USER_BLUEPRINTS: readonly DevUserBlueprint[] = [
  {
    email: 'owner.dev@arven.local',
    fullName: 'ARVEN Dev Owner',
    roleCode: 'OWNER',
  },
  {
    email: 'manager.dev@arven.local',
    fullName: 'ARVEN Dev Manager',
    roleCode: 'MANAGER',
  },
  {
    email: 'customer.dev@arven.local',
    fullName: 'ARVEN Dev Customer',
    roleCode: 'CUSTOMER',
  },
];

function validateDevUserPassword(password: string | undefined): string {
  if (!password) {
    throw new Error(
      'SEED_DEV_USER_PASSWORD is required when SEED_DEV_USERS=true (non-production only).',
    );
  }
  if (password.includes('\u0000')) {
    throw new Error('SEED_DEV_USER_PASSWORD must not contain NUL characters.');
  }
  if (
    password.length < AUTH_POLICY.PASSWORD_MIN_LENGTH ||
    password.length > AUTH_POLICY.PASSWORD_MAX_LENGTH
  ) {
    throw new Error(
      `SEED_DEV_USER_PASSWORD length must be between ${AUTH_POLICY.PASSWORD_MIN_LENGTH} and ${AUTH_POLICY.PASSWORD_MAX_LENGTH} characters.`,
    );
  }
  return password;
}

async function seedRolesAndPermissions(tx: PrismaTransactionClient): Promise<{
  readonly roleIdsByCode: Map<RoleCode, string>;
  readonly permissionsUpserted: number;
  readonly rolePermissionsAssigned: number;
}> {
  const roleIdsByCode = new Map<RoleCode, string>();
  for (const roleCode of ROLE_CODES) {
    const def = ARVEN_ROLE_DEFINITIONS[roleCode];
    const role = await tx.role.upsert({
      where: { code: def.code },
      update: {
        name: def.name,
        description: def.description,
        isSystem: true,
      },
      create: {
        code: def.code,
        name: def.name,
        description: def.description,
        isSystem: true,
      },
      select: { id: true },
    });
    roleIdsByCode.set(roleCode, role.id);
  }

  const permissionIdsByCode = new Map<string, string>();
  for (const permissionCode of PERMISSION_CODES) {
    const meta = PERMISSION_DESCRIPTIONS[permissionCode];
    const permission = await tx.permission.upsert({
      where: { code: permissionCode },
      update: {
        module: meta.area,
        description: meta.description,
      },
      create: {
        code: permissionCode,
        module: meta.area,
        description: meta.description,
      },
      select: { id: true },
    });
    permissionIdsByCode.set(permissionCode, permission.id);
  }

  let rolePermissionsAssigned = 0;
  for (const roleCode of ROLE_CODES) {
    const roleId = roleIdsByCode.get(roleCode);
    if (!roleId) {
      continue;
    }
    const expectedPermissionIds = ROLE_PERMISSION_MATRIX[roleCode].map((permissionCode) => {
      const id = permissionIdsByCode.get(permissionCode);
      if (!id) {
        throw new Error(`Missing permission record for code ${permissionCode}`);
      }
      return id;
    });

    await tx.rolePermission.deleteMany({
      where: {
        roleId,
        permissionId: { notIn: expectedPermissionIds },
      },
    });

    if (expectedPermissionIds.length > 0) {
      await tx.rolePermission.createMany({
        data: expectedPermissionIds.map((permissionId) => ({
          roleId,
          permissionId,
        })),
        skipDuplicates: true,
      });
      rolePermissionsAssigned += expectedPermissionIds.length;
    }
  }

  return {
    roleIdsByCode,
    permissionsUpserted: permissionIdsByCode.size,
    rolePermissionsAssigned,
  };
}

async function upsertVariantAndInventory(
  tx: PrismaTransactionClient,
  productId: string,
  warehouseId: string,
  variantDef: ProductVariantSeedDefinition,
): Promise<{ readonly createdInventory: boolean }> {
  const compareAtPriceIdr = variantDef.compareAtPriceIdr ?? null;
  const lowStockThreshold = variantDef.lowStockThreshold ?? 5;

  const variant = await tx.productVariant.upsert({
    where: { sku: variantDef.sku },
    update: {
      productId,
      size: variantDef.size,
      color: variantDef.color,
      colorHex: variantDef.colorHex,
      priceIdr: variantDef.priceIdr,
      compareAtPriceIdr,
      weightGrams: variantDef.weightGrams,
      lengthCm: variantDef.lengthCm ?? null,
      widthCm: variantDef.widthCm ?? null,
      heightCm: variantDef.heightCm ?? null,
      isActive: true,
      deletedAt: null,
    },
    create: {
      productId,
      sku: variantDef.sku,
      size: variantDef.size,
      color: variantDef.color,
      colorHex: variantDef.colorHex,
      priceIdr: variantDef.priceIdr,
      compareAtPriceIdr,
      weightGrams: variantDef.weightGrams,
      lengthCm: variantDef.lengthCm ?? null,
      widthCm: variantDef.widthCm ?? null,
      heightCm: variantDef.heightCm ?? null,
      isActive: true,
    },
    select: { id: true },
  });

  const existingInventory = await tx.inventoryLevel.findUnique({
    where: {
      warehouseId_variantId: {
        warehouseId,
        variantId: variant.id,
      },
    },
    select: { id: true },
  });

  if (!existingInventory) {
    await tx.inventoryLevel.create({
      data: {
        warehouseId,
        variantId: variant.id,
        quantityOnHand: variantDef.initialStock,
        quantityReserved: 0,
        lowStockThreshold,
      },
    });

    if (variantDef.initialStock > 0) {
      await tx.inventoryMovement.create({
        data: {
          warehouseId,
          variantId: variant.id,
          type: InventoryMovementType.RECEIPT,
          quantityDelta: variantDef.initialStock,
          referenceType: 'SEED_INITIAL_STOCK',
          referenceId: variant.id,
          reason: `Initial catalog seed receipt for ${variantDef.sku}`,
        },
      });
    }

    return { createdInventory: true };
  }

  return { createdInventory: false };
}

async function seedCatalogAndInventory(tx: PrismaTransactionClient): Promise<{
  readonly warehouseCode: string;
  readonly categoriesUpserted: number;
  readonly collectionsUpserted: number;
  readonly productsUpserted: number;
  readonly variantsUpserted: number;
  readonly mediaUpserted: number;
  readonly inventoryLevelsCreated: number;
}> {
  const warehouse = await tx.warehouse.upsert({
    where: { code: ARVEN_SEED_WAREHOUSE.code },
    update: {
      name: ARVEN_SEED_WAREHOUSE.name,
      city: ARVEN_SEED_WAREHOUSE.city,
      province: ARVEN_SEED_WAREHOUSE.province,
      postalCode: ARVEN_SEED_WAREHOUSE.postalCode,
      status: WarehouseStatus.ACTIVE,
      isDefault: true,
    },
    create: {
      code: ARVEN_SEED_WAREHOUSE.code,
      name: ARVEN_SEED_WAREHOUSE.name,
      city: ARVEN_SEED_WAREHOUSE.city,
      province: ARVEN_SEED_WAREHOUSE.province,
      postalCode: ARVEN_SEED_WAREHOUSE.postalCode,
      status: WarehouseStatus.ACTIVE,
      isDefault: true,
    },
    select: { id: true, code: true },
  });

  const categoryIdsBySlug = new Map<string, string>();
  for (const category of ARVEN_SEED_CATEGORIES) {
    const sizeGuideJson = category.sizeGuideJson as unknown as Prisma.InputJsonValue;
    const saved = await tx.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        sizeGuide: sizeGuideJson,
        sortOrder: category.sortOrder,
        isActive: true,
        deletedAt: null,
      },
      create: {
        slug: category.slug,
        name: category.name,
        description: category.description,
        sizeGuide: sizeGuideJson,
        sortOrder: category.sortOrder,
        isActive: true,
      },
      select: { id: true },
    });
    categoryIdsBySlug.set(category.slug, saved.id);
  }

  const collectionIdsBySlug = new Map<string, string>();
  for (const collection of ARVEN_SEED_COLLECTIONS) {
    const startsAt = new Date(collection.startsAt);
    const saved = await tx.collection.upsert({
      where: { slug: collection.slug },
      update: {
        name: collection.name,
        description: collection.description,
        status: CollectionStatus.PUBLISHED,
        startsAt,
        heroMediaUrl: collection.bannerUrl,
        deletedAt: null,
      },
      create: {
        slug: collection.slug,
        name: collection.name,
        description: collection.description,
        status: CollectionStatus.PUBLISHED,
        startsAt,
        heroMediaUrl: collection.bannerUrl,
      },
      select: { id: true },
    });
    collectionIdsBySlug.set(collection.slug, saved.id);
  }

  const now = new Date();
  let variantsUpserted = 0;
  let mediaUpserted = 0;
  let inventoryLevelsCreated = 0;

  for (const [index, item] of ARVEN_SEED_PRODUCTS.entries()) {
    const categoryId = categoryIdsBySlug.get(item.categorySlug);
    const collectionId = collectionIdsBySlug.get(item.collectionSlug);
    if (!categoryId || !collectionId) {
      throw new Error(`Invalid seed relation for product ${item.slug}`);
    }

    const sizeGuideOverride = item.sizeGuideOverride
      ? (item.sizeGuideOverride as unknown as Prisma.InputJsonValue)
      : undefined;

    const product = await tx.product.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        description: item.description,
        material: item.material,
        fit: item.fit,
        careInstruction: item.careInstruction,
        seoTitle: item.seoTitle,
        seoDescription: item.seoDescription,
        ...(sizeGuideOverride !== undefined ? { sizeGuideOverride } : {}),
        status: ProductStatus.PUBLISHED,
        isVisible: true,
        isFeatured: item.isFeatured,
        deletedAt: null,
      },
      create: {
        slug: item.slug,
        name: item.name,
        description: item.description,
        material: item.material,
        fit: item.fit,
        careInstruction: item.careInstruction,
        seoTitle: item.seoTitle,
        seoDescription: item.seoDescription,
        ...(sizeGuideOverride !== undefined ? { sizeGuideOverride } : {}),
        status: ProductStatus.PUBLISHED,
        isVisible: true,
        isFeatured: item.isFeatured,
        has3dEnabled: false,
        publishedAt: now,
      },
      select: { id: true },
    });

    await tx.productCategory.upsert({
      where: {
        productId_categoryId: {
          productId: product.id,
          categoryId,
        },
      },
      update: { isPrimary: true },
      create: {
        productId: product.id,
        categoryId,
        isPrimary: true,
      },
    });

    await tx.collectionProduct.upsert({
      where: {
        collectionId_productId: {
          collectionId,
          productId: product.id,
        },
      },
      update: { position: index + 1 },
      create: {
        collectionId,
        productId: product.id,
        position: index + 1,
      },
    });

    const allVariants: ProductVariantSeedDefinition[] = [
      {
        sku: item.sku,
        size: item.size,
        color: item.color,
        colorHex: item.colorHex,
        priceIdr: item.priceIdr,
        compareAtPriceIdr: item.compareAtPriceIdr ?? null,
        weightGrams: item.weightGrams,
        initialStock: item.initialStock,
        ...(item.lowStockThreshold !== undefined
          ? { lowStockThreshold: item.lowStockThreshold }
          : {}),
      },
      ...item.additionalVariants,
    ];

    for (const variantDef of allVariants) {
      const res = await upsertVariantAndInventory(tx, product.id, warehouse.id, variantDef);
      variantsUpserted += 1;
      if (res.createdInventory) {
        inventoryLevelsCreated += 1;
      }
    }

    for (const mediaItem of item.media) {
      const existingMedia = await tx.productMedia.findFirst({
        where: {
          productId: product.id,
          objectKey: mediaItem.objectKey,
        },
        select: { id: true },
      });

      if (existingMedia) {
        await tx.productMedia.update({
          where: { id: existingMedia.id },
          data: {
            type: mediaItem.type,
            url: mediaItem.url,
            altText: mediaItem.altText,
            position: mediaItem.position,
            width: mediaItem.width,
            height: mediaItem.height,
            isPrimary: mediaItem.isPrimary,
          },
        });
      } else {
        await tx.productMedia.create({
          data: {
            productId: product.id,
            objectKey: mediaItem.objectKey,
            type: mediaItem.type,
            url: mediaItem.url,
            altText: mediaItem.altText,
            position: mediaItem.position,
            width: mediaItem.width,
            height: mediaItem.height,
            isPrimary: mediaItem.isPrimary,
          },
        });
      }
      mediaUpserted += 1;
    }
  }

  return {
    warehouseCode: warehouse.code,
    categoriesUpserted: categoryIdsBySlug.size,
    collectionsUpserted: collectionIdsBySlug.size,
    productsUpserted: ARVEN_SEED_PRODUCTS.length,
    variantsUpserted,
    mediaUpserted,
    inventoryLevelsCreated,
  };
}

async function seedDevelopmentUsers(
  tx: PrismaTransactionClient,
  roleIdsByCode: Map<RoleCode, string>,
  passwordHash: string,
): Promise<number> {
  const now = new Date();
  let count = 0;

  for (const blueprint of DEV_USER_BLUEPRINTS) {
    const roleId = roleIdsByCode.get(blueprint.roleCode);
    if (!roleId) {
      throw new Error(`Role ${blueprint.roleCode} missing during dev user seed`);
    }

    const user = await tx.user.upsert({
      where: { email: blueprint.email },
      update: {
        fullName: blueprint.fullName,
        status: UserStatus.ACTIVE,
        verifiedAt: now,
      },
      create: {
        email: blueprint.email,
        passwordHash,
        fullName: blueprint.fullName,
        status: UserStatus.ACTIVE,
        verifiedAt: now,
        mfaEnabled: false,
      },
      select: { id: true },
    });

    await tx.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId,
      },
    });

    count += 1;
  }

  return count;
}

export async function seedDatabase(
  prisma: PrismaClient,
  options: SeedDatabaseOptions = {},
): Promise<SeedDatabaseResult> {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const seedDevUsers = options.seedDevUsers ?? process.env.SEED_DEV_USERS === 'true';

  if (nodeEnv === 'production' && seedDevUsers) {
    throw new Error('Refusing to seed development users when NODE_ENV=production');
  }

  let devPasswordHash: string | null = null;
  if (seedDevUsers) {
    const plainPassword = validateDevUserPassword(
      options.devUserPassword ?? process.env.SEED_DEV_USER_PASSWORD,
    );
    devPasswordHash = await argon2.hash(plainPassword, {
      type: argon2.argon2id,
      memoryCost: AUTH_POLICY.ARGON2_MEMORY_COST_KIB,
      timeCost: AUTH_POLICY.ARGON2_TIME_COST,
      parallelism: AUTH_POLICY.ARGON2_PARALLELISM,
      hashLength: AUTH_POLICY.ARGON2_HASH_LENGTH,
    });
  }

  return withTransaction(prisma, async (tx) => {
    const rbac = await seedRolesAndPermissions(tx);
    const catalog = await seedCatalogAndInventory(tx);

    let devUsersSeeded = 0;
    if (devPasswordHash !== null) {
      devUsersSeeded = await seedDevelopmentUsers(tx, rbac.roleIdsByCode, devPasswordHash);
    }

    return {
      rolesUpserted: rbac.roleIdsByCode.size,
      permissionsUpserted: rbac.permissionsUpserted,
      rolePermissionsAssigned: rbac.rolePermissionsAssigned,
      warehouseCode: catalog.warehouseCode,
      categoriesUpserted: catalog.categoriesUpserted,
      collectionsUpserted: catalog.collectionsUpserted,
      productsUpserted: catalog.productsUpserted,
      variantsUpserted: catalog.variantsUpserted,
      mediaUpserted: catalog.mediaUpserted,
      inventoryLevelsCreated: catalog.inventoryLevelsCreated,
      devUsersSeeded,
    };
  });
}
