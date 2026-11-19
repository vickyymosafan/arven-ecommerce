import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ShowroomScenesResponseDto } from '@arven/contracts';
import { showroomZoneCodeParamSchema } from '@arven/validators';
import { SkipEnvelope } from '../../../common/http/index.js';
import { Public } from '../../../common/security/index.js';
import { ShowroomService } from '../application/services/showroom.service.js';

@ApiTags('Showroom')
@Controller('showroom')
export class ShowroomController {
  constructor(
    @Inject(ShowroomService) private readonly showroomService: ShowroomService,
  ) {}

  @Get('scenes')
  @Public()
  @ApiOperation({
    summary: 'List published showroom zones, camera baselines, portals, and active hotspots with live IDR pricing',
  })
  async listPublishedScenes(): Promise<ShowroomScenesResponseDto> {
    return this.showroomService.listPublishedScenes();
  }

  @Get('zones/:code/scene')
  @Public()
  @SkipEnvelope()
  @Header('Content-Type', 'model/gltf-binary')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @ApiOperation({ summary: 'Stream published showroom zone default GLB binary' })
  async getZoneSceneBinary(
    @Param('code', { schema: showroomZoneCodeParamSchema }) code: string,
  ): Promise<StreamableFile> {
    const { buffer } = await this.showroomService.readPublishedZoneBinary(
      code,
      'default',
    );
    return new StreamableFile(buffer);
  }

  @Get('zones/:code/scene-lite')
  @Public()
  @SkipEnvelope()
  @Header('Content-Type', 'model/gltf-binary')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @ApiOperation({ summary: 'Stream published showroom zone mobile lite GLB binary' })
  async getZoneLiteSceneBinary(
    @Param('code', { schema: showroomZoneCodeParamSchema }) code: string,
  ): Promise<StreamableFile> {
    const { buffer } = await this.showroomService.readPublishedZoneBinary(code, 'lite');
    return new StreamableFile(buffer);
  }

  @Get('zones/:code/poster')
  @Public()
  @SkipEnvelope()
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @ApiOperation({ summary: 'Serve published showroom zone poster image' })
  async getZonePoster(
    @Param('code', { schema: showroomZoneCodeParamSchema }) code: string,
    @Res({ passthrough: true }) res: { setHeader(name: string, value: string): void },
  ): Promise<StreamableFile> {
    const { buffer, contentType } = await this.showroomService.readPublishedZoneBinary(
      code,
      'poster',
    );
    res.setHeader('Content-Type', contentType);
    return new StreamableFile(buffer);
  }
}
