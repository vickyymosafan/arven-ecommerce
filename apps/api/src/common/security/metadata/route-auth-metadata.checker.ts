import type { INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import type { PermissionCode } from '@arven/config';
import type { SessionScope } from '@arven/database';
import { AUTH_METADATA_KEYS } from '../decorators.js';

function normalizeSegment(segment: string): string {
  const cleaned = segment.replace(/^\/+|\/+$/g, '');
  return cleaned;
}

function combineRoutePaths(controllerPath: string, methodPath: string): string {
  const parts = [normalizeSegment(controllerPath), normalizeSegment(methodPath)].filter(
    (part) => part.length > 0,
  );
  return `/${parts.join('/')}`;
}

export function checkRouteAuthMetadata(app: INestApplication): void {
  const discoveryService = app.get(DiscoveryService);
  const metadataScanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);

  const violations: string[] = [];

  for (const wrapper of discoveryService.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) {
      continue;
    }

    const controllerPathRaw =
      reflector.get<string | string[] | undefined>(PATH_METADATA, metatype) ?? '';
    const controllerPaths = Array.isArray(controllerPathRaw)
      ? controllerPathRaw
      : [controllerPathRaw];

    const prototype = Object.getPrototypeOf(instance) as object;
    const methodNames = metadataScanner.getAllMethodNames(prototype);

    for (const methodName of methodNames) {
      const handler = (prototype as Record<string, unknown>)[methodName];
      if (typeof handler !== 'function') {
        continue;
      }

      const httpMethod = reflector.get<number | undefined>(METHOD_METADATA, handler);
      if (httpMethod === undefined) {
        continue;
      }

      const methodPathRaw =
        reflector.get<string | string[] | undefined>(PATH_METADATA, handler) ?? '';
      const methodPaths = Array.isArray(methodPathRaw)
        ? methodPathRaw
        : [methodPathRaw];

      const isPublic = Boolean(
        reflector.getAllAndOverride<boolean>(AUTH_METADATA_KEYS.PUBLIC, [
          handler,
          metatype,
        ]),
      );
      const authScopes = reflector.getAllAndOverride<SessionScope[] | undefined>(
        AUTH_METADATA_KEYS.AUTH_SCOPES,
        [handler, metatype],
      );
      const skipMfa = Boolean(
        reflector.getAllAndOverride<boolean>(AUTH_METADATA_KEYS.SKIP_MFA, [
          handler,
          metatype,
        ]),
      );
      const skipCsrf = Boolean(
        reflector.getAllAndOverride<boolean>(AUTH_METADATA_KEYS.SKIP_CSRF, [
          handler,
          metatype,
        ]),
      );
      const permissionsAll =
        reflector.getAllAndOverride<PermissionCode[] | undefined>(
          AUTH_METADATA_KEYS.PERMISSIONS_ALL,
          [handler, metatype],
        ) ?? [];
      const permissionsAny =
        reflector.getAllAndOverride<PermissionCode[] | undefined>(
          AUTH_METADATA_KEYS.PERMISSIONS_ANY,
          [handler, metatype],
        ) ?? [];

      const label = `${metatype.name}.${methodName}`;

      if (!isPublic && (!authScopes || authScopes.length === 0)) {
        violations.push(
          `${label}: missing explicit @Public(), @CustomerAuth(), @AdminAuth(), or @PortalAuth() decorator`,
        );
      }

      for (const ctrlPath of controllerPaths) {
        for (const mPath of methodPaths) {
          const fullPath = combineRoutePaths(ctrlPath, mPath);

          if (skipMfa && !fullPath.startsWith('/auth')) {
            violations.push(
              `${label} (${fullPath}): @SkipMfaCheck() is only allowed on /auth/* handlers`,
            );
          }

          if (skipCsrf && !fullPath.includes('/webhook')) {
            violations.push(
              `${label} (${fullPath}): @SkipCsrf() is only allowed on webhook endpoints`,
            );
          }

          if (
            !isPublic &&
            /(?:^|\/)admin(?:\/|$)/.test(fullPath) &&
            permissionsAll.length === 0 &&
            permissionsAny.length === 0
          ) {
            violations.push(
              `${label} (${fullPath}): admin endpoint must declare @RequirePermissions() or @RequireAnyPermission()`,
            );
          }
        }
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Route auth metadata startup verification failed:\n- ${violations.join('\n- ')}`,
    );
  }
}
