import { HttpException } from '@nestjs/common';

export interface ApiErrorDetail {
  field?: string;
  issue: string;
}

export class DomainHttpException extends HttpException {
  constructor(
    status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ApiErrorDetail[],
  ) {
    super(
      {
        code,
        message,
        ...(details && details.length > 0 ? { details } : {}),
      },
      status,
    );
    this.name = 'DomainHttpException';
  }
}
