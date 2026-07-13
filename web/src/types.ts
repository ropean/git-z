export interface FileChange {
  path: string;
  insertions: number;
  deletions: number;
  binary: boolean;
}

export interface Commit {
  hash: string;
  parents: string[] | null;
  authorName: string;
  authorEmail: string;
  date: string;
  branch?: string;
  subject: string;
  files: FileChange[] | null;
  insertions: number;
  deletions: number;
  rawDiff?: string;
}

export interface AuthorStat {
  name: string;
  email: string;
  commits: number;
  insertions: number;
  deletions: number;
  firstCommit: string;
  lastCommit: string;
}

export interface FileStat {
  path: string;
  commits: number;
  insertions: number;
  deletions: number;
}

export interface Filters {
  since?: string;
  until?: string;
  authors?: string[];
  branch?: string;
  allBranches?: boolean;
  exclude?: string[];
  include?: string[];
  maxCommits?: number;
  diffContent?: boolean;
}

export interface RepoData {
  generatedAt: string;
  repoPath: string;
  branches: string[];
  tags: string[];
  commits: Commit[];
  authors: AuthorStat[];
  files: FileStat[];
  truncated: boolean;
  filters: Filters;
}

declare global {
  interface Window {
    __GIT_DATA__?: RepoData | string;
  }
}
