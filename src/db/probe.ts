/**
 * Reads a database's current version without creating it or upgrading it.
 *
 * `indexedDB.open(name)` with no version silently creates an empty database at version 1, which
 * would later stop migration 1 from running. Aborting the upgrade that a brand-new database
 * triggers makes the browser discard it, so a missing database reports version 0.
 */
export function getStoredVersion(name: string, factory: IDBFactory = indexedDB): Promise<number> {
  return new Promise((resolve, reject) => {
    let isNew = false;
    const request = factory.open(name);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion === 0) {
        isNew = true;
        request.transaction?.abort();
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const version = db.version;
      db.close();
      resolve(version);
    };
    request.onerror = (event) => {
      if (isNew) {
        event.preventDefault();
        resolve(0);
      } else {
        reject(request.error ?? new Error(`Could not read database "${name}"`));
      }
    };
  });
}
