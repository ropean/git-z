import type { Commit } from "./types";

export interface Bucket {
  label: string;
  commits: number;
  insertions: number;
  deletions: number;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoWeekStart(d: Date): string {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (copy.getUTCDay() + 6) % 7; // Monday = 0
  copy.setUTCDate(copy.getUTCDate() - day);
  return isoDay(copy);
}

// Buckets commits by day, falling back to by-week once the date range would
// otherwise produce too many points for a readable line chart.
export function bucketCommits(commits: Commit[]): Bucket[] {
  if (commits.length === 0) return [];
  const dates = commits.map((c) => new Date(c.date));
  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  const spanDays = (max.getTime() - min.getTime()) / 86400000;
  const byWeek = spanDays > 120;
  const keyOf = byWeek ? isoWeekStart : isoDay;

  const map = new Map<string, Bucket>();
  for (const c of commits) {
    const key = keyOf(new Date(c.date));
    let b = map.get(key);
    if (!b) {
      b = { label: key, commits: 0, insertions: 0, deletions: 0 };
      map.set(key, b);
    }
    b.commits += 1;
    b.insertions += c.insertions;
    b.deletions += c.deletions;
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}
