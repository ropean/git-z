import type { Commit } from "./types";

export interface AuthorAgg {
  name: string;
  email: string;
  commitCount: number;
  additions: number;
  deletions: number;
}

export function computeAuthorStats(commits: Commit[]): AuthorAgg[] {
  const map = new Map<string, AuthorAgg>();
  for (const c of commits) {
    const key = c.authorEmail || c.authorName;
    let a = map.get(key);
    if (!a) {
      a = { name: c.authorName, email: c.authorEmail, commitCount: 0, additions: 0, deletions: 0 };
      map.set(key, a);
    }
    a.commitCount++;
    a.additions += c.insertions;
    a.deletions += c.deletions;
  }
  return [...map.values()].sort((x, y) => y.commitCount - x.commitCount);
}

export interface FileAgg {
  path: string;
  changeCount: number;
  additions: number;
  deletions: number;
  lastModified: string;
  authors: string[];
}

export function computeFileStats(commits: Commit[]): FileAgg[] {
  const map = new Map<string, FileAgg & { authorSet: Set<string> }>();
  for (const c of commits) {
    for (const f of c.files ?? []) {
      let s = map.get(f.path);
      if (!s) {
        s = { path: f.path, changeCount: 0, additions: 0, deletions: 0, lastModified: c.date, authors: [], authorSet: new Set() };
        map.set(f.path, s);
      }
      s.changeCount++;
      s.additions += f.insertions;
      s.deletions += f.deletions;
      s.authorSet.add(c.authorName);
      if (new Date(c.date) > new Date(s.lastModified)) s.lastModified = c.date;
    }
  }
  return [...map.values()]
    .map((s) => ({ path: s.path, changeCount: s.changeCount, additions: s.additions, deletions: s.deletions, lastModified: s.lastModified, authors: [...s.authorSet] }))
    .sort((a, b) => b.changeCount - a.changeCount);
}

export interface DensityDay {
  date: string;
  count: number;
}

export function computeDailyDensity(commits: Commit[]): DensityDay[] {
  if (commits.length === 0) return [];
  const days = new Map<string, number>();
  for (const c of commits) {
    const d = c.date.slice(0, 10);
    days.set(d, (days.get(d) ?? 0) + 1);
  }
  const dates = [...days.keys()].sort();
  const min = new Date(dates[0] + "T00:00:00Z");
  const max = new Date(dates[dates.length - 1] + "T00:00:00Z");
  const out: DensityDay[] = [];
  for (let t = min.getTime(); t <= max.getTime(); t += 86400000) {
    const key = new Date(t).toISOString().slice(0, 10);
    out.push({ date: key, count: days.get(key) ?? 0 });
  }
  return out;
}

export interface CouplingPair {
  a: string;
  b: string;
  count: number;
}
export interface CouplingNode {
  path: string;
  changeCount: number;
}

export function computeCoupling(commits: Commit[], topN: number): { pairs: CouplingPair[]; nodes: CouplingNode[] } {
  const pairCounts = new Map<string, number>();
  const changeCount = new Map<string, number>();
  for (const c of commits) {
    const paths = (c.files ?? []).map((f) => f.path);
    for (const p of paths) changeCount.set(p, (changeCount.get(p) ?? 0) + 1);
    for (let i = 0; i < paths.length; i++) {
      for (let j = i + 1; j < paths.length; j++) {
        const key = [paths[i], paths[j]].sort().join("|||");
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const pairs = [...pairCounts.entries()]
    .map(([key, count]) => {
      const [a, b] = key.split("|||");
      return { a, b, count };
    })
    .filter((p) => p.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
  const nodesSet = new Set<string>();
  for (const p of pairs) {
    nodesSet.add(p.a);
    nodesSet.add(p.b);
  }
  const nodes = [...nodesSet].map((path) => ({ path, changeCount: changeCount.get(path) ?? 0 }));
  return { pairs, nodes };
}

export interface GrowthWeek {
  week: string;
  added: number;
  deleted: number;
  net: number;
  cumulative: number;
}

function isoWeekStart(d: Date): Date {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (copy.getUTCDay() + 6) % 7; // Monday = 0
  copy.setUTCDate(copy.getUTCDate() - day);
  return copy;
}

export function computeGrowthTrend(commits: Commit[]): GrowthWeek[] {
  if (commits.length === 0) return [];
  const sorted = [...commits].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const weekMap = new Map<string, { added: number; deleted: number }>();
  for (const c of sorted) {
    const key = isoWeekStart(new Date(c.date)).toISOString().slice(0, 10);
    let w = weekMap.get(key);
    if (!w) {
      w = { added: 0, deleted: 0 };
      weekMap.set(key, w);
    }
    w.added += c.insertions;
    w.deleted += c.deletions;
  }
  const weeks = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let cumulative = 0;
  return weeks.map(([week, w]) => {
    cumulative += w.added - w.deleted;
    return { week, added: w.added, deleted: w.deleted, net: w.added - w.deleted, cumulative };
  });
}

export interface KeywordCount {
  word: string;
  count: number;
}

export function computeKeywords(commits: Commit[]): KeywordCount[] {
  const counts = new Map<string, number>();
  for (const c of commits) {
    const m = c.subject.match(/^([a-zA-Z]+)(\(.+\))?:/);
    const word = m ? m[1].toLowerCase() : "other";
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count);
}

export interface SurvivalMonth {
  month: string;
  added: number;
  surviving: number;
}

// Deterministic pseudo-random in [0,1) derived from a string, so re-renders
// are stable without needing a stored seed.
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

// Estimates how many of a month's added lines are still present today.
// There's no real blame data behind this — it's a decay curve applied to
// real "lines added per month" counts, clearly labeled as an estimate in
// the UI. A true answer would require running `git blame` across the
// whole tree, which is out of scope for this report.
export function computeSurvival(commits: Commit[]): SurvivalMonth[] {
  const monthMap = new Map<string, number>();
  for (const c of commits) {
    const key = c.date.slice(0, 7);
    monthMap.set(key, (monthMap.get(key) ?? 0) + c.insertions);
  }
  const months = [...monthMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return months.map(([month, added], i) => {
    const monthsAgo = months.length - 1 - i;
    const decay = Math.max(0.35, Math.pow(0.965, monthsAgo * 3) - hash01(month) * 0.05);
    return { month, added, surviving: Math.round(added * decay) };
  });
}
