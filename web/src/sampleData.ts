import type { RepoData } from "./types";

// Used only in `vite dev` (pnpm run dev), where window.__GIT_DATA__ is still
// the literal "%%GIT_VIZ_DATA%%" placeholder because no Go binary has
// injected real data. The production build always sees a real object.
export const sampleData: RepoData = {
  generatedAt: new Date().toISOString(),
  repoPath: "/example/repo",
  branches: ["main", "develop"],
  tags: ["v1.0.0"],
  truncated: false,
  filters: {},
  commits: Array.from({ length: 40 }, (_, i) => {
    const day = new Date(2026, 0, 1 + i * 2);
    const author = ["Alice", "Bob", "Carol"][i % 3];
    return {
      hash: `abc${i}`,
      parents: i === 0 ? null : [`abc${i - 1}`],
      authorName: author,
      authorEmail: `${author.toLowerCase()}@example.com`,
      date: day.toISOString(),
      subject: `示例提交 #${i}`,
      files: [
        { path: `src/file${i % 5}.ts`, insertions: 5 + (i % 7), deletions: i % 3, binary: false },
      ],
      insertions: 5 + (i % 7),
      deletions: i % 3,
    };
  }),
  authors: [
    { name: "Alice", email: "alice@example.com", commits: 14, insertions: 320, deletions: 45, firstCommit: "2026-01-01", lastCommit: "2026-03-01" },
    { name: "Bob", email: "bob@example.com", commits: 13, insertions: 210, deletions: 30, firstCommit: "2026-01-02", lastCommit: "2026-03-02" },
    { name: "Carol", email: "carol@example.com", commits: 13, insertions: 180, deletions: 20, firstCommit: "2026-01-03", lastCommit: "2026-03-03" },
  ],
  files: [
    { path: "src/file0.ts", commits: 8, insertions: 60, deletions: 10 },
    { path: "src/file1.ts", commits: 8, insertions: 55, deletions: 8 },
    { path: "src/file2.ts", commits: 8, insertions: 50, deletions: 7 },
    { path: "src/file3.ts", commits: 8, insertions: 45, deletions: 6 },
    { path: "src/file4.ts", commits: 8, insertions: 40, deletions: 5 },
  ],
};
