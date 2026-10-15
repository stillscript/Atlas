import type { IDBPDatabase } from 'idb';

/** Every record in every store, plus the schema version they were read at. */
export interface DatabaseDump {
  schemaVersion: number;
  stores: Record<string, unknown[]>;
}

export async function dumpDatabase(db: IDBPDatabase<unknown>): Promise<DatabaseDump> {
  const names = Array.from(db.objectStoreNames);
  const stores: Record<string, unknown[]> = {};
  if (names.length > 0) {
    const tx = db.transaction(names, 'readonly');
    await Promise.all(
      names.map(async (name) => {
        stores[name] = await tx.objectStore(name).getAll();
      }),
    );
    await tx.done;
  }
  return { schemaVersion: db.version, stores };
}

/**
 * Writes a dump into `db` in a single transaction, so it either fully lands or not at all.
 * With `replace`, every store is cleared first (used by restore and import).
 */
export async function writeDump(
  db: IDBPDatabase<unknown>,
  dump: DatabaseDump,
  { replace }: { replace: boolean },
): Promise<void> {
  const names = Array.from(db.objectStoreNames);
  const unknown = Object.keys(dump.stores).filter((name) => !names.includes(name));
  if (unknown.length > 0) {
    throw new Error(`Data has stores this version doesn't know: ${unknown.join(', ')}`);
  }
  if (names.length === 0) return;
  const tx = db.transaction(names, 'readwrite');
  const writes: Promise<unknown>[] = [];
  for (const name of names) {
    const store = tx.objectStore(name);
    if (replace) writes.push(store.clear());
    for (const record of dump.stores[name] ?? []) writes.push(store.put(record));
  }
  await Promise.all([...writes, tx.done]);
}
