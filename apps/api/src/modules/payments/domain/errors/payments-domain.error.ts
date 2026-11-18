export class PaymentsDomainError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Array<{ field?: string; issue: string }>,
  ) {
    super(message);
    this.name = 'PaymentsDomainError';
  }
}
