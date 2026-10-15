import { backupFileName, createBackup, type BackupFile } from '../db/backup';
import type { AtlasDB } from '../db/schema';

export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Saves a JSON file. On iPhone this opens the share sheet ("Save to Files", AirDrop, Mail…);
 * elsewhere it falls back to a normal download.
 */
export async function saveJsonFile(name: string, data: unknown): Promise<SaveResult> {
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Share failed for another reason: fall back to a download.
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

export async function exportBackup(db: AtlasDB): Promise<SaveResult> {
  const backup: BackupFile = await createBackup(db);
  return saveJsonFile(backupFileName(), backup);
}
