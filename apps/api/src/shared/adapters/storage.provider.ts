import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RuntimeConfig } from '@arven/config';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const STORAGE_PROVIDER = Symbol('ARVEN_STORAGE_PROVIDER');

export type StorageScope = 'staging' | 'public';

export interface PresignedUploadInput {
  key: string;
  contentType: string;
  contentLength?: number;
  expiresInSeconds?: number;
  scope?: StorageScope;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  method: 'PUT';
  key: string;
  headers: Record<string, string>;
  expiresAtUtc: string;
}

export interface HeadObjectInput {
  key: string;
  scope?: StorageScope;
}

export interface HeadObjectResult {
  exists: boolean;
  key: string;
  sizeBytes?: number;
  contentType?: string;
  eTag?: string;
}

export interface DeleteObjectInput {
  key: string;
  scope?: StorageScope;
}

export interface PublishAssetInput {
  stagingKey: string;
  publicKey: string;
  contentType?: string;
}

export interface PublishAssetResult {
  publicKey: string;
  publicUrl: string;
}

export interface PutBufferInput {
  key: string;
  body: Uint8Array | Buffer;
  contentType?: string;
  scope?: StorageScope;
}

export interface ReadBufferInput {
  key: string;
  scope?: StorageScope;
}

export interface ObjectStorageProvider {
  createPresignedUpload(input: PresignedUploadInput): Promise<PresignedUploadResult>;
  headObject(input: HeadObjectInput): Promise<HeadObjectResult>;
  deleteObject(input: DeleteObjectInput): Promise<void>;
  publishAsset(input: PublishAssetInput): Promise<PublishAssetResult>;
  putBuffer(input: PutBufferInput): Promise<void>;
  readBuffer(input: ReadBufferInput): Promise<Buffer>;
}

function findWorkspaceRoot(): string {
  let current = path.resolve(import.meta.dirname);
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.resolve(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return process.cwd();
}

function validateObjectKey(key: string): string[] {
  if (!key || key.length > 512) {
    throw new Error('Invalid storage object key');
  }
  if (key.includes('\0') || key.includes('\\') || key.startsWith('/')) {
    throw new Error('Storage object key contains forbidden characters or leading slash');
  }
  if (/^[a-zA-Z]:/.test(key)) {
    throw new Error('Storage object key must not contain drive prefixes');
  }
  const segments = key.split('/');
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') {
      throw new Error('Storage object key contains path traversal segment');
    }
  }
  return segments;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export class LocalFsStorageAdapter implements ObjectStorageProvider {
  private readonly baseDir: string;
  private readonly publicBaseUrl: string;

  constructor(options: { baseDir: string; publicBaseUrl: string; nodeEnv: string }) {
    if (options.nodeEnv === 'production') {
      throw new Error('LocalFsStorageAdapter is strictly forbidden when NODE_ENV=production');
    }
    this.baseDir = path.isAbsolute(options.baseDir)
      ? path.resolve(options.baseDir)
      : path.resolve(findWorkspaceRoot(), options.baseDir);
    this.publicBaseUrl = trimTrailingSlash(options.publicBaseUrl);
  }

  public resolveSafePath(scope: StorageScope, key: string): string {
    const segments = validateObjectKey(key);
    const scopeRoot = path.resolve(this.baseDir, scope);
    const resolvedTarget = path.resolve(scopeRoot, ...segments);
    const relative = path.relative(scopeRoot, resolvedTarget);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Resolved storage path escapes root containment');
    }
    return resolvedTarget;
  }

  private async ensureContainedRealPath(scope: StorageScope, targetPath: string): Promise<void> {
    const scopeRoot = path.resolve(this.baseDir, scope);
    try {
      const realRoot = await realpath(scopeRoot);
      const realTarget = await realpath(targetPath);
      const rel = path.relative(realRoot, realTarget);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error('Realpath storage target escapes root containment');
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async createPresignedUpload(input: PresignedUploadInput): Promise<PresignedUploadResult> {
    const scope = input.scope ?? 'staging';
    const targetPath = this.resolveSafePath(scope, input.key);
    await mkdir(path.dirname(targetPath), { recursive: true });
    const ttlSeconds = input.expiresInSeconds ?? 300;
    const expiresAtUtc = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    return {
      uploadUrl: `${this.publicBaseUrl}/_local-staging/${encodeURIComponent(scope)}/${input.key}`,
      method: 'PUT',
      key: input.key,
      headers: {
        'Content-Type': input.contentType,
      },
      expiresAtUtc,
    };
  }

  async headObject(input: HeadObjectInput): Promise<HeadObjectResult> {
    const scope = input.scope ?? 'staging';
    const targetPath = this.resolveSafePath(scope, input.key);
    await this.ensureContainedRealPath(scope, targetPath);
    try {
      const stats = await stat(targetPath);
      if (!stats.isFile()) {
        return { exists: false, key: input.key };
      }
      return {
        exists: true,
        key: input.key,
        sizeBytes: stats.size,
      };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { exists: false, key: input.key };
      }
      throw error;
    }
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    const scope = input.scope ?? 'staging';
    const targetPath = this.resolveSafePath(scope, input.key);
    await this.ensureContainedRealPath(scope, targetPath);
    try {
      await unlink(targetPath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async publishAsset(input: PublishAssetInput): Promise<PublishAssetResult> {
    const stagingPath = this.resolveSafePath('staging', input.stagingKey);
    const publicPath = this.resolveSafePath('public', input.publicKey);
    await this.ensureContainedRealPath('staging', stagingPath);
    await mkdir(path.dirname(publicPath), { recursive: true });

    const tempPath = `${publicPath}.${randomUUID()}.tmp`;
    await copyFile(stagingPath, tempPath);
    await rename(tempPath, publicPath);

    return {
      publicKey: input.publicKey,
      publicUrl: `${this.publicBaseUrl}/${input.publicKey}`,
    };
  }

  async putBuffer(input: PutBufferInput): Promise<void> {
    const scope = input.scope ?? 'staging';
    const targetPath = this.resolveSafePath(scope, input.key);
    await mkdir(path.dirname(targetPath), { recursive: true });
    const tempPath = `${targetPath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, input.body);
    await rename(tempPath, targetPath);
  }

  async readBuffer(input: ReadBufferInput): Promise<Buffer> {
    const scope = input.scope ?? 'staging';
    const targetPath = this.resolveSafePath(scope, input.key);
    await this.ensureContainedRealPath(scope, targetPath);
    return readFile(targetPath);
  }
}

export class S3StorageAdapter implements ObjectStorageProvider {
  private readonly client: S3Client;
  private readonly stagingBucket: string;
  private readonly publicBucket: string;
  private readonly publicBaseUrl: string;

  constructor(config: RuntimeConfig) {
    if (!config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) {
      throw new Error('S3 credentials are required when STORAGE_DRIVER=s3');
    }
    this.stagingBucket = config.S3_BUCKET_STAGING;
    this.publicBucket = config.S3_BUCKET_PUBLIC;
    this.publicBaseUrl = trimTrailingSlash(config.PUBLIC_ASSET_BASE_URL);
    this.client = new S3Client({
      region: config.S3_REGION,
      ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  private bucketFor(scope: StorageScope): string {
    return scope === 'public' ? this.publicBucket : this.stagingBucket;
  }

  async createPresignedUpload(input: PresignedUploadInput): Promise<PresignedUploadResult> {
    validateObjectKey(input.key);
    const scope = input.scope ?? 'staging';
    const ttlSeconds = input.expiresInSeconds ?? 300;
    const command = new PutObjectCommand({
      Bucket: this.bucketFor(scope),
      Key: input.key,
      ContentType: input.contentType,
      ...(input.contentLength !== undefined ? { ContentLength: input.contentLength } : {}),
    });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: ttlSeconds });

    return {
      uploadUrl,
      method: 'PUT',
      key: input.key,
      headers: {
        'Content-Type': input.contentType,
      },
      expiresAtUtc: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
  }

  async headObject(input: HeadObjectInput): Promise<HeadObjectResult> {
    validateObjectKey(input.key);
    const scope = input.scope ?? 'staging';
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketFor(scope),
          Key: input.key,
        }),
      );
      return {
        exists: true,
        key: input.key,
        ...(response.ContentLength !== undefined ? { sizeBytes: response.ContentLength } : {}),
        ...(response.ContentType ? { contentType: response.ContentType } : {}),
        ...(response.ETag ? { eTag: response.ETag } : {}),
      };
    } catch (error: unknown) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      const name = (error as { name?: string }).name;
      if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') {
        return { exists: false, key: input.key };
      }
      throw error;
    }
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    validateObjectKey(input.key);
    const scope = input.scope ?? 'staging';
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketFor(scope),
        Key: input.key,
      }),
    );
  }

  async publishAsset(input: PublishAssetInput): Promise<PublishAssetResult> {
    validateObjectKey(input.stagingKey);
    validateObjectKey(input.publicKey);
    const copySource = `${this.stagingBucket}/${input.stagingKey
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')}`;
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.publicBucket,
        Key: input.publicKey,
        CopySource: copySource,
        ...(input.contentType
          ? { ContentType: input.contentType, MetadataDirective: 'REPLACE' }
          : {}),
      }),
    );

    return {
      publicKey: input.publicKey,
      publicUrl: `${this.publicBaseUrl}/${input.publicKey}`,
    };
  }

  async putBuffer(input: PutBufferInput): Promise<void> {
    validateObjectKey(input.key);
    const scope = input.scope ?? 'staging';
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketFor(scope),
        Key: input.key,
        Body: input.body,
        ...(input.contentType ? { ContentType: input.contentType } : {}),
      }),
    );
  }

  async readBuffer(input: ReadBufferInput): Promise<Buffer> {
    validateObjectKey(input.key);
    const scope = input.scope ?? 'staging';
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketFor(scope),
        Key: input.key,
      }),
    );
    if (!response.Body) {
      throw new Error(`Missing S3 object body for key ${input.key}`);
    }
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }
}

export function createStorageProvider(config: RuntimeConfig): ObjectStorageProvider {
  if (config.STORAGE_DRIVER === 'local_fs') {
    return new LocalFsStorageAdapter({
      baseDir: config.STORAGE_LOCAL_DIR,
      publicBaseUrl: config.PUBLIC_ASSET_BASE_URL,
      nodeEnv: config.NODE_ENV,
    });
  }
  return new S3StorageAdapter(config);
}
