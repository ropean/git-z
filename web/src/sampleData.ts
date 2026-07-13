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
  remoteUrl: "https://github.com/ropean/digit",
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
