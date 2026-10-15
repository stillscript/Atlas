const DAY_MS = 86_400_000;

/** Local calendar date as YYYY-MM-DD. */
export function toISODate(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "Tuesday, October 14" */
export function formatLongDate(date: Date = new Date()): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "Oct 14, 2026" */
export function formatShortDate(input: Date | number | string): string {
  const date = typeof input === 'string' ? new Date(`${input}T12:00:00`) : new Date(input);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "today", "yesterday", "3 days ago", "Oct 2" */
export function formatRelativeDay(timestamp: number, now = Date.now()): string {
  const startOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((startOf(now) - startOf(timestamp)) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
