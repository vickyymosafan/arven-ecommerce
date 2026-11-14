import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LocalCaptureEmailAdapter } from '../../src/shared/adapters/email.provider.js';
import { LocalFsStorageAdapter } from '../../src/shared/adapters/storage.provider.js';

describe('Local adapters fail-closed & path containment guards', () => {
  const tempDirs: string[] = [];

  afterAll(async () => {
    await Promise.all(
      tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it('rejects LocalCaptureEmailAdapter when NODE_ENV=production', () => {
    expect(
      () =>
        new LocalCaptureEmailAdapter({
          captureDir: './.local/emails',
          defaultFrom: 'ARVEN <noreply@arven.test>',
          nodeEnv: 'production',
        }),
    ).toThrow(/production/i);
  });

  it('writes atomic .json and .html capture files and HTML-escapes template variables', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'arven-api-mail-'));
    tempDirs.push(dir);

    const adapter = new LocalCaptureEmailAdapter({
      captureDir: dir,
      defaultFrom: 'ARVEN <noreply@arven.test>',
      nodeEnv: 'test',
    });

    const result = await adapter.sendTemplate({
      to: 'member@example.com',
      template: 'auth.password_reset.requested',
      subject: 'Reset password',
      variables: {
        recipientName: '<script>alert(1)</script>',
        actionUrl: 'https://arven.test/reset?token=secret-token-value',
      },
    });

    expect(result.driver).toBe('local_capture');
    expect(result.captureFilePath).toBeDefined();

    const json = JSON.parse(await readFile(result.captureFilePath!, 'utf8')) as {
      to: string;
      htmlFile: string;
    };
    expect(json.to).toBe('member@example.com');

    const html = await readFile(path.join(dir, json.htmlFile), 'utf8');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('rejects LocalFsStorageAdapter when NODE_ENV=production', () => {
    expect(
      () =>
        new LocalFsStorageAdapter({
          baseDir: './.local/storage',
          publicBaseUrl: 'http://localhost:4000/assets',
          nodeEnv: 'production',
        }),
    ).toThrow(/production/i);
  });

  it('blocks path traversal and forbidden keys in LocalFsStorageAdapter', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'arven-api-storage-'));
    tempDirs.push(dir);

    const storage = new LocalFsStorageAdapter({
      baseDir: dir,
      publicBaseUrl: 'http://localhost:4000/assets',
      nodeEnv: 'test',
    });

    const maliciousKeys = [
      '../outside.txt',
      'products/../../secret.env',
      '/etc/passwd',
      'C:\\Windows\\system.ini',
      'dir\\file.glb',
      'file\0.glb',
      '',
    ];

    for (const badKey of maliciousKeys) {
      expect(() => storage.resolveSafePath('staging', badKey)).toThrow();
      await expect(
        storage.createPresignedUpload({
          key: badKey,
          contentType: 'model/gltf-binary',
        }),
      ).rejects.toThrow();
    }
  });

  it('heads, publishes atomically, and deletes contained assets in LocalFsStorageAdapter', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'arven-api-storage-ops-'));
    tempDirs.push(dir);

    const storage = new LocalFsStorageAdapter({
      baseDir: dir,
      publicBaseUrl: 'http://localhost:4000/assets',
      nodeEnv: 'test',
    });

    const upload = await storage.createPresignedUpload({
      key: 'models/atelier-coat.glb',
      contentType: 'model/gltf-binary',
    });
    expect(upload.method).toBe('PUT');

    const stagingPath = storage.resolveSafePath('staging', 'models/atelier-coat.glb');
    await writeFile(stagingPath, Buffer.from('glTF-binary-stub'));

    const headBefore = await storage.headObject({
      key: 'models/atelier-coat.glb',
      scope: 'staging',
    });
    expect(headBefore.exists).toBe(true);
    expect(headBefore.sizeBytes).toBe(16);

    const published = await storage.publishAsset({
      stagingKey: 'models/atelier-coat.glb',
      publicKey: 'catalog/atelier-coat.glb',
    });
    expect(published.publicUrl).toBe(
      'http://localhost:4000/assets/catalog/atelier-coat.glb',
    );

    const publicHead = await storage.headObject({
      key: 'catalog/atelier-coat.glb',
      scope: 'public',
    });
    expect(publicHead.exists).toBe(true);

    await storage.deleteObject({ key: 'models/atelier-coat.glb', scope: 'staging' });
    const headAfterDelete = await storage.headObject({
      key: 'models/atelier-coat.glb',
      scope: 'staging',
    });
    expect(headAfterDelete.exists).toBe(false);
  });
});
