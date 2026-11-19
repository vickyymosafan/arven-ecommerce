import { describe, it, expect } from 'vitest';
import { runDatabaseBackupRestoreDrill, ARVEN_APPLICATION_TABLES } from '../src/backup-restore-drill.js';

describe('Database Backup & Restore Disaster Recovery Drill', () => {
  it('should list all critical ARVEN application tables', () => {
    expect(ARVEN_APPLICATION_TABLES.length).toBeGreaterThanOrEqual(26);
    expect(ARVEN_APPLICATION_TABLES).toContain('users');
    expect(ARVEN_APPLICATION_TABLES).toContain('orders');
    expect(ARVEN_APPLICATION_TABLES).toContain('payments');
    expect(ARVEN_APPLICATION_TABLES).toContain('inventory_levels');
    expect(ARVEN_APPLICATION_TABLES).toContain('inventory_movements');
    expect(ARVEN_APPLICATION_TABLES).toContain('audit_logs');
    expect(ARVEN_APPLICATION_TABLES).toContain('showroom_zones');
    expect(ARVEN_APPLICATION_TABLES).toContain('outfit_scenes');
  });

  it('should execute transactional backup drill and verify archive integrity', async () => {
    const result = await runDatabaseBackupRestoreDrill();

    expect(result.status).toBe('PASS');
    expect(result.database).toBe('PostgreSQL 18');
    expect(result.tablesVerified).toBeGreaterThan(0);
    expect(typeof result.checksum).toBe('string');
    expect(result.checksum.length).toBe(64); // SHA-256
    expect(result.durationMs).toBeGreaterThan(0);
    expect(Array.isArray(result.tableDetails)).toBe(true);
    expect(result.tableDetails.length).toBe(ARVEN_APPLICATION_TABLES.length);
  });
});
