import {
  HttpStatus,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import type { z } from 'zod';
import { DomainHttpException, type ApiErrorDetail } from '../../common/http/domain-http.exception.js';

@Injectable()
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): z.infer<TSchema> {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    const details: ApiErrorDetail[] = result.error.issues.map((issue) => ({
      field: issue.path.length > 0 ? issue.path.join('.') : 'body',
      issue: issue.message,
    }));

    throw new DomainHttpException(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      'Request validation failed',
      details,
    );
  }
}
