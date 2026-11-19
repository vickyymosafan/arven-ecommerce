import { runDatabaseBackupRestoreDrill, ARVEN_APPLICATION_TABLES, type BackupDrillResult } from './packages/database/src/backup-restore-drill.js';

export { runDatabaseBackupRestoreDrill, ARVEN_APPLICATION_TABLES, type BackupDrillResult };

// CLI runner
if (process.argv[1]?.endsWith('db-backup-restore-drill.ts')) {
  runDatabaseBackupRestoreDrill()
    .then((result) => {
      console.log('--- DATABASE BACKUP & RESTORE DRILL REPORT ---');
      console.log(`Status: ${result.status}`);
      console.log(`Database: ${result.database}`);
      console.log(`Tables Verified: ${result.tablesVerified}`);
      console.log(`Total Records: ${result.totalRecords}`);
      console.log(`Checksum: ${result.checksum}`);
      console.log(`Duration: ${result.durationMs}ms`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Backup drill failed:', err);
      process.exit(1);
    });
}
