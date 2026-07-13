import type { EChartsOption } from "echarts";
import type { Commit } from "../types";
import type { GrowthWeek } from "../stats";
import { categorical, chartChrome } from "../theme";
import { formatNum } from "../format";
import { EChart } from "./EChart";

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

export function OverviewSection({ kpi, growth, dark }: { kpi: Kpi; growth: GrowthWeek[]; dark: boolean }) {
  const chrome = chartChrome(dark);
  const color = (dark ? categorical.dark : categorical.light)[0];

  const option: EChartsOption = {
    color: [color],
    tooltip: { trigger: "axis" },
    grid: { left: 50, right: 16, top: 16, bottom: 30 },
    xAxis: {
      type: "category",
      data: growth.map((g) => g.week),
      axisLine: { lineStyle: { color: chrome.baseline } },
      axisLabel: { color: chrome.muted, hideOverlap: true },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: chrome.gridline } },
      axisLabel: { color: chrome.muted },
    },
    series: [
      {
        name: "Net lines (cumulative)",
        type: "line",
        data: growth.map((g) => g.cumulative),
        symbol: "none",
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.15 },
      },
    ],
  };

  return (
    <div id="sec-overview" className="section">
      <div className="section-title">Overview</div>
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
      <div className="section-subtitle">Codebase size trend (weekly, cumulative net lines)</div>
      {growth.length > 1 ? (
        <EChart option={option} height={200} dark={dark} />
      ) : (
        <div className="empty-state">Not enough data to plot a trend</div>
      )}
    </div>
  );
}
