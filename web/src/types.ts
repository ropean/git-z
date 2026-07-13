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

export interface LanguageStat {
  language: string;
  bytes: number;
  files: number;
}

export interface BranchStat {
  name: string;
  lastCommitDate: string;
  lastCommitHash: string;
  aheadOfDefault: number;
  behindDefault: number;
  aheadBehindKnown: boolean;
  merged: boolean;
  isRemote: boolean;
  isDefault: boolean;
}

export interface TagStat {
  name: string;
  date: string;
  hash: string;
  annotated: boolean;
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
  remoteUrl?: string;
  currentLines?: number;
  license?: string;
  repoSizeBytes?: number;
  largestFilePath?: string;
  largestFileBytes?: number;
  branches: string[];
  tags: string[];
  commits: Commit[];
  authors: AuthorStat[];
  files: FileStat[];
  languages?: LanguageStat[];
  branchStats?: BranchStat[];
  tagStats?: TagStat[];
  tree: string[];
  truncated: boolean;
  filters: Filters;
}

declare global {
  interface Window {
    __GIT_DATA__?: RepoData | string;
  }
}
