import type { BranchStat, Commit, TagStat } from "./types";

const DAY_MS = 86400000;

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
  authorCounts: Record<string, number>;
}

export function computeFileStats(commits: Commit[]): FileAgg[] {
  const map = new Map<string, FileAgg & { authorSet: Set<string> }>();
  for (const c of commits) {
    for (const f of c.files ?? []) {
      let s = map.get(f.path);
      if (!s) {
        s = { path: f.path, changeCount: 0, additions: 0, deletions: 0, lastModified: c.date, authors: [], authorSet: new Set(), authorCounts: {} };
        map.set(f.path, s);
      }
      s.changeCount++;
      s.additions += f.insertions;
      s.deletions += f.deletions;
      s.authorSet.add(c.authorName);
      s.authorCounts[c.authorName] = (s.authorCounts[c.authorName] ?? 0) + 1;
      if (new Date(c.date) > new Date(s.lastModified)) s.lastModified = c.date;
    }
  }
  return [...map.values()]
    .map((s) => ({
      path: s.path,
      changeCount: s.changeCount,
      additions: s.additions,
      deletions: s.deletions,
      lastModified: s.lastModified,
      authors: [...s.authorSet],
      authorCounts: s.authorCounts,
    }))
    .sort((a, b) => b.changeCount - a.changeCount);
}

// Share (0-1) of a file's changes made by its single most active author —
// a simple ownership-concentration signal for the File Heat hotspot badge.
export function dominantOwnerShare(file: FileAgg): number {
  const counts = Object.values(file.authorCounts);
  if (counts.length === 0 || file.changeCount === 0) return 0;
  return Math.max(...counts) / file.changeCount;
}

export interface HeatmapCell {
  date: string | null;
  count: number;
}
export interface HeatmapWeek {
  cells: HeatmapCell[];
}
export interface HeatmapMonthLabel {
  weekIndex: number;
  label: string;
}
export interface CommitHeatmap {
  weeks: HeatmapWeek[];
  monthLabels: HeatmapMonthLabel[];
  maxCount: number;
}

// Distinct calendar years with at least one commit, newest first — drives
// the heatmap's year picker.
export function commitYears(commits: Commit[]): number[] {
  const years = new Set<number>();
  for (const c of commits) {
    const y = Number(c.date.slice(0, 4));
    if (!Number.isNaN(y)) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

// Buckets one calendar year (Jan 1 - Dec 31) into a GitHub-style grid:
// columns are weeks (Sunday-start), rows are weekdays. Padded with
// out-of-year cells (date: null) so every week column has exactly 7 rows.
export function computeCommitHeatmapForYear(commits: Commit[], year: number): CommitHeatmap {
  const days = new Map<string, number>();
  for (const c of commits) {
    const key = c.date.slice(0, 10);
    if (Number(key.slice(0, 4)) !== year) continue;
    days.set(key, (days.get(key) ?? 0) + 1);
  }

  const start = new Date(Date.UTC(year, 0, 1));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const end = new Date(Date.UTC(year, 11, 31));
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));

  const weeks: HeatmapWeek[] = [];
  const monthLabels: HeatmapMonthLabel[] = [];
  let maxCount = 0;
  let lastMonth = -1;
  let weekIndex = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += 7 * DAY_MS) {
    const cells: HeatmapCell[] = [];
    for (let dow = 0; dow < 7; dow++) {
      const cursor = new Date(t + dow * DAY_MS);
      const inYear = cursor.getUTCFullYear() === year;
      if (dow === 0 && inYear) {
        const month = cursor.getUTCMonth();
        if (month !== lastMonth) {
          monthLabels.push({ weekIndex, label: cursor.toLocaleString("en-US", { month: "short", timeZone: "UTC" }) });
          lastMonth = month;
        }
      }
      if (!inYear) {
        cells.push({ date: null, count: 0 });
        continue;
      }
      const key = cursor.toISOString().slice(0, 10);
      const count = days.get(key) ?? 0;
      maxCount = Math.max(maxCount, count);
      cells.push({ date: key, count });
    }
    weeks.push({ cells });
    weekIndex++;
  }
  return { weeks, monthLabels: dropCrampedLabels(monthLabels), maxCount };
}

// A label lands every time the calendar crosses a month boundary, which can
// be a single week after the previous one when the visible range starts
// right before a boundary — two 3-letter labels one column (14px) apart
// overlap into unreadable text. Drop labels that don't have room.
const MIN_LABEL_GAP_WEEKS = 3;
function dropCrampedLabels(labels: HeatmapMonthLabel[]): HeatmapMonthLabel[] {
  const kept: HeatmapMonthLabel[] = [];
  for (const label of labels) {
    const prev = kept[kept.length - 1];
    if (prev && label.weekIndex - prev.weekIndex < MIN_LABEL_GAP_WEEKS) continue;
    kept.push(label);
  }
  return kept;
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

// Commits touching more files than this are still counted toward each
// file's changeCount, but skipped for pairwise coupling — that loop is
// O(k^2) per commit, and a handful of huge commits (a vendor bump, an
// initial import) can otherwise dwarf the cost of every other commit
// combined.
const COUPLING_FILE_CAP = 60;

export function computeCoupling(commits: Commit[], topN: number): { pairs: CouplingPair[]; nodes: CouplingNode[] } {
  const pairCounts = new Map<string, number>();
  const changeCount = new Map<string, number>();
  for (const c of commits) {
    const paths = (c.files ?? []).map((f) => f.path);
    for (const p of paths) changeCount.set(p, (changeCount.get(p) ?? 0) + 1);
    if (paths.length > COUPLING_FILE_CAP) continue;
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

export interface CommitContext {
  filesCount: number;
  avgFilesPerCommit: number;
  sizePercentile: number;
  sequenceIndex: number;
  totalCommits: number;
  authorGapDays: number | null;
  isMerge: boolean;
}

// Places a single commit in the context of the whole repo's history — the
// raw +/- numbers on a commit mean little without something to compare them
// to (is 11 files a lot? is this commit part of a burst or a lull?).
export function computeCommitContext(commit: Commit, allCommits: Commit[]): CommitContext {
  const totalFiles = allCommits.reduce((sum, c) => sum + (c.files?.length ?? 0), 0);
  const avgFilesPerCommit = allCommits.length ? totalFiles / allCommits.length : 0;

  const mySize = commit.insertions + commit.deletions;
  const sizes = allCommits.map((c) => c.insertions + c.deletions).sort((a, b) => a - b);
  const smallerOrEqual = sizes.filter((s) => s <= mySize).length;
  const sizePercentile = sizes.length ? Math.round((smallerOrEqual / sizes.length) * 100) : 0;

  const sorted = [...allCommits].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const idx = sorted.findIndex((c) => c.hash === commit.hash);

  let authorGapDays: number | null = null;
  for (let i = idx - 1; i >= 0; i--) {
    if (sorted[i].authorName === commit.authorName) {
      authorGapDays = Math.round((new Date(commit.date).getTime() - new Date(sorted[i].date).getTime()) / DAY_MS);
      break;
    }
  }

  return {
    filesCount: commit.files?.length ?? 0,
    avgFilesPerCommit,
    sizePercentile,
    sequenceIndex: idx + 1,
    totalCommits: allCommits.length,
    authorGapDays,
    isMerge: (commit.parents?.length ?? 0) > 1,
  };
}

export interface CommitStats {
  mergeCommits: number;
  revertCommits: number;
  avgPerDay: number;
  avgPerWeek: number;
  avgPerMonth: number;
  largest: Commit | null;
  smallest: Commit | null;
  avgFilesChanged: number;
  avgLocChanged: number;
  byWeekday: number[]; // index 0 = Sunday, viewer's local time zone
  byHour: number[]; // index 0-23, viewer's local time zone
  workHoursPct: number;
  weekendPct: number;
}

const WORK_HOUR_START = 9;
const WORK_HOUR_END = 18; // exclusive

const EMPTY_COMMIT_STATS: CommitStats = {
  mergeCommits: 0,
  revertCommits: 0,
  avgPerDay: 0,
  avgPerWeek: 0,
  avgPerMonth: 0,
  largest: null,
  smallest: null,
  avgFilesChanged: 0,
  avgLocChanged: 0,
  byWeekday: new Array(7).fill(0),
  byHour: new Array(24).fill(0),
  workHoursPct: 0,
  weekendPct: 0,
};

// Aggregate commit-level shape stats: merge/revert counts, cadence, size
// distribution, and when-of-week/day rhythm. Hour-of-day is bucketed in the
// viewer's local time zone (the only time zone consistently available once
// commits are aggregated across authors).
export function computeCommitStats(commits: Commit[]): CommitStats {
  if (commits.length === 0) return EMPTY_COMMIT_STATS;

  let mergeCommits = 0;
  let revertCommits = 0;
  let totalFiles = 0;
  let totalLoc = 0;
  const byWeekday = new Array(7).fill(0);
  const byHour = new Array(24).fill(0);
  let workHours = 0;
  let weekend = 0;
  let largest = commits[0];
  let smallest = commits[0];
  let largestSize = -1;
  let smallestSize = Infinity;
  let minTime = Infinity;
  let maxTime = -Infinity;

  for (const c of commits) {
    if ((c.parents?.length ?? 0) > 1) mergeCommits++;
    if (/^revert/i.test(c.subject.trim())) revertCommits++;
    const filesCount = c.files?.length ?? 0;
    const size = c.insertions + c.deletions;
    totalFiles += filesCount;
    totalLoc += size;

    const d = new Date(c.date);
    const day = d.getDay();
    const hour = d.getHours();
    byWeekday[day]++;
    byHour[hour]++;
    if (day === 0 || day === 6) weekend++;
    else if (hour >= WORK_HOUR_START && hour < WORK_HOUR_END) workHours++;

    if (size > largestSize) {
      largestSize = size;
      largest = c;
    }
    if (size < smallestSize) {
      smallestSize = size;
      smallest = c;
    }
    const t = d.getTime();
    if (t < minTime) minTime = t;
    if (t > maxTime) maxTime = t;
  }

  const spanDays = Math.max(1, (maxTime - minTime) / DAY_MS);
  return {
    mergeCommits,
    revertCommits,
    avgPerDay: commits.length / spanDays,
    avgPerWeek: (commits.length / spanDays) * 7,
    avgPerMonth: (commits.length / spanDays) * 30,
    largest,
    smallest,
    avgFilesChanged: totalFiles / commits.length,
    avgLocChanged: totalLoc / commits.length,
    byWeekday,
    byHour,
    workHoursPct: (workHours / commits.length) * 100,
    weekendPct: (weekend / commits.length) * 100,
  };
}

export interface BusFactor {
  count: number;
  topShare: number; // percent
  total: number;
}

// Minimum number of contributors whose combined commits cross half of the
// total — the standard "bus factor" heuristic (lower is riskier).
export function computeBusFactor(authors: AuthorAgg[]): BusFactor {
  const total = authors.reduce((sum, a) => sum + a.commitCount, 0);
  if (total === 0) return { count: 0, topShare: 0, total: 0 };
  const sorted = [...authors].sort((a, b) => b.commitCount - a.commitCount);
  let cumulative = 0;
  let count = 0;
  for (const a of sorted) {
    cumulative += a.commitCount;
    count++;
    if (cumulative / total >= 0.5) break;
  }
  return { count, topShare: ((sorted[0]?.commitCount ?? 0) / total) * 100, total };
}

export interface DirectoryAgg {
  path: string;
  changeCount: number;
  additions: number;
  deletions: number;
  fileCount: number;
  authors: string[];
}

// Groups per-file changes by their top-`depth` directory segment(s), same
// rollup shape as computeFileStats but coarser — feeds the Directories
// treemap.
export function computeDirectoryStats(commits: Commit[], depth = 1): DirectoryAgg[] {
  const map = new Map<string, DirectoryAgg & { authorSet: Set<string>; fileSet: Set<string> }>();
  for (const c of commits) {
    for (const f of c.files ?? []) {
      const dir = dirPrefix(f.path, depth);
      let s = map.get(dir);
      if (!s) {
        s = { path: dir, changeCount: 0, additions: 0, deletions: 0, fileCount: 0, authors: [], authorSet: new Set(), fileSet: new Set() };
        map.set(dir, s);
      }
      s.changeCount++;
      s.additions += f.insertions;
      s.deletions += f.deletions;
      s.authorSet.add(c.authorName);
      s.fileSet.add(f.path);
    }
  }
  return [...map.values()]
    .map((s) => ({ path: s.path, changeCount: s.changeCount, additions: s.additions, deletions: s.deletions, fileCount: s.fileSet.size, authors: [...s.authorSet] }))
    .sort((a, b) => b.changeCount - a.changeCount);
}

function dirPrefix(path: string, depth: number): string {
  const parts = path.split("/");
  if (parts.length <= 1) return "(root)";
  return parts.slice(0, depth).join("/");
}

export interface ChurnMonth {
  month: string;
  additions: number;
  deletions: number;
  net: number;
  churn: number;
}

export function computeChurnTrend(commits: Commit[]): ChurnMonth[] {
  const map = new Map<string, { additions: number; deletions: number }>();
  for (const c of commits) {
    const key = c.date.slice(0, 7);
    const e = map.get(key) ?? { additions: 0, deletions: 0 };
    e.additions += c.insertions;
    e.deletions += c.deletions;
    map.set(key, e);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, e]) => ({ month, additions: e.additions, deletions: e.deletions, net: e.additions - e.deletions, churn: e.additions + e.deletions }));
}

export interface ReleaseAgg {
  name: string;
  date: string;
  commits: number;
  contributors: number;
  additions: number;
  deletions: number;
  daysSincePrevious: number | null;
}

// Buckets commits into the interval preceding each tag (oldest tag first),
// via a single forward sweep over both lists sorted ascending by date.
export function computeReleaseStats(tags: TagStat[], commits: Commit[]): ReleaseAgg[] {
  const sortedTags = [...tags].sort((a, b) => a.date.localeCompare(b.date));
  const sortedCommits = [...commits].sort((a, b) => a.date.localeCompare(b.date));
  const results: ReleaseAgg[] = [];
  let idx = 0;
  let prevDate: string | null = null;

  for (const tag of sortedTags) {
    const authors = new Set<string>();
    let count = 0;
    let additions = 0;
    let deletions = 0;
    while (idx < sortedCommits.length && sortedCommits[idx].date <= tag.date) {
      const c = sortedCommits[idx];
      authors.add(c.authorEmail || c.authorName);
      additions += c.insertions;
      deletions += c.deletions;
      count++;
      idx++;
    }
    const daysSincePrevious = prevDate ? Math.round((new Date(tag.date).getTime() - new Date(prevDate).getTime()) / DAY_MS) : null;
    results.push({ name: tag.name, date: tag.date, commits: count, contributors: authors.size, additions, deletions, daysSincePrevious });
    prevDate = tag.date;
  }
  return results;
}

const EXTENSION_LANGUAGES: Record<string, string> = {
  go: "Go", ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  css: "CSS", scss: "SCSS", less: "Less", html: "HTML", htm: "HTML", md: "Markdown", mdx: "Markdown", json: "JSON",
  yml: "YAML", yaml: "YAML", toml: "TOML", py: "Python", rb: "Ruby", java: "Java", kt: "Kotlin", kts: "Kotlin",
  c: "C", h: "C", cpp: "C++", cc: "C++", hpp: "C++", cs: "C#", rs: "Rust", php: "PHP", sh: "Shell", bash: "Shell",
  sql: "SQL", swift: "Swift", m: "Objective-C", vue: "Vue", xml: "XML", proto: "Protocol Buffers",
};

function languageForPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  if (base.toLowerCase() === "dockerfile") return "Dockerfile";
  const dot = base.lastIndexOf(".");
  if (dot === -1) return "Other";
  return EXTENSION_LANGUAGES[base.slice(dot + 1).toLowerCase()] ?? "Other";
}

export interface LanguageActivity {
  language: string;
  churn: number;
}

// Complements the byte-size language distribution (computed server-side)
// with "which languages actually saw edits in the selected range."
export function computeLanguageActivity(commits: Commit[]): LanguageActivity[] {
  const map = new Map<string, number>();
  for (const c of commits) {
    for (const f of c.files ?? []) {
      const lang = languageForPath(f.path);
      map.set(lang, (map.get(lang) ?? 0) + f.insertions + f.deletions);
    }
  }
  return [...map.entries()]
    .map(([language, churn]) => ({ language, churn }))
    .sort((a, b) => b.churn - a.churn);
}

export interface HealthBreakdown {
  label: string;
  score: number;
  detail: string;
}

export interface HealthScore {
  overall: number;
  breakdown: HealthBreakdown[];
}

export interface HealthInput {
  commits: Commit[];
  authorStats: AuthorAgg[];
  busFactor: BusFactor;
  branchStats: BranchStat[];
  releaseStats: ReleaseAgg[];
  churnTrend: ChurnMonth[];
  now: Date;
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function average(nums: number[]): number {
  return nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : 0;
}

const STALE_BRANCH_DAYS = 90;

// Composite 0-100 health score from five weighted, equally-important
// sub-scores. This is a heuristic dashboard signal, not a rigorous metric —
// each sub-score's `detail` string shows the raw number it's based on so
// the score is never a black box.
export function computeHealthScore(input: HealthInput): HealthScore {
  const breakdown: HealthBreakdown[] = [];

  const lastCommitMs = input.commits.length ? Math.max(...input.commits.map((c) => new Date(c.date).getTime())) : 0;
  const daysSinceLast = lastCommitMs ? (input.now.getTime() - lastCommitMs) / DAY_MS : 999;
  breakdown.push({ label: "Activity recency", score: clampScore(100 - daysSinceLast * 2), detail: `${Math.round(daysSinceLast)}d since last commit` });

  const busFactorScore = clampScore((input.busFactor.count / Math.max(1, Math.min(6, input.authorStats.length))) * 100);
  breakdown.push({ label: "Contributor diversity", score: busFactorScore, detail: `Bus factor ${input.busFactor.count} of ${input.authorStats.length}` });

  const staleCutoff = input.now.getTime() - STALE_BRANCH_DAYS * DAY_MS;
  const unmergedBranches = input.branchStats.filter((b) => !b.merged && !b.isDefault);
  const staleBranches = unmergedBranches.filter((b) => new Date(b.lastCommitDate).getTime() < staleCutoff);
  const hygieneScore = unmergedBranches.length === 0 ? 100 : clampScore(100 - (staleBranches.length / unmergedBranches.length) * 100);
  breakdown.push({ label: "Branch hygiene", score: hygieneScore, detail: `${staleBranches.length} stale of ${unmergedBranches.length} unmerged branches` });

  const intervals = input.releaseStats.map((r) => r.daysSincePrevious).filter((d): d is number => d != null);
  let cadenceScore = 70;
  let cadenceDetail = "Not enough releases yet";
  if (intervals.length >= 2) {
    const mean = average(intervals);
    const variance = average(intervals.map((d) => (d - mean) ** 2));
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    cadenceScore = clampScore(100 - cv * 60);
    cadenceDetail = `${Math.round(mean)}d avg interval`;
  }
  breakdown.push({ label: "Release cadence", score: cadenceScore, detail: cadenceDetail });

  const recentChurn = input.churnTrend.slice(-6).map((m) => m.churn);
  let churnScore = 70;
  if (recentChurn.length >= 2) {
    const mean = average(recentChurn);
    const variance = average(recentChurn.map((v) => (v - mean) ** 2));
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    churnScore = clampScore(100 - cv * 40);
  }
  breakdown.push({ label: "Churn stability", score: churnScore, detail: "Last 6 months" });

  const overall = clampScore(average(breakdown.map((b) => b.score)));
  return { overall, breakdown };
}

export interface Insight {
  severity: "good" | "warning" | "info";
  text: string;
}

// Threshold-based auto-generated findings, layered on top of everything
// else computed above — no new data, just rules of thumb worth surfacing.
export function computeInsights(input: HealthInput & { fileStats: FileAgg[]; health: HealthScore; commitStats: CommitStats }): Insight[] {
  const insights: Insight[] = [];

  if (input.busFactor.count <= 2 && input.authorStats.length > 2) {
    insights.push({
      severity: "warning",
      text: `${Math.round(input.busFactor.topShare)}% of commits come from the top contributor(s) — bus factor is ${input.busFactor.count}, consider spreading ownership.`,
    });
  }

  const staleCutoff = input.now.getTime() - STALE_BRANCH_DAYS * DAY_MS;
  const staleBranches = input.branchStats.filter((b) => !b.merged && !b.isDefault && new Date(b.lastCommitDate).getTime() < staleCutoff);
  if (staleBranches.length > 0) {
    insights.push({
      severity: "warning",
      text: `${staleBranches.length} branch${staleBranches.length === 1 ? "" : "es"} have had no commits in ${STALE_BRANCH_DAYS}+ days and aren't merged — consider cleaning them up.`,
    });
  }

  const hotspot = input.fileStats[0];
  if (hotspot && hotspot.changeCount >= 10) {
    insights.push({
      severity: "info",
      text: `${hotspot.path} is the hottest file, changed ${hotspot.changeCount}× — a candidate for splitting or extra test coverage.`,
    });
  }

  if (input.commitStats.weekendPct >= 20) {
    insights.push({ severity: "info", text: `${Math.round(input.commitStats.weekendPct)}% of commits land on weekends.` });
  }

  const releaseIntervals = input.releaseStats.map((r) => r.daysSincePrevious).filter((d): d is number => d != null);
  if (releaseIntervals.length >= 3) {
    const last = releaseIntervals[releaseIntervals.length - 1];
    const priorAvg = average(releaseIntervals.slice(0, -1));
    if (last > priorAvg * 1.5) {
      insights.push({
        severity: "warning",
        text: `The gap since the last release (${last}d) is well above the historical average (${Math.round(priorAvg)}d).`,
      });
    }
  }

  if (input.churnTrend.length >= 6) {
    const recentAvg = average(input.churnTrend.slice(-2).map((m) => m.churn));
    const priorAvg = average(input.churnTrend.slice(-6, -2).map((m) => m.churn));
    if (priorAvg > 0 && recentAvg > priorAvg * 1.4) {
      insights.push({
        severity: "info",
        text: `Code churn is up ${Math.round((recentAvg / priorAvg - 1) * 100)}% over the last 2 months vs. the prior period.`,
      });
    }
  }

  if (input.health.overall >= 80 && !insights.some((i) => i.severity === "warning")) {
    insights.push({ severity: "good", text: "Repository health looks strong — active, well-distributed, and low churn volatility." });
  }

  return insights;
}
