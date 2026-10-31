const DAY_MS = 86_400_000;

export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

export function formatDownloads(n: number | null): string {
  if (n === null) return 'unknown';
  const fmt = (v: number, suffix: string) => `${v >= 100 ? Math.round(v) : Number(v.toFixed(1))}${suffix}`;
  if (n >= 1e9) return `${fmt(n / 1e9, 'B')}/week`;
  if (n >= 1e6) return `${fmt(n / 1e6, 'M')}/week`;
  if (n >= 1e3) return `${fmt(n / 1e3, 'K')}/week`;
  return `${n}/week`;
}

export function timeAgo(date: Date | null, now: Date = new Date()): string {
  if (!date) return 'unknown';
  const days = daysBetween(date, now);
  if (days < 1) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 60) return `${days} days ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}
