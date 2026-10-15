import { openDB, type IDBPDatabase } from 'idb';
import type { Migration } from './migrations';

export interface UpgradeHooks {
  /** Another tab or an old app instance is holding the database open at an older version. */
  onBlocked?: () => void;
}

/**
 * Opens `name` at `version`, running every migration between the stored version and `version`
 * inside IndexedDB's upgrade transaction.
 *
 * If any migration throws (synchronously or asynchronously), the upgrade transaction is aborted.
 * IndexedDB then rolls the whole upgrade back, schema and data, and the database stays at its
 * previous version. The promise rejects with the migration's own error.
 */
export async function openWithMigrations(
  name: string,
  version: number,
  migrations: readonly Migration[],
  hooks: UpgradeHooks = {},
): Promise<IDBPDatabase<unknown>> {
  let failure: unknown;
  let opened: IDBPDatabase<unknown> | undefined;
  try {
    opened = await openDB<unknown>(name, version, {
      upgrade(db, oldVersion, newVersion, tx) {
        // An aborted upgrade rejects tx.done; the failure is reported through openDB instead.
        tx.done.catch(() => undefined);
        const target = newVersion ?? version;
        const pending = migrations.filter((m) => m.version > oldVersion && m.version <= target);
        const run = async () => {
          for (const migration of pending) {
            await migration.up({ db, tx, fromVersion: oldVersion });
          }
        };
        run().catch((error: unknown) => {
          failure = error;
          try {
            tx.abort();
          } catch {
            // Already finished or aborted.
          }
        });
      },
      blocked() {
        hooks.onBlocked?.();
      },
      blocking() {
        // A newer version of the app wants to upgrade: step aside so it isn't stuck.
        opened?.close();
      },
    });
    return opened;
  } catch (error) {
    throw failure ?? error;
  }
}
