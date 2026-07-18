import type { RepoData } from "./types";

// Used only in `vite dev` (pnpm run dev), where window.__GIT_DATA__ is still
// the literal "%%GIT_VIZ_DATA%%" placeholder because no Go binary has
// injected real data. The production build always sees a real object.
const authors = ["Alice", "Bob", "Carol"];
const files = ["src/app.ts", "src/api.ts", "src/table.tsx", "src/store.ts", "README.md"];
const branches = ["main", "feature/x"];

// Spreads commits across ~370 days with uneven density (gaps and bursts),
// like a real repo's contribution calendar, instead of an even every-other-day
// cadence — so the heatmap has something interesting to render in dev mode.
const start = new Date(2025, 6, 1).getTime();
let dayCursor = 0;
const commitDays = Array.from({ length: 260 }, (_, i) => {
  const jitter = (i * 37) % 11;
  dayCursor += jitter === 0 ? 0 : Math.ceil(jitter / 4); // occasional same-day bursts
  return new Date(start + dayCursor * 86400000);
});

export const sampleData: RepoData = {
  generatedAt: new Date().toISOString(),
  repoPath: "/example/repo",
  remoteUrl: "https://github.com/ropean/git-z",
  currentLines: 18420,
  branches: ["main", "feature/x"],
  tags: ["v1.0.0"],
  truncated: false,
  filters: {},
  commits: commitDays.map((day, i) => {
    const author = authors[i % authors.length];
    const branch = branches[i % 5 === 0 ? 1 : 0];
    const types = ["feat", "fix", "refactor", "docs", "chore"];
    const type = types[i % types.length];
    const f1 = files[i % files.length];
    const f2 = files[(i + 1) % files.length];
    return {
      hash: `abc${i}${"0".repeat(34)}`.slice(0, 40),
      parents: i === 0 ? null : [`abc${i - 1}${"0".repeat(34)}`.slice(0, 40)],
      authorName: author,
      authorEmail: `${author.toLowerCase()}@example.com`,
      date: day.toISOString(),
      branch,
      subject: `${type}: sample change #${i}`,
      files: [
        { path: f1, insertions: 5 + (i % 7), deletions: i % 3, binary: false },
        { path: f2, insertions: 2 + (i % 4), deletions: i % 2, binary: false },
      ],
      insertions: 7 + (i % 7) + (i % 4),
      deletions: (i % 3) + (i % 2),
    };
  }),
  authors: [],
  files: [],
  license: "MIT",
  languages: [
    { language: "TypeScript", bytes: 82000, files: 24 },
    { language: "JavaScript", bytes: 41000, files: 9 },
    { language: "CSS", bytes: 15000, files: 3 },
    { language: "Markdown", bytes: 6000, files: 2 },
    { language: "JSON", bytes: 3000, files: 3 },
  ],
  branchStats: [
    { name: "main", lastCommitDate: new Date(start + dayCursor * 86400000).toISOString(), lastCommitHash: "abc0", aheadOfCurrent: 0, behindCurrent: 0, aheadBehindKnown: true, merged: false, isRemote: false, isCurrent: true },
    { name: "feature/x", lastCommitDate: new Date(start + (dayCursor - 5) * 86400000).toISOString(), lastCommitHash: "abc1", aheadOfCurrent: 4, behindCurrent: 12, aheadBehindKnown: true, merged: false, isRemote: false, isCurrent: false },
    { name: "feature/stale-thing", lastCommitDate: new Date(start).toISOString(), lastCommitHash: "abc2", aheadOfCurrent: 2, behindCurrent: 180, aheadBehindKnown: true, merged: false, isRemote: false, isCurrent: false },
  ],
  tagStats: [
    { name: "v1.0.0", date: new Date(start + 90 * 86400000).toISOString(), hash: "abc90", annotated: true },
    { name: "v1.1.0", date: new Date(start + 170 * 86400000).toISOString(), hash: "abc170", annotated: true },
    { name: "v1.2.0", date: new Date(start + 260 * 86400000).toISOString(), hash: "abc260", annotated: true },
  ],
  tree: [
    "src/app.ts",
    "src/api.ts",
    "src/table.tsx",
    "src/store.ts",
    "src/components/Button.tsx",
    "src/components/Modal.tsx",
    "tests/app.test.ts",
    "README.md",
    "package.json",
  ],
};
