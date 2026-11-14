import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'prisma/config';

function loadWorkspaceEnv(): void {
  let current = resolve(import.meta.dirname);
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = resolve(current, '.env');
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate, quiet: true });
      return;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
}

loadWorkspaceEnv();

const OFFLINE_GENERATE_ONLY_URL = 'postgresql://postgres:offline_generate_only@127.0.0.1:5432/arven_dev';

function isOfflineSchemaOnlyCommand(argv: readonly string[]): boolean {
  if (argv.includes('generate') || argv.includes('validate') || argv.includes('format')) {
    return true;
  }
  const hasDiff = argv.includes('diff');
  const usesLiveConfigDatasource =
    argv.includes('--from-config-datasource') || argv.includes('--to-config-datasource');
  return hasDiff && !usesLiveConfigDatasource;
}

function resolveDatasourceUrl(): string {
  const configured = process.env.DATABASE_URL?.trim();
  if (configured) {
    return configured;
  }
  if (isOfflineSchemaOnlyCommand(process.argv.slice(2))) {
    return OFFLINE_GENERATE_ONLY_URL;
  }
  throw new Error(
    'DATABASE_URL environment variable is required for Prisma migrations and seeding. Provision .env from .env.example first.',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: resolveDatasourceUrl(),
  },
});
