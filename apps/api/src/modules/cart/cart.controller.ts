import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CartDto, MergeCartResultDto } from '@arven/contracts';
import {
  addCartItemRequestSchema,
  updateCartItemRequestSchema,
  uuidSchema,
  type AddCartItemRequest,
  type UpdateCartItemRequest,
} from '@arven/validators';
import {
  AuditAction,
  CurrentActor,
  CustomerAuth,
  Public,
  extractClientIp,
  markAuditRecordedInTransaction,
  type AuthenticatedActor,
  type HttpRequestLike,
  type HttpResponseLike,
} from '../../common/security/index.js';
import { CartService } from './cart.service.js';

@ApiTags('Cart')
@Controller('cart')
export class CartController {
  constructor(@Inject(CartService) private readonly cartService: CartService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get active customer or guest cart with live IDR pricing and stock status' })
  async getCart(@Req() req: HttpRequestLike): Promise<CartDto> {
    return this.cartService.getCart(req);
  }

  @Post('items')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add a variant line item to customer or guest cart' })
  async addItem(
    @Req() req: HttpRequestLike,
    @Res({ passthrough: true }) res: HttpResponseLike,
    @Body({ schema: addCartItemRequestSchema }) body: AddCartItemRequest,
  ): Promise<CartDto> {
    return this.cartService.addItem(req, res, body);
  }

  @Patch('items/:id')
  @Public()
  @ApiOperation({ summary: 'Update quantity on an existing cart line item' })
  async updateItem(
    @Req() req: HttpRequestLike,
    @Param('id', { schema: uuidSchema }) id: string,
    @Body({ schema: updateCartItemRequestSchema }) body: UpdateCartItemRequest,
  ): Promise<CartDto> {
    return this.cartService.updateItem(req, id, body);
  }

  @Delete('items/:id')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a line item from the caller active cart' })
  async deleteItem(
    @Req() req: HttpRequestLike,
    @Param('id', { schema: uuidSchema }) id: string,
  ): Promise<void> {
    await this.cartService.deleteItem(req, id);
  }

  @Post('merge')
  @CustomerAuth()
  @HttpCode(HttpStatus.OK)
  @AuditAction('cart.merged', 'cart')
  @ApiOperation({ summary: 'Merge guest cart into authenticated customer cart' })
  async mergeCart(
    @Req() req: HttpRequestLike,
    @Res({ passthrough: true }) res: HttpResponseLike,
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<MergeCartResultDto> {
    markAuditRecordedInTransaction(req);
    return this.cartService.mergeGuestCart({
      req,
      res,
      actor,
      ipAddress: extractClientIp(req),
    });
  }
}
