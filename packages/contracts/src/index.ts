import type {
  AddCartItemRequest,
  AddressResponse,
  AdminInventoryLevelsQuery,
  AdminInventoryMovementsQuery,
  AdminLoginRequest,
  AdminManualMovementTypeInput,
  AdminProductsQuery,
  AdminStockReservationsQuery,
  ApiErrorEnvelope,
  ApiPaginatedEnvelope,
  ApiSuccessEnvelope,
  AuthUserSummary,
  CartItemConfiguration,
  CartStatusInput,
  CollectionStatusInput,
  CreateAddressRequest,
  CreateAdminStockMovementRequest,
  CreateCategoryRequest,
  CreateCollectionRequest,
  CreateProductMediaRequest,
  CreateProductRequest,
  CreateProductVariantRequest,
  CsrfTokenResponse,
  ForgotPasswordRequest,
  HealthLiveResponse,
  HealthReadyResponse,
  InventoryMovementTypeInput,
  LoginRequest,
  MediaTypeInput,
  MfaSetupResponse,
  MfaVerifyRequest,
  ProductSort,
  ProductStatusInput,
  PublicProductsQuery,
  RegisterRequest,
  ResetPasswordRequest,
  StockReservationStatusInput,
  StockStatus,
  TransitionProductStatusRequest,
  UpdateAddressRequest,
  UpdateCartItemRequest,
  UpdateCategoryRequest,
  UpdateCollectionRequest,
  UpdateProductMediaRequest,
  UpdateProductRequest,
  UpdateProductVariantRequest,
  UpdateProfileRequest,
  UserProfileResponse,
  UserSessionSummary,
  VerifyEmailRequest,
  WarehouseStatusInput,
} from '@arven/validators';

export type {
  AddCartItemRequest,
  AddressResponse,
  AdminInventoryLevelsQuery,
  AdminInventoryMovementsQuery,
  AdminLoginRequest,
  AdminManualMovementTypeInput,
  AdminProductsQuery,
  AdminStockReservationsQuery,
  ApiErrorEnvelope,
  ApiPaginatedEnvelope,
  ApiSuccessEnvelope,
  AuthUserSummary,
  CartItemConfiguration,
  CartStatusInput,
  CollectionStatusInput,
  CreateAddressRequest,
  CreateAdminStockMovementRequest,
  CreateCategoryRequest,
  CreateCollectionRequest,
  CreateProductMediaRequest,
  CreateProductRequest,
  CreateProductVariantRequest,
  CsrfTokenResponse,
  ForgotPasswordRequest,
  HealthLiveResponse,
  HealthReadyResponse,
  InventoryMovementTypeInput,
  LoginRequest,
  MediaTypeInput,
  MfaSetupResponse,
  MfaVerifyRequest,
  ProductSort,
  ProductStatusInput,
  PublicProductsQuery,
  RegisterRequest,
  ResetPasswordRequest,
  StockReservationStatusInput,
  StockStatus,
  TransitionProductStatusRequest,
  UpdateAddressRequest,
  UpdateCartItemRequest,
  UpdateCategoryRequest,
  UpdateCollectionRequest,
  UpdateProductMediaRequest,
  UpdateProductRequest,
  UpdateProductVariantRequest,
  UpdateProfileRequest,
  UserProfileResponse,
  UserSessionSummary,
  VerifyEmailRequest,
  WarehouseStatusInput,
};

export { OPENAPI_PATHS, type OpenApiPath } from './generated/openapi-paths.js';

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

export interface SizeGuideDataDto {
  unit?: string;
  notes?: string;
  columns?: string[];
  rows?: Array<Record<string, string>>;
  [key: string]: unknown;
}

export interface ProductMediaDto {
  id: string;
  productId: string;
  variantId: string | null;
  type: MediaTypeInput;
  url: string;
  altText: string;
  position: number;
  width: number | null;
  height: number | null;
  isPrimary: boolean;
}

export interface CategoryNodeDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  productCount: number;
  sizeGuideJson: SizeGuideDataDto | null;
  children: CategoryNodeDto[];
}

export interface ProductVariantPublicDto {
  id: string;
  sku: string;
  size: string;
  color: string;
  colorHex: string | null;
  priceIdr: number;
  compareAtPriceIdr: number | null;
  weightGrams: number;
  availableQty: number;
  lowStockThreshold: number;
  stockStatus: StockStatus;
}

export interface ProductCardDto {
  id: string;
  slug: string;
  name: string;
  description: string;
  material: string;
  fit: string;
  priceIdr: number;
  compareAtPriceIdr: number | null;
  isFeatured: boolean;
  has3dEnabled: boolean;
  inStock: boolean;
  stockStatus: StockStatus;
  primaryCategory: {
    id: string;
    slug: string;
    name: string;
  } | null;
  collections: Array<{
    id: string;
    slug: string;
    name: string;
  }>;
  primaryMedia: ProductMediaDto | null;
  availableSizes: string[];
  availableColors: Array<{
    color: string;
    colorHex: string | null;
  }>;
  publishedAt: string | null;
}

export interface CollectionSummaryDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  productCount: number;
  featuredProducts: ProductCardDto[];
}

export interface CollectionDetailDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  productCount: number;
  products: ProductCardDto[];
}

export interface ProductDetailDto {
  id: string;
  slug: string;
  name: string;
  description: string;
  material: string;
  fit: string;
  careInstruction: string;
  seoTitle: string | null;
  seoDescription: string | null;
  isFeatured: boolean;
  has3dEnabled: boolean;
  priceIdr: number;
  compareAtPriceIdr: number | null;
  inStock: boolean;
  stockStatus: StockStatus;
  primaryCategory: {
    id: string;
    slug: string;
    name: string;
  } | null;
  categories: Array<{
    id: string;
    slug: string;
    name: string;
    isPrimary: boolean;
  }>;
  collections: Array<{
    id: string;
    slug: string;
    name: string;
  }>;
  variants: ProductVariantPublicDto[];
  media: ProductMediaDto[];
  primaryMedia: ProductMediaDto | null;
  sizeGuide: SizeGuideDataDto | null;
  relatedProducts: ProductCardDto[];
  publishedAt: string | null;
}

export interface PublishGateCheckItemDto {
  key: 'CORE_METADATA' | 'ACTIVE_VARIANTS_AND_INVENTORY' | 'SEO_AND_SIZE_GUIDE' | 'MEDIA_AND_ALT_TEXT';
  label: string;
  passed: boolean;
  issues: Array<{
    field: string;
    issue: string;
  }>;
}

export interface PublishGateEvaluationDto {
  canPublish: boolean;
  unmetCount: number;
  checks: PublishGateCheckItemDto[];
  issues: Array<{
    field: string;
    issue: string;
  }>;
}

export interface AdminProductVariantDto {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  size: string;
  color: string;
  colorHex: string | null;
  priceIdr: number;
  compareAtPriceIdr: number | null;
  weightGrams: number;
  dimensionsJson: Record<string, unknown> | null;
  isActive: boolean;
  quantityOnHand: number;
  quantityReserved: number;
  availableQty: number;
  lowStockThreshold: number;
  stockStatus: StockStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductSummaryDto {
  id: string;
  slug: string;
  name: string;
  status: ProductStatusInput;
  isVisible: boolean;
  isFeatured: boolean;
  has3dEnabled: boolean;
  priceIdr: number;
  compareAtPriceIdr: number | null;
  variantCount: number;
  totalAvailableStock: number;
  primaryCategory: {
    id: string;
    slug: string;
    name: string;
  } | null;
  collections: Array<{
    id: string;
    slug: string;
    name: string;
  }>;
  primaryMedia: ProductMediaDto | null;
  publishGate: {
    canPublish: boolean;
    unmetCount: number;
  };
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductDetailDto {
  id: string;
  slug: string;
  name: string;
  description: string;
  material: string;
  fit: string;
  careInstruction: string;
  seoTitle: string | null;
  seoDescription: string | null;
  status: ProductStatusInput;
  isVisible: boolean;
  isFeatured: boolean;
  has3dEnabled: boolean;
  sizeGuideOverride: SizeGuideDataDto | null;
  effectiveSizeGuide: SizeGuideDataDto | null;
  categories: Array<{
    id: string;
    slug: string;
    name: string;
    isPrimary: boolean;
  }>;
  collections: Array<{
    id: string;
    slug: string;
    name: string;
    position: number;
  }>;
  variants: AdminProductVariantDto[];
  media: ProductMediaDto[];
  publishGate: PublishGateEvaluationDto;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCategoryDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  sizeGuideJson: SizeGuideDataDto | null;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCollectionDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  status: CollectionStatusInput;
  startsAt: string | null;
  endsAt: string | null;
  productCount: number;
  productIds: string[];
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Phase 04: Inventory Ledger & Guest/Authenticated Cart DTOs
// =============================================================================

export interface WarehouseSummaryDto {
  id: string;
  code: string;
  name: string;
  city: string;
  province: string;
  status: WarehouseStatusInput;
  isDefault: boolean;
}

export interface AdminInventoryLevelDto {
  id: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  productStatus: ProductStatusInput;
  sku: string;
  color: string;
  colorHex: string | null;
  size: string;
  priceIdr: number;
  variantIsActive: boolean;
  quantityOnHand: number;
  quantityReserved: number;
  availableQty: number;
  lowStockThreshold: number;
  stockStatus: StockStatus;
  updatedAt: string;
}

export interface AdminInventoryMovementDto {
  id: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  variantId: string;
  sku: string;
  productName: string;
  color: string;
  size: string;
  type: InventoryMovementTypeInput;
  quantityDelta: number;
  referenceType: string;
  referenceId: string | null;
  reason: string | null;
  actorId: string | null;
  actorEmail: string | null;
  createdAt: string;
}

export interface AdminStockReservationDto {
  id: string;
  orderId: string;
  orderNumber: string | null;
  warehouseId: string;
  warehouseCode: string;
  variantId: string;
  sku: string;
  productName: string;
  color: string;
  size: string;
  quantity: number;
  status: StockReservationStatusInput;
  expiresAt: string;
  releasedAt: string | null;
  committedAt: string | null;
  createdAt: string;
}

export interface AdminStockMovementResultDto {
  movement: AdminInventoryMovementDto;
  level: AdminInventoryLevelDto;
}

export type CartAvailabilityIssueCode =
  | 'PRODUCT_UNAVAILABLE'
  | 'VARIANT_INACTIVE'
  | 'OUT_OF_STOCK'
  | 'INSUFFICIENT_STOCK';

export interface CartItemDto {
  id: string;
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  sku: string;
  color: string;
  colorHex: string | null;
  size: string;
  unitPriceIdr: number;
  compareAtIdr: number | null;
  lineSubtotalIdr: number;
  quantity: number;
  availableQty: number;
  isAvailable: boolean;
  availabilityStatus: StockStatus;
  issueCode: CartAvailabilityIssueCode | null;
  issueMessage: string | null;
  configuration: CartItemConfiguration;
  configurationHash: string;
  primaryImageUrl: string | null;
  primaryImageAlt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CartDto {
  id: string | null;
  status: CartStatusInput;
  ownerType: 'USER' | 'GUEST' | 'NONE';
  currency: 'IDR';
  itemCount: number;
  totalQuantity: number;
  subtotalIdr: number;
  hasUnavailableItems: boolean;
  items: CartItemDto[];
  updatedAt: string | null;
}

export interface MergeCartResultDto {
  merged: boolean;
  mergedItemCount: number;
  adjustedItemCount: number;
  notices: string[];
  cart: CartDto;
}
