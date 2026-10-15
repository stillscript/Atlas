/** Short, sortable-enough unique ids for records, e.g. "ses-lzx3k1-a8f2c9". */
export function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replaceAll('-', '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
