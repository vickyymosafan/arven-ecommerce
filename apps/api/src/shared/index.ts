export { ConfigModule, RUNTIME_CONFIG } from './config/config.module.js';
export { PrismaModule } from './prisma/prisma.module.js';
export { PrismaService } from './prisma/prisma.service.js';
export { RedisModule, REDIS_CLIENT } from './redis/redis.module.js';
export { AdaptersModule } from './adapters/adapters.module.js';
export {
  EMAIL_PROVIDER,
  LocalCaptureEmailAdapter,
  SmtpEmailAdapter,
  createEmailProvider,
  renderTransactionalTemplate,
  type EmailProvider,
  type EmailSendResult,
  type TemplateEmailInput,
  type TransactionalEmailInput,
} from './adapters/email.provider.js';
export {
  STORAGE_PROVIDER,
  LocalFsStorageAdapter,
  S3StorageAdapter,
  createStorageProvider,
  type DeleteObjectInput,
  type HeadObjectInput,
  type HeadObjectResult,
  type ObjectStorageProvider,
  type PresignedUploadInput,
  type PresignedUploadResult,
  type PublishAssetInput,
  type PublishAssetResult,
  type StorageScope,
} from './adapters/storage.provider.js';
