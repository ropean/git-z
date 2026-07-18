// Date-only strings (e.g. heatmap cell keys) have no time component, so
// `new Date(...)` parses them as UTC midnight per spec — reading them back
// with local getters (getFullYear/getMonth/getDate) can then roll the
// result back a day for any viewer west of UTC. They're already calendar
// dates, not instants, so just pass them through instead of round-tripping
// through Date.
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formatDate(iso: string): string {
  if (DATE_ONLY_RE.test(iso)) return iso;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${formatDate(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function formatNum(n: number): string {
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Builds a link to the hosted commit page for a normalized https remote
// base URL (e.g. "https://github.com/owner/repo"). Bitbucket uses
// "/commits/<hash>" instead of "/commit/<hash>"; every other host we know
// of (GitHub, GitLab, Gitea, Gitee, self-hosted forks of the same) uses the
// singular form.
export function commitUrl(remoteUrl: string, hash: string): string {
  const isBitbucket = /(^|\.)bitbucket\.org$/.test(new URL(remoteUrl).hostname);
  return `${remoteUrl}/${isBitbucket ? "commits" : "commit"}/${hash}`;
}

// Matches the CLI's default report filename timestamp (MMDDYY-HHmm), so
// the browser tab title and the file on disk read as the same moment.
export function formatCompactTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}${dd}${yy}-${hh}${min}`;
}
