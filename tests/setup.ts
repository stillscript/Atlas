import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach } from 'vitest';

// A fresh, empty IndexedDB for every test.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
