import type { Commit } from "../types";
import type { CommitHeatmap } from "../stats";
import { formatNum, formatDate } from "../format";
import { ContributionHeatmap } from "./ContributionHeatmap";

interface Kpi {
  totalCommits: number;
  authorsActive: number;
  filesTouched: number;
  additions: number;
  deletions: number;
}

export function computeKpi(commits: Commit[]): Kpi {
  const authors = new Set<string>();
  const files = new Set<string>();
  let additions = 0;
  let deletions = 0;
  for (const c of commits) {
    authors.add(c.authorEmail || c.authorName);
    for (const f of c.files ?? []) {
      files.add(f.path);
      additions += f.insertions;
      deletions += f.deletions;
    }
  }
  return { totalCommits: commits.length, authorsActive: authors.size, filesTouched: files.size, additions, deletions };
}

interface RepoInfo {
  totalCommits: number;
  totalContributors: number;
  currentLines?: number;
  createdAt?: Date;
  branches: number;
  tags: number;
  remoteUrl?: string;
}

export function OverviewSection({ kpi, heatmap, repo }: { kpi: Kpi; heatmap: CommitHeatmap; repo: RepoInfo }) {
  return (
    <div id="sec-overview" className="section">
      <div className="section-title">Overview</div>
      <div className="section-subtitle">In selected range</div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Commits</div>
          <div className="kpi-value">{kpi.totalCommits}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Active authors</div>
          <div className="kpi-value">{kpi.authorsActive}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Files touched</div>
          <div className="kpi-value">{kpi.filesTouched}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Additions</div>
          <div className="kpi-value good">+{formatNum(kpi.additions)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Deletions</div>
          <div className="kpi-value critical">−{formatNum(kpi.deletions)}</div>
        </div>
      </div>
      <div className="section-subtitle">Repository</div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Total commits</div>
          <div className="kpi-value">{formatNum(repo.totalCommits)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Contributors</div>
          <div className="kpi-value">{repo.totalContributors}</div>
        </div>
        {repo.currentLines != null && (
          <div className="kpi-card">
            <div className="kpi-label">Current lines</div>
            <div className="kpi-value">{formatNum(repo.currentLines)}</div>
          </div>
        )}
        {repo.createdAt && (
          <div className="kpi-card">
            <div className="kpi-label">Created</div>
            <div className="kpi-value">{formatDate(repo.createdAt.toISOString())}</div>
          </div>
        )}
        <div className="kpi-card">
          <div className="kpi-label">Branches</div>
          <div className="kpi-value">{repo.branches}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Tags</div>
          <div className="kpi-value">{repo.tags}</div>
        </div>
        {repo.remoteUrl && (
          <div className="kpi-card">
            <div className="kpi-label">Repository</div>
            <a className="kpi-value kpi-link" href={repo.remoteUrl} target="_blank" rel="noreferrer">
              {repo.remoteUrl.replace(/^https?:\/\//, "")}
            </a>
          </div>
        )}
      </div>
      <div className="section-subtitle">Commit activity (selected range)</div>
      <ContributionHeatmap heatmap={heatmap} />
    </div>
  );
}
