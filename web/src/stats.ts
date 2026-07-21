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
  commits: number;
  authors: number;
  additions: number;
  deletions: number;
  net: number;
  churn: number;
}

// Monthly commit/LOC series — doubles as the churn-stability input for the
// health score and as the source series for Overview sparklines, so there's
// exactly one place that buckets commits by month.
export function computeChurnTrend(commits: Commit[]): ChurnMonth[] {
  const map = new Map<string, { commits: number; authors: Set<string>; additions: number; deletions: number }>();
  for (const c of commits) {
    const key = c.date.slice(0, 7);
    const e = map.get(key) ?? { commits: 0, authors: new Set<string>(), additions: 0, deletions: 0 };
    e.commits++;
    e.authors.add(c.authorEmail || c.authorName);
    e.additions += c.insertions;
    e.deletions += c.deletions;
    map.set(key, e);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, e]) => ({
      month,
      commits: e.commits,
      authors: e.authors.size,
      additions: e.additions,
      deletions: e.deletions,
      net: e.additions - e.deletions,
      churn: e.additions + e.deletions,
    }));
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

// Mirrors internal/aggregate/language.go's extensionLanguages so byte-size
// and churn-based language stats agree on names (and therefore on color).
const EXTENSION_LANGUAGES: Record<string, string> = {
  go: "Go", ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  css: "CSS", scss: "SCSS", sass: "Sass", less: "Less", html: "HTML", htm: "HTML", vue: "Vue", svelte: "Svelte",
  astro: "Astro", mts: "TypeScript", cts: "TypeScript",
  md: "Markdown", mdx: "Markdown", rst: "reStructuredText", adoc: "AsciiDoc", tex: "TeX",
  json: "JSON", yml: "YAML", yaml: "YAML", toml: "TOML", ini: "INI", cfg: "INI", properties: "Properties", csv: "CSV",
  xml: "XML", graphql: "GraphQL", gql: "GraphQL", proto: "Protocol Buffers", tf: "HCL", hcl: "HCL",
  py: "Python", rb: "Ruby", java: "Java", kt: "Kotlin", kts: "Kotlin", groovy: "Groovy", gradle: "Groovy", scala: "Scala",
  c: "C", h: "C", cpp: "C++", cc: "C++", cxx: "C++", hpp: "C++", hxx: "C++", cs: "C#", rs: "Rust", php: "PHP",
  sh: "Shell", bash: "Shell", zsh: "Shell", fish: "Shell", ps1: "PowerShell", psm1: "PowerShell", bat: "Batchfile", cmd: "Batchfile",
  sql: "SQL", swift: "Swift", m: "Objective-C", mm: "Objective-C++", dart: "Dart", lua: "Lua", pl: "Perl", pm: "Perl",
  r: "R", jl: "Julia", hs: "Haskell", ex: "Elixir", exs: "Elixir", erl: "Erlang", clj: "Clojure", cljs: "Clojure",
  fs: "F#", fsx: "F#", ml: "OCaml", mli: "OCaml", nim: "Nim", zig: "Zig", cr: "Crystal", elm: "Elm", sol: "Solidity",
  vb: "Visual Basic", pas: "Pascal", f90: "Fortran", f95: "Fortran", for: "Fortran", asm: "Assembly", s: "Assembly",
  vhd: "VHDL", vhdl: "VHDL", v: "Verilog", matlab: "MATLAB", ipynb: "Jupyter Notebook", coffee: "CoffeeScript",
  pug: "Pug", hbs: "Handlebars", twig: "Twig", vim: "Vim Script", el: "Emacs Lisp", diff: "Diff", patch: "Diff", cmake: "CMake",
  xslt: "XSLT", xsl: "XSLT",
  styl: "Stylus", pcss: "PostCSS", postcss: "PostCSS", prisma: "Prisma", liquid: "Liquid", ejs: "EJS", njk: "Nunjucks",
  erb: "ERB", nix: "Nix", bicep: "Bicep", cabal: "Haskell", txt: "Text", pp: "Puppet", jinja: "Jinja", jinja2: "Jinja", j2: "Jinja",
};

const FILENAME_LANGUAGES: Record<string, string> = {
  dockerfile: "Dockerfile", makefile: "Makefile", gnumakefile: "Makefile", "cmakelists.txt": "CMake",
  rakefile: "Ruby", gemfile: "Ruby", jenkinsfile: "Groovy",
};

// Mirrors internal/aggregate/language.go's ignoredExtensions/ignoredFilenames:
// binary assets and lock/config noise are excluded from churn stats entirely
// rather than falling into "Other".
const IGNORED_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "ico", "svg", "webp", "bmp", "tiff", "tif", "avif", "heic", "cur",
  "woff", "woff2", "ttf", "eot", "otf",
  "mp3", "mp4", "avi", "mov", "wav", "ogg", "webm", "flac", "m4a", "swf",
  "zip", "tar", "gz", "tgz", "rar", "7z", "bz2", "xz",
  "exe", "dll", "so", "dylib", "bin", "dat", "sqlite", "sqlite3", "db", "pdb",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "lock", "map",
]);

const IGNORED_FILENAMES = new Set([
  "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "cargo.lock", "gemfile.lock", "composer.lock",
  ".gitignore", ".gitattributes", ".dockerignore", ".npmrc", ".editorconfig", ".prettierignore", ".eslintignore", ".gitkeep",
  ".ds_store",
  ".prettierrc", ".babelrc", ".nvmrc", ".browserslistrc", ".stylelintrc", ".huskyrc", ".yarnrc", ".npmignore",
  ".flowconfig", ".cfignore", ".nixignore", ".vercelignore",
]);

function isIgnoredPath(base: string): boolean {
  if (IGNORED_FILENAMES.has(base)) return true;
  if (base.startsWith(".env")) return true;
  const dot = base.lastIndexOf(".");
  return dot !== -1 && IGNORED_EXTENSIONS.has(base.slice(dot + 1));
}

function languageForPath(path: string): string | null {
  const base = (path.split("/").pop() ?? path).toLowerCase();
  if (isIgnoredPath(base)) return null;
  if (FILENAME_LANGUAGES[base]) return FILENAME_LANGUAGES[base];
  if (base.startsWith("dockerfile.")) return "Dockerfile";
  const dot = base.lastIndexOf(".");
  if (dot === -1) return "Other";
  return EXTENSION_LANGUAGES[base.slice(dot + 1)] ?? "Other";
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
      if (lang === null) continue;
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

export interface DocHealth {
  hasReadme: boolean;
  hasDocs: boolean;
  daysSinceTouched: number | null;
  score: number;
  detail: string;
}

const README_RE = /^readme(\.[a-z0-9]+)?$/i;
const DOCS_DIR_RE = /(^|\/)docs?\//i;
const DOC_PATH_RE = /^readme(\.[a-z0-9]+)?$|(^|\/)docs?\//i;

// Cheap documentation-presence heuristic: does a README/docs/ exist, and has
// it been touched recently? Not real doc-coverage analysis — that would
// require understanding what's undocumented, which needs semantic parsing
// well beyond a git-log report.
export function computeDocHealth(tree: string[], commits: Commit[], now: Date): DocHealth {
  const hasReadme = tree.some((p) => !p.includes("/") && README_RE.test(p));
  const hasDocs = tree.some((p) => DOCS_DIR_RE.test(p));

  let lastTouchedMs: number | null = null;
  for (const c of commits) {
    if (!(c.files ?? []).some((f) => DOC_PATH_RE.test(f.path))) continue;
    const t = new Date(c.date).getTime();
    if (lastTouchedMs == null || t > lastTouchedMs) lastTouchedMs = t;
  }
  const daysSinceTouched = lastTouchedMs != null ? Math.round((now.getTime() - lastTouchedMs) / DAY_MS) : null;

  let score = (hasReadme ? 50 : 0) + (hasDocs ? 30 : 0);
  let detail: string;
  if (!hasReadme && !hasDocs) {
    detail = "No README or docs/ found";
  } else {
    const freshnessBonus = daysSinceTouched == null ? 0 : clampScore(20 - (daysSinceTouched / 180) * 20);
    score += freshnessBonus;
    const parts = [hasReadme ? "README present" : "no README", hasDocs ? "docs/ present" : "no docs/"];
    parts.push(daysSinceTouched != null ? `last touched ${daysSinceTouched}d ago` : "never updated after initial add");
    detail = parts.join(", ");
  }
  return { hasReadme, hasDocs, daysSinceTouched, score: clampScore(score), detail };
}

export interface TestRatio {
  testFiles: number;
  totalFiles: number;
  ratioPct: number;
}

const TEST_PATH_RE = /(^|\/)(tests?|__tests__|specs?)(\/|$)|\.(test|spec)\.[^/.]+$|_test\.go$|test_[^/]+\.py$/i;

// File-count-based proxy for "are there tests, roughly proportionate to the
// codebase" — not real coverage, which would need instrumented test runs.
export function computeTestRatio(tree: string[]): TestRatio {
  const testFiles = tree.filter((p) => TEST_PATH_RE.test(p)).length;
  return { testFiles, totalFiles: tree.length, ratioPct: tree.length ? (testFiles / tree.length) * 100 : 0 };
}

export interface HealthInput {
  commits: Commit[];
  authorStats: AuthorAgg[];
  busFactor: BusFactor;
  branchStats: BranchStat[];
  releaseStats: ReleaseAgg[];
  churnTrend: ChurnMonth[];
  docHealth: DocHealth;
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
  const unmergedBranches = input.branchStats.filter((b) => !b.merged && !b.isCurrent);
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

  breakdown.push({ label: "Documentation", score: input.docHealth.score, detail: input.docHealth.detail });

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
  const staleBranches = input.branchStats.filter((b) => !b.merged && !b.isCurrent && new Date(b.lastCommitDate).getTime() < staleCutoff);
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

  if (!input.docHealth.hasReadme && !input.docHealth.hasDocs) {
    insights.push({ severity: "info", text: "No README or docs/ directory found — new contributors have nothing to orient from." });
  } else if (input.docHealth.daysSinceTouched != null && input.docHealth.daysSinceTouched > 180) {
    insights.push({ severity: "info", text: `Documentation hasn't been touched in ${input.docHealth.daysSinceTouched}d — worth checking it still matches the code.` });
  }

  if (input.health.overall >= 80 && !insights.some((i) => i.severity === "warning")) {
    insights.push({ severity: "good", text: "Repository health looks strong — active, well-distributed, and low churn volatility." });
  }

  return insights;
}

export type Maturity = "New" | "Growing" | "Established" | "Mature";

// Self-descriptive age bucketing — not a claim about how this compares to
// other repositories, just a label for "how long has this one been around."
export function classifyMaturity(ageDays: number | null): Maturity {
  if (ageDays == null) return "New";
  if (ageDays < 90) return "New";
  if (ageDays < 365) return "Growing";
  if (ageDays < 4 * 365) return "Established";
  return "Mature";
}

export type ActivityLevel = "Low" | "Medium" | "High";

// Self-relative: compares the selected period's commit rate to this same
// repository's own historical median monthly rate, never to other repos
// (we have no cross-repo dataset, and fabricating one would be dishonest).
export function classifyActivityLevel(currentMonthlyRate: number, historicalMonthly: ChurnMonth[]): ActivityLevel {
  const rates = historicalMonthly.map((m) => m.commits).sort((a, b) => a - b);
  const median = rates.length ? rates[Math.floor(rates.length / 2)] : 0;
  if (median <= 0) return currentMonthlyRate > 0 ? "Medium" : "Low";
  const ratio = currentMonthlyRate / median;
  if (ratio < 0.5) return "Low";
  if (ratio > 1.5) return "High";
  return "Medium";
}

export type GrowthDirection = "Growing" | "Stable" | "Shrinking";

// Direction of the last 3 months' net LOC change relative to total churn in
// that window — a repo can churn a lot while staying net-flat, which reads
// as "Stable" rather than "Growing."
export function classifyGrowth(monthly: ChurnMonth[]): GrowthDirection {
  const recent = monthly.slice(-3);
  if (recent.length === 0) return "Stable";
  const netSum = recent.reduce((sum, m) => sum + m.net, 0);
  const churnSum = recent.reduce((sum, m) => sum + m.churn, 0) || 1;
  const ratio = netSum / churnSum;
  if (ratio > 0.1) return "Growing";
  if (ratio < -0.1) return "Shrinking";
  return "Stable";
}

export interface PeriodMetric {
  current: number;
  previous: number | null;
  deltaPct: number | null;
}

export interface PeriodComparison {
  commits: PeriodMetric;
  contributors: PeriodMetric;
  additions: PeriodMetric;
  deletions: PeriodMetric;
}

// Compares the selected [dateFrom, dateTo] window against an equal-length
// window immediately before it, both drawn from the full (unfiltered by
// author/file/message/search) commit history — trend deltas describe "the
// period," not whatever ad-hoc drill-down filter happens to be active.
export function computePeriodComparison(dateFrom: Date, dateTo: Date, allCommits: Commit[]): PeriodComparison {
  const rangeMs = Math.max(DAY_MS, dateTo.getTime() - dateFrom.getTime());
  const prevTo = dateFrom.getTime() - 1;
  const prevFrom = prevTo - rangeMs;

  const timesMs = allCommits.map((c) => new Date(c.date).getTime());
  const earliestMs = timesMs.length ? Math.min(...timesMs) : Infinity;
  const haveEarlierData = earliestMs < dateFrom.getTime();

  const inRange = (t: number, from: number, to: number) => t >= from && t <= to;
  const current: Commit[] = [];
  const previous: Commit[] = [];
  allCommits.forEach((c, i) => {
    const t = timesMs[i];
    if (inRange(t, dateFrom.getTime(), dateTo.getTime())) current.push(c);
    else if (haveEarlierData && inRange(t, prevFrom, prevTo)) previous.push(c);
  });

  const authorsOf = (list: Commit[]) => new Set(list.map((c) => c.authorEmail || c.authorName)).size;
  const sumIns = (list: Commit[]) => list.reduce((sum, c) => sum + c.insertions, 0);
  const sumDel = (list: Commit[]) => list.reduce((sum, c) => sum + c.deletions, 0);

  function metric(currentValue: number, previousValue: number): PeriodMetric {
    if (!haveEarlierData) return { current: currentValue, previous: null, deltaPct: null };
    if (previousValue === 0) return { current: currentValue, previous: previousValue, deltaPct: currentValue === 0 ? 0 : null };
    return { current: currentValue, previous: previousValue, deltaPct: ((currentValue - previousValue) / previousValue) * 100 };
  }

  return {
    commits: metric(current.length, previous.length),
    contributors: metric(authorsOf(current), authorsOf(previous)),
    additions: metric(sumIns(current), sumIns(previous)),
    deletions: metric(sumDel(current), sumDel(previous)),
  };
}

export interface ExecutiveSummaryInput {
  repoAgeDays: number | null;
  maturity: Maturity;
  totalCommits: number;
  totalContributors: number;
  activityLevel: ActivityLevel;
  growth: GrowthDirection;
  currentLines: number | null;
  health: HealthScore;
  insights: Insight[];
}

function healthLabel(score: number): string {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 50) return "fair";
  return "needs attention";
}

// Rule-based prose summary — there's no LLM at report-generation time (this
// is a static offline HTML file), so this assembles a few template
// sentences from data already computed elsewhere, rather than fabricating
// language-model-style analysis.
export function generateExecutiveSummary(input: ExecutiveSummaryInput): string {
  // Thresholds mirror the Age fact card's own label (OverviewSection) so the
  // summary prose and the exact figure never disagree with each other.
  const ageText =
    input.repoAgeDays == null
      ? ""
      : input.repoAgeDays < 60
        ? `${input.repoAgeDays}-day-old`
        : input.repoAgeDays < 730
          ? `${Math.round(input.repoAgeDays / 30)}-month-old`
          : `${(input.repoAgeDays / 365).toFixed(1)}-year-old`;

  const sentences: string[] = [
    `This is a ${input.maturity.toLowerCase()}${ageText ? `, ${ageText}` : ""} repository with ${input.totalCommits.toLocaleString()} commits from ${input.totalContributors} contributor${input.totalContributors === 1 ? "" : "s"}.`,
    `Development activity is ${input.activityLevel.toLowerCase()} and the codebase is ${input.growth.toLowerCase()}${input.currentLines != null ? `, currently at ${input.currentLines.toLocaleString()} lines` : ""}.`,
  ];

  const topWarning = input.insights.find((i) => i.severity === "warning");
  sentences.push(
    `Overall health is ${healthLabel(input.health.overall)} (${input.health.overall}/100)${
      topWarning ? ` — the main thing to watch: ${topWarning.text}` : ", with no major risks currently flagged."
    }`,
  );

  return sentences.join(" ");
}
