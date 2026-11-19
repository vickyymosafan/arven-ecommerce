import type {
  AddCartItemRequest,
  AddOutfitCartSlotInput,
  AddOutfitToCartRequest,
  AddressResponse,
  AdminCmsListQuery,
  AdminCouponsQuery,
  AdminCreateShipmentRequest,
  AdminInventoryLevelsQuery,
  AdminInventoryMovementsQuery,
  AdminLoginRequest,
  AdminManualMovementTypeInput,
  AdminOrdersQuery,
  AdminProductsQuery,
  AdminRefundsQuery,
  AdminReturnsQuery,
  AdminStockReservationsQuery,
  AdminTransitionOrderRequest,
  AnalyticsSalesQuery,
  ApiErrorEnvelope,
  ApiPaginatedEnvelope,
  ApiSuccessEnvelope,
  ApproveRefundInput,
  ApproveReturnRequest,
  AssetFormatInput,
  AssetProvenanceInput,
  AssetStatusInput,
  AssetValidationStatusInput,
  AuthUserSummary,
  CancelOrderRequest,
  CartItemConfiguration,
  CartStatusInput,
  CheckoutGuestAddress,
  CheckoutLineItemInput,
  CheckoutQuoteRequest,
  CheckoutShippingSelection,
  CmsLookbookSlideInput,
  CmsPageBlockInput,
  CmsStatusInput,
  CollectionStatusInput,
  Confirm3DAssetRequest,
  CouponStatusInput,
  CreateAddressRequest,
  CreateAdminStockMovementRequest,
  CreateCategoryRequest,
  CreateCmsJournalRequest,
  CreateCmsLookbookRequest,
  CreateCmsPageRequest,
  CreateCollectionRequest,
  CreateCouponRequest,
  CreateCustomerReturnRequest,
  CreateCustomizationPresetRequest,
  CreateOrderRequest,
  CreateOutfitSceneRequest,
  CreatePaymentSessionRequest,
  CreateProductMediaRequest,
  CreateProductRequest,
  CreateProductVariantRequest,
  CreatePublicOutfitPresetRequest,
  CreateShowroomHotspotRequest,
  CreateShowroomZoneRequest,
  CsrfTokenResponse,
  CustomerReturnItemInput,
  DiscountTypeInput,
  ForgotPasswordRequest,
  GarmentSilhouetteInput,
  HealthLiveResponse,
  HealthReadyResponse,
  InventoryMovementTypeInput,
  LightingPresetInput,
  ListOrdersQuery,
  LoginRequest,
  MaterialOverrideEntryInput,
  MaterialSlotSpecInput,
  MediaTypeInput,
  MfaSetupResponse,
  MfaVerifyRequest,
  MidtransWebhookPayload,
  OrderStatusInput,
  OutfitAnchorInput,
  OutfitCompatibilityConfigInput,
  OutfitCompatibilityReason,
  OutfitSlotInput,
  OutfitSlotSelectionInput,
  PaymentStatusInput,
  Presign3DAssetRequest,
  ProductSort,
  ProductStatusInput,
  PublicProductsQuery,
  Publish3DAssetRequest,
  ReceiveReturnItemInput,
  ReceiveReturnRequest,
  Record3DTelemetryRequest,
  RefundStatusInput,
  RegisterRequest,
  RequestRefundInput,
  ResetPasswordRequest,
  ReturnItemConditionInput,
  ReturnStatusInput,
  ReviewReturnRequest,
  SetAssetOutfitCompatibilityRequest,
  ShipmentStatusInput,
  ShowroomCameraBaselineInput,
  ShowroomPortalInput,
  ShowroomVector3Input,
  ShowroomZoneStatusInput,
  StockReservationStatusInput,
  StockStatus,
  TransitionCmsStatusRequest,
  TransitionProductStatusRequest,
  TransitionShowroomZoneRequest,
  UpdateAddressRequest,
  UpdateCartItemRequest,
  UpdateCategoryRequest,
  UpdateCmsJournalRequest,
  UpdateCmsLookbookRequest,
  UpdateCmsPageRequest,
  UpdateCollectionRequest,
  UpdateCouponRequest,
  UpdateCustomizationPresetRequest,
  UpdateOutfitSceneRequest,
  UpdateProductMediaRequest,
  UpdateProductRequest,
  UpdateProductVariantRequest,
  UpdateProfileRequest,
  UpdatePublicOutfitPresetRequest,
  UpdateShowroomHotspotRequest,
  UpdateShowroomZoneRequest,
  UploadStaging3DAssetRequest,
  UserProfileResponse,
  UserSessionSummary,
  ValidateOutfitRequest,
  VerifyEmailRequest,
  WarehouseStatusInput,
} from '@arven/validators';

export type {
  AddCartItemRequest,
  AddOutfitCartSlotInput,
  AddOutfitToCartRequest,
  AddressResponse,
  AdminCmsListQuery,
  AdminCouponsQuery,
  AdminCreateShipmentRequest,
  AdminInventoryLevelsQuery,
  AdminInventoryMovementsQuery,
  AdminLoginRequest,
  AdminManualMovementTypeInput,
  AdminOrdersQuery,
  AdminProductsQuery,
  AdminRefundsQuery,
  AdminReturnsQuery,
  AdminStockReservationsQuery,
  AdminTransitionOrderRequest,
  AnalyticsSalesQuery,
  ApiErrorEnvelope,
  ApiPaginatedEnvelope,
  ApiSuccessEnvelope,
  ApproveRefundInput,
  ApproveReturnRequest,
  AssetFormatInput,
  AssetProvenanceInput,
  AssetStatusInput,
  AssetValidationStatusInput,
  AuthUserSummary,
  CancelOrderRequest,
  CartItemConfiguration,
  CartStatusInput,
  CheckoutGuestAddress,
  CheckoutLineItemInput,
  CheckoutQuoteRequest,
  CheckoutShippingSelection,
  CmsLookbookSlideInput,
  CmsPageBlockInput,
  CmsStatusInput,
  CollectionStatusInput,
  Confirm3DAssetRequest,
  CouponStatusInput,
  CreateAddressRequest,
  CreateAdminStockMovementRequest,
  CreateCategoryRequest,
  CreateCmsJournalRequest,
  CreateCmsLookbookRequest,
  CreateCmsPageRequest,
  CreateCollectionRequest,
  CreateCouponRequest,
  CreateCustomerReturnRequest,
  CreateCustomizationPresetRequest,
  CreateOrderRequest,
  CreateOutfitSceneRequest,
  CreatePaymentSessionRequest,
  CreateProductMediaRequest,
  CreateProductRequest,
  CreateProductVariantRequest,
  CreatePublicOutfitPresetRequest,
  CreateShowroomHotspotRequest,
  CreateShowroomZoneRequest,
  CsrfTokenResponse,
  CustomerReturnItemInput,
  DiscountTypeInput,
  ForgotPasswordRequest,
  GarmentSilhouetteInput,
  HealthLiveResponse,
  HealthReadyResponse,
  InventoryMovementTypeInput,
  LightingPresetInput,
  ListOrdersQuery,
  LoginRequest,
  MaterialOverrideEntryInput,
  MaterialSlotSpecInput,
  MediaTypeInput,
  MfaSetupResponse,
  MfaVerifyRequest,
  MidtransWebhookPayload,
  OrderStatusInput,
  OutfitAnchorInput,
  OutfitCompatibilityConfigInput,
  OutfitCompatibilityReason,
  OutfitSlotInput,
  OutfitSlotSelectionInput,
  PaymentStatusInput,
  Presign3DAssetRequest,
  ProductSort,
  ProductStatusInput,
  PublicProductsQuery,
  Publish3DAssetRequest,
  ReceiveReturnItemInput,
  ReceiveReturnRequest,
  Record3DTelemetryRequest,
  RefundStatusInput,
  RegisterRequest,
  RequestRefundInput,
  ResetPasswordRequest,
  ReturnItemConditionInput,
  ReturnStatusInput,
  ReviewReturnRequest,
  SetAssetOutfitCompatibilityRequest,
  ShipmentStatusInput,
  ShowroomCameraBaselineInput,
  ShowroomPortalInput,
  ShowroomVector3Input,
  ShowroomZoneStatusInput,
  StockReservationStatusInput,
  StockStatus,
  TransitionCmsStatusRequest,
  TransitionProductStatusRequest,
  TransitionShowroomZoneRequest,
  UpdateAddressRequest,
  UpdateCartItemRequest,
  UpdateCategoryRequest,
  UpdateCmsJournalRequest,
  UpdateCmsLookbookRequest,
  UpdateCmsPageRequest,
  UpdateCollectionRequest,
  UpdateCouponRequest,
  UpdateCustomizationPresetRequest,
  UpdateOutfitSceneRequest,
  UpdateProductMediaRequest,
  UpdateProductRequest,
  UpdateProductVariantRequest,
  UpdateProfileRequest,
  UpdatePublicOutfitPresetRequest,
  UpdateShowroomHotspotRequest,
  UpdateShowroomZoneRequest,
  UploadStaging3DAssetRequest,
  UserProfileResponse,
  UserSessionSummary,
  ValidateOutfitRequest,
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
  key:
    | 'CORE_METADATA'
    | 'ACTIVE_VARIANTS_AND_INVENTORY'
    | 'SEO_AND_SIZE_GUIDE'
    | 'MEDIA_AND_ALT_TEXT'
    | 'THREE_D_ASSET_READINESS';
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

// =============================================================================
// Phase 05: Checkout Quote, Orders & Midtrans Payment DTOs
// =============================================================================

export interface ShippingRateOptionDto {
  provider: string;
  serviceCode: string;
  serviceName: string;
  costIdr: number;
  estimatedMinDays: number;
  estimatedMaxDays: number;
}

export interface CheckoutQuoteItemDto {
  variantId: string;
  sku: string;
  productId: string;
  productSlug: string;
  productName: string;
  size: string;
  color: string;
  unitPriceIdr: number;
  quantity: number;
  discountAllocatedIdr: number;
  lineTotalIdr: number;
  availableQuantity: number;
  primaryImageUrl: string | null;
}

export interface AppliedCouponDto {
  code: string;
  name: string;
  discountType: DiscountTypeInput;
  discountValue: number;
  discountAppliedIdr: number;
}

export interface CheckoutQuoteDto {
  currency: 'IDR';
  warehouseCode: string;
  totalWeightGrams: number;
  items: CheckoutQuoteItemDto[];
  shippingOptions: ShippingRateOptionDto[];
  selectedShipping: ShippingRateOptionDto | null;
  subtotalIdr: number;
  discountTotalIdr: number;
  shippingTotalIdr: number;
  taxTotalIdr: number;
  grandTotalIdr: number;
  appliedCoupon: AppliedCouponDto | null;
  quoteExpiresAt: string;
}

export interface OrderAddressSnapshotDto {
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  subdistrict: string | null;
  city: string;
  province: string;
  postalCode: string;
  countryCode: string;
}

export interface OrderItemDto {
  id: string;
  variantId: string | null;
  sku: string;
  productName: string;
  size: string;
  color: string;
  unitPriceIdr: number;
  discountAllocatedIdr: number;
  quantity: number;
  lineTotalIdr: number;
  configuration: Record<string, unknown>;
}

export interface OrderStatusHistoryDto {
  id: string;
  fromStatus: OrderStatusInput | null;
  toStatus: OrderStatusInput;
  reason: string | null;
  actorType: string;
  createdAt: string;
}

export interface PaymentSummaryDto {
  id: string;
  orderId: string;
  provider: string;
  providerReference: string;
  providerTransactionId: string | null;
  method: string | null;
  status: PaymentStatusInput;
  amountIdr: number;
  currency: 'IDR';
  snapToken: string | null;
  redirectUrl: string | null;
  expiresAt: string;
  settledAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderSummaryDto {
  id: string;
  orderNumber: string;
  status: OrderStatusInput;
  currency: 'IDR';
  itemCount: number;
  totalQuantity: number;
  subtotalIdr: number;
  discountTotalIdr: number;
  shippingTotalIdr: number;
  taxTotalIdr: number;
  grandTotalIdr: number;
  shippingProvider: string;
  shippingService: string;
  paymentExpiresAt: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetailDto {
  id: string;
  orderNumber: string;
  isGuest: boolean;
  guestEmail: string | null;
  status: OrderStatusInput;
  currency: 'IDR';
  subtotalIdr: number;
  discountTotalIdr: number;
  shippingTotalIdr: number;
  taxTotalIdr: number;
  grandTotalIdr: number;
  shippingProvider: string;
  shippingService: string;
  couponCodeSnapshot: string | null;
  addressSnapshot: OrderAddressSnapshotDto;
  items: OrderItemDto[];
  statusHistory: OrderStatusHistoryDto[];
  latestPayment: PaymentSummaryDto | null;
  payments: PaymentSummaryDto[];
  paymentExpiresAt: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderResultDto {
  order: OrderDetailDto;
  guestToken: string | null;
}

export interface PaymentSessionDto {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  provider: string;
  providerReference: string;
  status: PaymentStatusInput;
  amountIdr: number;
  currency: 'IDR';
  snapToken: string | null;
  redirectUrl: string | null;
  expiresAt: string;
}

export interface MidtransWebhookAckDto {
  acknowledged: true;
  duplicate?: boolean;
  orderNumber?: string;
  paymentStatus?: PaymentStatusInput;
}

// =============================================================================
// Phase 06: Admin Operations, Shipments, Returns, Refunds, Coupons, CMS & Analytics DTOs
// =============================================================================

export interface ShipmentEventDto {
  id: string;
  shipmentId: string;
  status: ShipmentStatusInput;
  rawCode: string | null;
  description: string;
  location: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface ShipmentDto {
  id: string;
  orderId: string;
  warehouseId: string;
  warehouseCode?: string;
  provider: string;
  serviceCode: string;
  providerReference: string | null;
  trackingNumber: string | null;
  labelUrl: string | null;
  status: ShipmentStatusInput;
  shippedAt: string | null;
  deliveredAt: string | null;
  events: ShipmentEventDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ReturnItemDto {
  id: string;
  returnId: string;
  orderItemId: string;
  variantId: string | null;
  sku: string;
  productName: string;
  size: string;
  color: string;
  unitPriceIdr: number;
  purchasedQuantity: number;
  quantity: number;
  condition: ReturnItemConditionInput | null;
  restocked: boolean;
  createdAt: string;
}

export interface ReturnDetailDto {
  id: string;
  orderId: string;
  orderNumber: string;
  userId: string | null;
  customerEmail: string | null;
  piiMasked: boolean;
  status: ReturnStatusInput;
  reason: string;
  customerNotes: string | null;
  evidenceKeys: string[];
  adminNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  receivedAt: string | null;
  items: ReturnItemDto[];
  createdAt: string;
  updatedAt: string;
}

export interface RefundDto {
  id: string;
  orderId: string;
  orderNumber?: string;
  paymentId: string;
  returnId: string | null;
  refundKey: string;
  providerRefundId: string | null;
  status: RefundStatusInput;
  amountIdr: number;
  currency: 'IDR';
  reason: string;
  requestedBy: string;
  requestedByEmail?: string | null;
  approvedBy: string | null;
  approvedByEmail?: string | null;
  gatewayResponse?: Record<string, unknown> | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOrderSummaryDto extends OrderSummaryDto {
  isGuest: boolean;
  customerEmail: string | null;
  recipientName: string;
  piiMasked: boolean;
  latestPaymentStatus: PaymentStatusInput | null;
  shipmentStatus: ShipmentStatusInput | null;
  latestTrackingNumber: string | null;
}

export interface AdminOrderDetailDto extends OrderDetailDto {
  userId: string | null;
  customerEmail: string | null;
  piiMasked: boolean;
  shipments: ShipmentDto[];
  returns: ReturnDetailDto[];
  refunds: RefundDto[];
}

export interface AdminCouponDto {
  id: string;
  code: string;
  name: string;
  discountType: DiscountTypeInput;
  discountValue: number;
  maxDiscountIdr: number | null;
  minOrderSubtotalIdr: number;
  usageLimitTotal: number | null;
  usageLimitPerUser: number | null;
  usedCount: number;
  status: CouponStatusInput;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CmsPageBlockDto {
  id?: string;
  type: string;
  heading?: string;
  subheading?: string;
  body?: string;
  imageUrl?: string;
  altText?: string;
  ctaLabel?: string;
  ctaHref?: string;
  items?: Array<{ label: string; value: string }>;
}

export interface CmsPageDto {
  id: string;
  slug: string;
  title: string;
  blocks: CmsPageBlockDto[] | Record<string, unknown>;
  status: CmsStatusInput;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CmsLookbookSlideDto {
  id?: string;
  title: string;
  caption?: string;
  imageUrl: string;
  altText?: string;
  productSlug?: string;
  productId?: string;
  position?: number;
}

export interface CmsLookbookDto {
  id: string;
  slug: string;
  title: string;
  season: string;
  description: string | null;
  slides: CmsLookbookSlideDto[];
  status: CmsStatusInput;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CmsJournalArticleDto {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: Record<string, unknown> | Array<Record<string, unknown>>;
  coverMediaUrl: string | null;
  authorId: string | null;
  authorName: string | null;
  status: CmsStatusInput;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSalesDailyPointDto {
  date: string;
  orderCount: number;
  paidOrderCount: number;
  grossSalesIdr: number | null;
  netSalesIdr: number | null;
}

export interface AdminOrderStatusCountDto {
  status: OrderStatusInput;
  count: number;
}

export interface AdminSalesAnalyticsDto {
  days: number;
  limitedView: boolean;
  currency: 'IDR';
  totalOrders: number;
  paidOrders: number;
  pendingPaymentOrders: number;
  fulfilledOrders: number;
  cancelledOrExpiredOrders: number;
  openReturnsCount: number;
  totalReturnsCount: number;
  pendingRefundRequestsCount: number;
  grossSalesIdr: number | null;
  netSalesIdr: number | null;
  totalRefundedIdr: number | null;
  averageOrderValueIdr: number | null;
  paymentSuccessRatePct: number | null;
  returnRatePct: number | null;
  statusBreakdown: AdminOrderStatusCountDto[];
  dailySeries: AdminSalesDailyPointDto[];
  generatedAt: string;
}

// =============================================================================
// Phase 07: 3D Product Viewer, Asset Pipeline & Customization Presets DTOs
// =============================================================================

export interface MaterialSlotSpecDto {
  slotId: string;
  meshNames: string[];
  materialName: string;
  customizable: boolean;
  defaultBaseColorHex: string;
  roughnessRange: [number, number];
  metalnessRange: [number, number];
}

export interface AssetProvenanceDto {
  sourceType: 'in_house_cad' | 'commissioned_vendor' | 'licensed_stock';
  modelAuthor: string;
  modelLicense: string;
  textureLicense: string;
  hdriLicense: string;
  commercialUseVerified: true;
}

export interface AssetQualityProfileDto {
  triangles: number;
  vertices: number;
  bytes: number;
  url?: string;
}

export interface Product3DAssetConfigDto {
  schemaVersion: string;
  coordinateSystem: {
    upAxis: 'Y';
    units: 'meters';
    frontAxis: '+Z';
    groundY: number;
    pivot: [number, number, number];
    cameraBaseline: {
      fovDeg: number;
      position: [number, number, number];
      target: [number, number, number];
      minDistance: number;
      maxDistance: number;
    };
  };
  silhouette?: GarmentSilhouetteInput;
  lightingPreset: LightingPresetInput;
  materialSlots: MaterialSlotSpecDto[];
  qualityProfiles: {
    default: AssetQualityProfileDto;
    lite?: AssetQualityProfileDto;
  };
  provenance: AssetProvenanceDto;
  outfitCompatibility?: OutfitCompatibilityConfigDto | null;
}

export interface CustomizationPresetDto {
  id: string;
  productId: string;
  assetId: string;
  code: string;
  label: string;
  swatchHex: string;
  materialOverrides: Record<string, MaterialOverrideEntryInput>;
  variantId: string | null;
  variantSku?: string | null;
  variantColor?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssetValidationRunDto {
  id: string;
  assetId: string;
  status: AssetValidationStatusInput;
  validatorVersion: string;
  report: Record<string, unknown>;
  errorSummary: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface Product3DAssetPublicDto {
  id: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantId: string | null;
  version: number;
  format: AssetFormatInput;
  bytes: number;
  modelUrl: string;
  mobileModelUrl: string | null;
  posterUrl: string;
  config: Product3DAssetConfigDto;
  customizationPresets: CustomizationPresetDto[];
  publishedAt: string | null;
}

export interface Product3DAssetMetadataDto {
  id: string;
  productId: string;
  version: number;
  format: AssetFormatInput;
  bytes: number;
  posterUrl: string;
  modelUrl: string;
  mobileModelUrl: string | null;
  coordinateSystem: Product3DAssetConfigDto['coordinateSystem'];
  lightingPreset: LightingPresetInput;
  materialSlots: MaterialSlotSpecDto[];
  qualityProfiles: Product3DAssetConfigDto['qualityProfiles'];
  provenance: AssetProvenanceDto;
}

export interface AdminProduct3DAssetDto {
  id: string;
  productId: string;
  variantId: string | null;
  version: number;
  format: AssetFormatInput;
  objectKey: string;
  mobileObjectKey: string | null;
  posterKey: string;
  bytes: number;
  status: AssetStatusInput;
  isActiveVersion: boolean;
  config: Product3DAssetConfigDto;
  modelUrl: string | null;
  mobileModelUrl: string | null;
  posterUrl: string;
  previewModelUrl: string;
  validationRuns: AssetValidationRunDto[];
  customizationPresets: CustomizationPresetDto[];
  publishedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Presign3DAssetResponseDto {
  asset: AdminProduct3DAssetDto;
  stagingKey: string;
  uploadUrl: string;
  uploadMethod: 'PUT';
  uploadHeaders: Record<string, string>;
  expiresAtUtc: string;
}

export interface Telemetry3DReceiptDto {
  recorded: true;
  eventType: Record3DTelemetryRequest['eventType'];
  recordedAtUtc: string;
}

export interface Admin3DEngagementAnalyticsDto {
  viewerOpenedCount: number;
  presetSelectedCount: number;
  cameraPresetCount: number;
  fallbackTriggeredCount: number;
  loadErrorCount: number;
  contextLostCount: number;
  readyAssetsCount: number;
  productsWith3DCount: number;
  generatedAt: string;
}

// =============================================================================
// Phase 08: Virtual Showroom & Outfit Studio DTOs
// =============================================================================

export interface ShowroomHotspotPublicDto {
  id: string;
  zoneId: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantId: string | null;
  label: string;
  fromPriceIdr: number;
  primaryImageUrl: string | null;
  primaryImageAlt: string | null;
  has3dEnabled: boolean;
  position: [number, number, number];
  sortOrder: number;
}

export interface ShowroomZonePublicDto {
  id: string;
  code: string;
  title: string;
  description: string | null;
  sortOrder: number;
  sceneUrl: string;
  liteSceneUrl: string | null;
  posterUrl: string;
  sceneBytes: number;
  liteSceneBytes: number | null;
  cameraBaseline: ShowroomCameraBaselineInput;
  portals: ShowroomPortalInput[];
  lightingPreset: LightingPresetInput;
  hotspots: ShowroomHotspotPublicDto[];
}

export interface ShowroomScenesResponseDto {
  zones: ShowroomZonePublicDto[];
}

export interface AdminShowroomHotspotDto {
  id: string;
  zoneId: string;
  productId: string;
  productSlug: string;
  productName: string;
  productStatus: ProductStatusInput;
  variantId: string | null;
  label: string;
  positionX: number;
  positionY: number;
  positionZ: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminShowroomZoneDto {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: ShowroomZoneStatusInput;
  sortOrder: number;
  sceneObjectKey: string;
  liteSceneObjectKey: string | null;
  posterKey: string;
  sceneUrl: string;
  liteSceneUrl: string | null;
  posterUrl: string;
  sceneBytes: number;
  liteSceneBytes: number | null;
  cameraBaseline: ShowroomCameraBaselineInput;
  portals: ShowroomPortalInput[];
  config: Record<string, unknown>;
  publishedAt: string | null;
  createdBy: string | null;
  hotspots: AdminShowroomHotspotDto[];
  createdAt: string;
  updatedAt: string;
}

export interface OutfitCompatibilityConfigDto {
  rigId: string;
  skeletonVersion: string;
  slot: OutfitSlotInput;
  anchor: OutfitAnchorInput;
  incompatibleSlots: OutfitSlotInput[];
}

export interface OutfitCompatibilityViolationDto {
  slot: OutfitSlotInput | 'rig';
  productId: string | null;
  reason: OutfitCompatibilityReason;
  message: string;
}

export interface OutfitRigContractDto {
  rigId: string;
  skeletonVersion: string;
  slots: readonly OutfitSlotInput[];
  anchors: Record<OutfitSlotInput, readonly OutfitAnchorInput[]>;
  modelUrl: string;
  mobileModelUrl: string | null;
  posterUrl: string;
}

export interface OutfitStudioGarmentVariantDto {
  id: string;
  sku: string;
  size: string;
  color: string;
  colorHex: string | null;
  priceIdr: number;
  compareAtPriceIdr: number | null;
  availableQty: number;
  inStock: boolean;
}

export interface OutfitStudioGarmentDto {
  productId: string;
  productSlug: string;
  productName: string;
  material: string;
  fit: string;
  assetId: string;
  assetVersion: number;
  modelUrl: string;
  mobileModelUrl: string | null;
  posterUrl: string;
  compatibility: OutfitCompatibilityConfigDto;
  materialSlots: MaterialSlotSpecDto[];
  variants: OutfitStudioGarmentVariantDto[];
  customizationPresets: CustomizationPresetDto[];
}

export interface OutfitScenePersistedItemDto {
  slot: OutfitSlotInput;
  productId: string;
  variantId: string;
  assetId: string;
  presetId: string | null;
}

export interface OutfitSceneSlotHydratedDto {
  slot: OutfitSlotInput;
  productId: string;
  productSlug: string | null;
  productName: string;
  variantId: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  assetId: string;
  presetId: string | null;
  presetCode: string | null;
  presetLabel: string | null;
  swatchHex: string | null;
  unitPriceIdr: number;
  availableQty: number;
  inStock: boolean;
  posterUrl: string | null;
  stale: boolean;
  staleReasons: string[];
}

export interface OutfitSceneDto {
  id: string;
  title: string;
  rigId: string;
  skeletonVersion: string;
  isPublicPreset: boolean;
  slots: OutfitSceneSlotHydratedDto[];
  liveTotalIdr: number;
  hasStaleItems: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OutfitStudioCatalogDto {
  rig: OutfitRigContractDto;
  garments: OutfitStudioGarmentDto[];
  publicPresets: OutfitSceneDto[];
}

export interface ValidateOutfitResultDto {
  valid: true;
  rigId: string;
  skeletonVersion: string;
  slotCount: number;
}

export interface AddOutfitToCartItemResultDto {
  slot: OutfitSlotInput;
  variantId: string;
  productId: string;
  status: 'ADDED' | 'OUT_OF_STOCK' | 'INACTIVE';
  reason: string | null;
}

export interface AddOutfitToCartResultDto {
  cart: CartDto;
  results: AddOutfitToCartItemResultDto[];
}

export interface AdminOutfitGarmentDiagnosticDto {
  assetId: string;
  productId: string;
  productSlug: string;
  productName: string;
  productStatus: ProductStatusInput;
  assetStatus: AssetStatusInput;
  isActiveVersion: boolean;
  version: number;
  posterUrl: string;
  compatibility: OutfitCompatibilityConfigDto | null;
  compatibleWithCurrentRig: boolean;
  diagnosticMessage: string | null;
}
