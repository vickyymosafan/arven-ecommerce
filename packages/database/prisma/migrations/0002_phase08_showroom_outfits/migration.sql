-- CreateEnum
CREATE TYPE "ShowroomZoneStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "showroom_zones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(64) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "status" "ShowroomZoneStatus" NOT NULL DEFAULT 'DRAFT',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "scene_object_key" VARCHAR(512) NOT NULL,
    "lite_scene_object_key" VARCHAR(512),
    "poster_key" VARCHAR(512) NOT NULL,
    "scene_bytes" BIGINT NOT NULL,
    "lite_scene_bytes" BIGINT,
    "camera_baseline" JSONB NOT NULL DEFAULT '{}',
    "portals" JSONB NOT NULL DEFAULT '[]',
    "config" JSONB NOT NULL DEFAULT '{}',
    "published_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "showroom_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showroom_hotspots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "zone_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "label" VARCHAR(120) NOT NULL,
    "position_x" DOUBLE PRECISION NOT NULL,
    "position_y" DOUBLE PRECISION NOT NULL,
    "position_z" DOUBLE PRECISION NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "showroom_hotspots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "showroom_zones_code_key" ON "showroom_zones"("code");

-- CreateIndex
CREATE UNIQUE INDEX "showroom_zones_scene_object_key_key" ON "showroom_zones"("scene_object_key");

-- CreateIndex
CREATE INDEX "showroom_zones_status_sort_order_idx" ON "showroom_zones"("status", "sort_order");

-- CreateIndex
CREATE INDEX "showroom_hotspots_zone_id_is_active_sort_order_idx" ON "showroom_hotspots"("zone_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "showroom_hotspots_zone_id_product_id_key" ON "showroom_hotspots"("zone_id", "product_id");

-- AddForeignKey
ALTER TABLE "showroom_zones" ADD CONSTRAINT "showroom_zones_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_hotspots" ADD CONSTRAINT "showroom_hotspots_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "showroom_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_hotspots" ADD CONSTRAINT "showroom_hotspots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showroom_hotspots" ADD CONSTRAINT "showroom_hotspots_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Manual SQL CHECK Constraints (Phase 08 — DATA_MODEL.md §6, PHASE_08_PLAN.md §5.1)
-- ============================================================================

ALTER TABLE "showroom_zones"
  ADD CONSTRAINT chk_showroom_zone_code_format CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT chk_showroom_zone_sort_nonneg CHECK (sort_order >= 0),
  ADD CONSTRAINT chk_showroom_zone_scene_bytes CHECK (scene_bytes > 0 AND scene_bytes <= 6291456),
  ADD CONSTRAINT chk_showroom_zone_lite_bytes CHECK (lite_scene_bytes IS NULL OR (lite_scene_bytes > 0 AND lite_scene_bytes <= 3670016)),
  ADD CONSTRAINT chk_showroom_zone_camera_object CHECK (jsonb_typeof(camera_baseline) = 'object'),
  ADD CONSTRAINT chk_showroom_zone_portals_array CHECK (jsonb_typeof(portals) = 'array'),
  ADD CONSTRAINT chk_showroom_zone_published_at CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL);

ALTER TABLE "showroom_hotspots"
  ADD CONSTRAINT chk_showroom_hotspot_position CHECK (abs(position_x) <= 50 AND position_y >= 0 AND position_y <= 10 AND abs(position_z) <= 50),
  ADD CONSTRAINT chk_showroom_hotspot_sort_nonneg CHECK (sort_order >= 0);

ALTER TABLE "outfit_scenes"
  ADD CONSTRAINT chk_outfit_items_shape CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 5),
  ADD CONSTRAINT chk_outfit_owner_or_public CHECK (user_id IS NOT NULL OR is_public_preset = true),
  ADD CONSTRAINT chk_outfit_rig_format CHECK (mannequin_rig_version ~ '^arven_mannequin_[a-z0-9_]+$'),
  ADD CONSTRAINT chk_outfit_items_no_price CHECK (
    NOT jsonb_path_exists(items, '$[*].keyvalue() ? (@.key like_regex "price|amount|total|discount" flag "i")')
  );

