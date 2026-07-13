import type { CSSProperties } from "react";
import type { Commit } from "../types";
import type { ActivityLevel, ChurnMonth, GrowthDirection, HealthScore, Maturity, PeriodComparison, PeriodMetric, TestRatio } from "../stats";
import { formatNum, formatDate, formatBytes, timeAgo } from "../format";
import { ContributionHeatmap } from "./ContributionHeatmap";

function scoreColor(score: number): string {
  if (score >= 80) return "var(--good)";
  if (score >= 50) return "var(--accent)";
  return "var(--critical)";
}

function maturityBadgeClass(): string {
  return "badge muted";
}
function activityBadgeClass(level: ActivityLevel): string {
  if (level === "High") return "badge good";
  if (level === "Low") return "badge warning";
  return "badge accent";
}
function growthBadgeClass(growth: GrowthDirection): string {
  if (growth === "Growing") return "badge good";
  if (growth === "Shrinking") return "badge warning";
  return "badge muted";
}

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
  license?: string;
  primaryLanguage?: string;
  avgCommitsPerDay: number;
  defaultBranch?: string;
  lastCommitDate?: Date;
  lastReleaseDate?: string;
  totalFiles: number;
  totalDirectories: number;
  repoSizeBytes?: number;
  largestFilePath?: string;
  largestFileBytes?: number;
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 26;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg className="sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrendLine({ metric }: { metric: PeriodMetric }) {
  if (metric.deltaPct == null) return <div className="kpi-trend flat">vs prior period: —</div>;
  const dir = metric.deltaPct > 0.5 ? "up" : metric.deltaPct < -0.5 ? "down" : "flat";
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "→";
  return (
    <div className={`kpi-trend ${dir}`}>
      {arrow} {metric.deltaPct >= 0 ? "+" : ""}
      {metric.deltaPct.toFixed(0)}% vs prior period
    </div>
  );
}

function Tier2Card({
  label,
  displayValue,
  valueClassName,
  metric,
  sparklineValues,
}: {
  label: string;
  displayValue: string;
  valueClassName?: string;
  metric: PeriodMetric;
  sparklineValues?: number[];
}) {
  const color = valueClassName === "good" ? "var(--good)" : valueClassName === "critical" ? "var(--critical)" : "var(--accent)";
  return (
    <div className="kpi-card tier2">
      <div className="kpi-label">{label}</div>
      <div className={"kpi-value" + (valueClassName ? ` ${valueClassName}` : "")}>{displayValue}</div>
      <TrendLine metric={metric} />
      {sparklineValues && sparklineValues.length >= 2 && <Sparkline values={sparklineValues} color={color} />}
    </div>
  );
}

export function OverviewSection({
  kpi,
  commits,
  repo,
  health,
  periodComparison,
  monthlySeries,
  maturity,
  activityLevel,
  growth,
  executiveSummary,
  testRatio,
  docDetail,
}: {
  kpi: Kpi;
  commits: Commit[];
  repo: RepoInfo;
  health: HealthScore;
  periodComparison: PeriodComparison;
  monthlySeries: ChurnMonth[];
  maturity: Maturity;
  activityLevel: ActivityLevel;
  growth: GrowthDirection;
  executiveSummary: string;
  testRatio: TestRatio;
  docDetail: string;
}) {
  const ageDays = repo.createdAt ? Math.round((Date.now() - repo.createdAt.getTime()) / 86400000) : null;
  const ageLabel = ageDays == null ? "—" : ageDays < 60 ? `${ageDays}d` : ageDays < 730 ? `${Math.round(ageDays / 30)}mo` : `${(ageDays / 365).toFixed(1)}y`;
  const gaugeStyle: CSSProperties = {
    background: `conic-gradient(${scoreColor(health.overall)} calc(${health.overall} * 3.6deg), var(--surface-2) 0)`,
  };
  const commitSpark = monthlySeries.slice(-12).map((m) => m.commits);
  const locSpark = (() => {
    let running = repo.currentLines ?? 0;
    const series = monthlySeries.slice(-12);
    const totalNet = series.reduce((s, m) => s + m.net, 0);
    running -= totalNet;
    return series.map((m) => (running += m.net));
  })();

  return (
    <div id="sec-overview" className="section">
      <div className="section-title">Overview</div>
      <div className="section-subtitle">Repository snapshot</div>

      <div className="health-hero">
        <div className="health-gauge-wrap">
          <div className="health-gauge" style={gaugeStyle}>
            <div className="health-gauge-inner">
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "var(--mono)" }}>{health.overall}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>/ 100</div>
            </div>
          </div>
          <div className="health-gauge-label">Health score</div>
        </div>
        <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, minWidth: 0 }}>
          <div className="status-chip-row">
            <span className={maturityBadgeClass()}>{maturity}</span>
            <span className={activityBadgeClass(activityLevel)}>{activityLevel} activity</span>
            <span className={growthBadgeClass(growth)}>{growth}</span>
          </div>
          <p className="exec-summary">{executiveSummary}</p>
        </div>
      </div>

      <div className="section-subtitle" style={{ marginTop: 22 }}>
        Activity (selected range)
      </div>
      <div className="kpi-grid tier2">
        <Tier2Card label="Commits" displayValue={formatNum(kpi.totalCommits)} metric={periodComparison.commits} sparklineValues={commitSpark} />
        <Tier2Card label="Active contributors" displayValue={String(kpi.authorsActive)} metric={periodComparison.contributors} />
        <Tier2Card label="Additions" displayValue={`+${formatNum(kpi.additions)}`} valueClassName="good" metric={periodComparison.additions} />
        <Tier2Card label="Deletions" displayValue={`−${formatNum(kpi.deletions)}`} valueClassName="critical" metric={periodComparison.deletions} />
        {repo.currentLines != null && (
          <Tier2Card label="Current lines" displayValue={formatNum(repo.currentLines)} metric={{ current: repo.currentLines, previous: null, deltaPct: null }} sparklineValues={locSpark} />
        )}
      </div>

      <div className="section-subtitle" style={{ marginTop: 22 }}>
        Repository
      </div>

      <div className="facts-group">
        <div className="facts-group-label">Identity</div>
        <div className="kpi-grid tier3">
          <div className="kpi-card">
            <div className="kpi-label">Default branch</div>
            <div className="kpi-value">{repo.defaultBranch || "—"}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Primary language</div>
            <div className="kpi-value">{repo.primaryLanguage ?? "—"}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">License</div>
            <div className="kpi-value">{repo.license || "None detected"}</div>
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
      </div>

      <div className="facts-group">
        <div className="facts-group-label">Age</div>
        <div className="kpi-grid tier3">
          {repo.createdAt && (
            <div className="kpi-card">
              <div className="kpi-label">Created</div>
              <div className="kpi-value">{formatDate(repo.createdAt.toISOString())}</div>
            </div>
          )}
          <div className="kpi-card">
            <div className="kpi-label">Repository age</div>
            <div className="kpi-value">{ageLabel}</div>
          </div>
          {repo.lastCommitDate && (
            <div className="kpi-card">
              <div className="kpi-label">Last commit</div>
              <div className="kpi-value">{timeAgo(repo.lastCommitDate.toISOString())}</div>
            </div>
          )}
          <div className="kpi-card">
            <div className="kpi-label">Last release</div>
            <div className="kpi-value">{repo.lastReleaseDate ? timeAgo(repo.lastReleaseDate) : "—"}</div>
          </div>
        </div>
      </div>

      <div className="facts-group">
        <div className="facts-group-label">Scale</div>
        <div className="kpi-grid tier3">
          <div className="kpi-card">
            <div className="kpi-label">Files</div>
            <div className="kpi-value">{formatNum(repo.totalFiles)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Directories</div>
            <div className="kpi-value">{formatNum(repo.totalDirectories)}</div>
          </div>
          {repo.repoSizeBytes != null && (
            <div className="kpi-card">
              <div className="kpi-label">Tracked size</div>
              <div className="kpi-value">{formatBytes(repo.repoSizeBytes)}</div>
            </div>
          )}
          {repo.largestFilePath && (
            <div className="kpi-card">
              <div className="kpi-label">Largest file</div>
              <div className="kpi-value" style={{ fontSize: 13 }} title={repo.largestFilePath}>
                {repo.largestFilePath.split("/").pop()} · {formatBytes(repo.largestFileBytes ?? 0)}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="facts-group">
        <div className="facts-group-label">Development</div>
        <div className="kpi-grid tier3">
          <div className="kpi-card">
            <div className="kpi-label">Total commits</div>
            <div className="kpi-value">{formatNum(repo.totalCommits)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Contributors</div>
            <div className="kpi-value">{repo.totalContributors}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Branches</div>
            <div className="kpi-value">{repo.branches}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Tags</div>
            <div className="kpi-value">{repo.tags}</div>
          </div>
        </div>
      </div>

      <div className="facts-group">
        <div className="facts-group-label">Quality (heuristic, not measured coverage)</div>
        <div className="kpi-grid tier3">
          <div className="kpi-card">
            <div className="kpi-label">Test file ratio</div>
            <div className="kpi-value">{testRatio.ratioPct.toFixed(1)}%</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Documentation</div>
            <div className="kpi-value" style={{ fontSize: 13 }}>
              {docDetail}
            </div>
          </div>
        </div>
      </div>

      <div className="section-subtitle" style={{ marginTop: 22 }}>
        Commit activity (selected range)
      </div>
      <ContributionHeatmap commits={commits} />
    </div>
  );
}
