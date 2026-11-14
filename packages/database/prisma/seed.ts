import { config as loadDotenv } from 'dotenv';
import { findWorkspaceEnvFile } from '@arven/config';
import { createPrismaClient } from '../src/client.js';
import { seedDatabase } from '../src/seed.js';

async function main(): Promise<void> {
  const envFile = findWorkspaceEnvFile(import.meta.dirname);
  if (envFile) {
    loadDotenv({ path: envFile, quiet: true });
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required to run prisma/seed.ts');
  }

  const prisma = createPrismaClient({ connectionString: databaseUrl });
  try {
    const summary = await seedDatabase(prisma);
    process.stdout.write(`ARVEN database seed completed: ${JSON.stringify(summary)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('ARVEN database seed failed:', error);
  process.exitCode = 1;
});
