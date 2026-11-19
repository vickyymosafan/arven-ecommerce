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
  Put,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  AdminOutfitGarmentDiagnosticDto,
  AdminShowroomHotspotDto,
  AdminShowroomZoneDto,
  OutfitSceneDto,
} from '@arven/contracts';
import {
  createPublicOutfitPresetRequestSchema,
  createShowroomHotspotRequestSchema,
  createShowroomZoneRequestSchema,
  setAssetOutfitCompatibilityRequestSchema,
  transitionShowroomZoneRequestSchema,
  updatePublicOutfitPresetRequestSchema,
  updateShowroomHotspotRequestSchema,
  updateShowroomZoneRequestSchema,
  uuidSchema,
  type CreatePublicOutfitPresetRequest,
  type CreateShowroomHotspotRequest,
  type CreateShowroomZoneRequest,
  type SetAssetOutfitCompatibilityRequest,
  type TransitionShowroomZoneRequest,
  type UpdatePublicOutfitPresetRequest,
  type UpdateShowroomHotspotRequest,
  type UpdateShowroomZoneRequest,
} from '@arven/validators';
import {
  AdminAuth,
  AuditAction,
  CurrentActor,
  RequirePermissions,
  extractClientIp,
  markAuditRecordedInTransaction,
  type AuthenticatedActor,
  type HttpRequestLike,
} from '../../../common/security/index.js';
import { OutfitStudioService } from '../application/services/outfit-studio.service.js';
import { ShowroomService } from '../application/services/showroom.service.js';

@ApiTags('Admin Experiences')
@Controller('admin')
@AdminAuth()
export class AdminExperiencesController {
  constructor(
    @Inject(ShowroomService) private readonly showroomService: ShowroomService,
    @Inject(OutfitStudioService)
    private readonly outfitStudioService: OutfitStudioService,
  ) {}

  // ===========================================================================
  // Showroom Zones & Hotspots
  // ===========================================================================

  @Get('showroom/zones')
  @RequirePermissions('asset.read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List all showroom zones (DRAFT, PUBLISHED, ARCHIVED)' })
  async listShowroomZones(): Promise<AdminShowroomZoneDto[]> {
    return this.showroomService.listAdminZones();
  }

  @Get('showroom/zones/:id')
  @RequirePermissions('asset.read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get showroom zone detail and hotspots' })
  async getShowroomZone(
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<AdminShowroomZoneDto> {
    return this.showroomService.getAdminZone(id);
  }

  @Post('showroom/zones')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('asset.publish')
  @Header('Cache-Control', 'no-store')
  @AuditAction('showroom.zone.created', 'ShowroomZone')
  @ApiOperation({
    summary:
      'Create a showroom zone with deterministic server-generated architectural GLB binaries',
  })
  async createShowroomZone(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Body({ schema: createShowroomZoneRequestSchema }) body: CreateShowroomZoneRequest,
  ): Promise<AdminShowroomZoneDto> {
    markAuditRecordedInTransaction(req);
    return this.showroomService.createAdminZone(actor, body, extractClientIp(req));
  }

  @Patch('showroom/zones/:id')
  @RequirePermissions('asset.publish')
  @Header('Cache-Control', 'no-store')
  @AuditAction('showroom.zone.updated', 'ShowroomZone')
  @ApiOperation({ summary: 'Update showroom zone metadata, portals, or camera baseline' })
  async updateShowroomZone(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateShowroomZoneRequestSchema }) body: UpdateShowroomZoneRequest,
  ): Promise<AdminShowroomZoneDto> {
    markAuditRecordedInTransaction(req);
    return this.showroomService.updateAdminZone(actor, id, body, extractClientIp(req));
  }

  @Post('showroom/zones/:id/transition')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('asset.publish')
  @Header('Cache-Control', 'no-store')
  @AuditAction('showroom.zone.transitioned', 'ShowroomZone')
  @ApiOperation({
    summary: 'Transition showroom zone status (DRAFT -> PUBLISHED -> ARCHIVED -> DRAFT)',
  })
  async transitionShowroomZone(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: transitionShowroomZoneRequestSchema })
    body: TransitionShowroomZoneRequest,
  ): Promise<AdminShowroomZoneDto> {
    markAuditRecordedInTransaction(req);
    return this.showroomService.transitionAdminZone(
      actor,
      id,
      body,
      extractClientIp(req),
    );
  }

  @Post('showroom/zones/:id/hotspots')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('asset.publish')
  @Header('Cache-Control', 'no-store')
  @AuditAction('showroom.hotspot.created', 'ShowroomHotspot')
  @ApiOperation({ summary: 'Create a product hotspot inside a showroom zone' })
  async createShowroomHotspot(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) zoneId: string,
    @Body({ schema: createShowroomHotspotRequestSchema })
    body: CreateShowroomHotspotRequest,
  ): Promise<AdminShowroomHotspotDto> {
    markAuditRecordedInTransaction(req);
    return this.showroomService.createAdminHotspot(
      actor,
      zoneId,
      body,
      extractClientIp(req),
    );
  }

  @Patch('showroom/hotspots/:id')
  @RequirePermissions('asset.publish')
  @Header('Cache-Control', 'no-store')
  @AuditAction('showroom.hotspot.updated', 'ShowroomHotspot')
  @ApiOperation({ summary: 'Update a showroom product hotspot' })
  async updateShowroomHotspot(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) hotspotId: string,
    @Body({ schema: updateShowroomHotspotRequestSchema })
    body: UpdateShowroomHotspotRequest,
  ): Promise<AdminShowroomHotspotDto> {
    markAuditRecordedInTransaction(req);
    return this.showroomService.updateAdminHotspot(
      actor,
      hotspotId,
      body,
      extractClientIp(req),
    );
  }

  @Delete('showroom/hotspots/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('asset.publish')
  @Header('Cache-Control', 'no-store')
  @AuditAction('showroom.hotspot.deleted', 'ShowroomHotspot')
  @ApiOperation({ summary: 'Delete a showroom product hotspot' })
  async deleteShowroomHotspot(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) hotspotId: string,
  ): Promise<void> {
    markAuditRecordedInTransaction(req);
    await this.showroomService.deleteAdminHotspot(
      actor,
      hotspotId,
      extractClientIp(req),
    );
  }

  // ===========================================================================
  // Outfit Studio Compatibility & Public Presets
  // ===========================================================================

  @Get('outfit-studio/garments')
  @RequirePermissions('asset.read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'List all active READY 3D assets with Outfit Studio compatibility diagnostics',
  })
  async listOutfitStudioGarments(): Promise<AdminOutfitGarmentDiagnosticDto[]> {
    return this.outfitStudioService.listAdminGarments();
  }

  @Put('3d-assets/:id/outfit-compatibility')
  @RequirePermissions('asset.publish')
  @Header('Cache-Control', 'no-store')
  @AuditAction('asset.outfit_compatibility.updated', 'Product3DAsset')
  @ApiOperation({
    summary: 'Assign or update Outfit Studio rig/slot/anchor compatibility config on a 3D asset',
  })
  async setAssetOutfitCompatibility(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) assetId: string,
    @Body({ schema: setAssetOutfitCompatibilityRequestSchema })
    body: SetAssetOutfitCompatibilityRequest,
  ): Promise<AdminOutfitGarmentDiagnosticDto> {
    markAuditRecordedInTransaction(req);
    return this.outfitStudioService.setAssetOutfitCompatibility(
      actor,
      assetId,
      body,
      extractClientIp(req),
    );
  }

  @Delete('3d-assets/:id/outfit-compatibility')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('asset.publish')
  @Header('Cache-Control', 'no-store')
  @AuditAction('asset.outfit_compatibility.removed', 'Product3DAsset')
  @ApiOperation({
    summary: 'Remove Outfit Studio compatibility config from a 3D asset',
  })
  async removeAssetOutfitCompatibility(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) assetId: string,
  ): Promise<void> {
    markAuditRecordedInTransaction(req);
    await this.outfitStudioService.removeAssetOutfitCompatibility(
      actor,
      assetId,
      extractClientIp(req),
    );
  }

  @Get('outfit-studio/presets')
  @RequirePermissions('asset.read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'List curated public Outfit Studio presets' })
  async listPublicPresets(): Promise<OutfitSceneDto[]> {
    return this.outfitStudioService.listAdminPublicPresets();
  }

  @Post('outfit-studio/presets')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('asset.publish')
  @Header('Cache-Control', 'no-store')
  @AuditAction('outfit.preset.created', 'OutfitScene')
  @ApiOperation({ summary: 'Create a curated public Outfit Studio preset' })
  async createPublicPreset(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Body({ schema: createPublicOutfitPresetRequestSchema })
    body: CreatePublicOutfitPresetRequest,
  ): Promise<OutfitSceneDto> {
    markAuditRecordedInTransaction(req);
    return this.outfitStudioService.createAdminPublicPreset(
      actor,
      body,
      extractClientIp(req),
    );
  }

  @Patch('outfit-studio/presets/:id')
  @RequirePermissions('asset.publish')
  @Header('Cache-Control', 'no-store')
  @AuditAction('outfit.preset.updated', 'OutfitScene')
  @ApiOperation({ summary: 'Update a curated public Outfit Studio preset' })
  async updatePublicPreset(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) presetId: string,
    @Body({ schema: updatePublicOutfitPresetRequestSchema })
    body: UpdatePublicOutfitPresetRequest,
  ): Promise<OutfitSceneDto> {
    markAuditRecordedInTransaction(req);
    return this.outfitStudioService.updateAdminPublicPreset(
      actor,
      presetId,
      body,
      extractClientIp(req),
    );
  }

  @Delete('outfit-studio/presets/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('asset.publish')
  @Header('Cache-Control', 'no-store')
  @AuditAction('outfit.preset.deleted', 'OutfitScene')
  @ApiOperation({ summary: 'Delete a curated public Outfit Studio preset' })
  async deletePublicPreset(
    @Req() req: HttpRequestLike,
    @CurrentActor() actor: AuthenticatedActor,
    @Param('id', { schema: uuidSchema }) presetId: string,
  ): Promise<void> {
    markAuditRecordedInTransaction(req);
    await this.outfitStudioService.deleteAdminPublicPreset(
      actor,
      presetId,
      extractClientIp(req),
    );
  }
}
