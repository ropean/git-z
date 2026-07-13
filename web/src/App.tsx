import { useMemo } from "react";
import type { RepoData } from "./types";
import { StatTile } from "./components/StatTile";
import { CommitTimelineChart } from "./components/CommitTimelineChart";
import { AuthorLeaderboardChart } from "./components/AuthorLeaderboardChart";
import { FileChurnChart } from "./components/FileChurnChart";
import { AuthorTable } from "./components/AuthorTable";

function fmtDateTime(s: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString("zh-CN");
}

function fmtDate(s: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("zh-CN");
}

export function App({ data }: { data: RepoData }) {
  const stats = useMemo(() => {
    const totalInsertions = data.commits.reduce((s, c) => s + c.insertions, 0);
    const totalDeletions = data.commits.reduce((s, c) => s + c.deletions, 0);
    const dates = data.commits.map((c) => new Date(c.date).getTime()).filter((t) => !Number.isNaN(t));
    const min = dates.length ? new Date(Math.min(...dates)) : null;
    const max = dates.length ? new Date(Math.max(...dates)) : null;
    return {
      totalInsertions,
      totalDeletions,
      dateRange: min && max ? `${fmtDate(min.toISOString())} ~ ${fmtDate(max.toISOString())}` : "-",
    };
  }, [data.commits]);

  const filterChips: string[] = [];
  const f = data.filters;
  if (f.since) filterChips.push(`起始: ${f.since}`);
  if (f.until) filterChips.push(`截止: ${f.until}`);
  if (f.authors?.length) filterChips.push(`作者: ${f.authors.join(", ")}`);
  if (f.allBranches) filterChips.push("全部分支");
  else if (f.branch) filterChips.push(`分支: ${f.branch}`);
  if (f.include?.length) filterChips.push(`包含: ${f.include.join(", ")}`);
  if (f.exclude?.length) filterChips.push(`排除: ${f.exclude.join(", ")}`);
  if (f.maxCommits) filterChips.push(`最大提交数: ${f.maxCommits}`);

  return (
    <div className="app">
      <div className="header">
        <h1>Git 历史可视化报告</h1>
        <div className="meta">
          <span>仓库: {data.repoPath}</span>
          <span>生成时间: {fmtDateTime(data.generatedAt)}</span>
          {filterChips.map((c) => (
            <span key={c}>· {c}</span>
          ))}
        </div>
      </div>

      {data.truncated && (
        <div className="banner">
          注意：本报告已按 --max-commits 截断，仅展示最近的部分提交，统计数据基于截断后的子集。
        </div>
      )}

      <div className="stat-grid">
        <StatTile label="提交数" value={String(data.commits.length)} />
        <StatTile label="作者数" value={String(data.authors.length)} />
        <StatTile label="涉及文件数" value={String(data.files.length)} />
        <StatTile label="新增 / 删除行数" value={`+${stats.totalInsertions} / -${stats.totalDeletions}`} />
        <StatTile label="时间范围" value={stats.dateRange} />
      </div>

      <div className="card">
        <h2>提交活跃度</h2>
        <CommitTimelineChart commits={data.commits} />
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>作者排行（按提交数）</h2>
          <AuthorLeaderboardChart authors={data.authors} />
        </div>
        <div className="card">
          <h2>文件变更热度（增删行数）</h2>
          <FileChurnChart files={data.files} />
        </div>
      </div>

      <div className="card">
        <h2>作者明细</h2>
        <AuthorTable authors={data.authors} />
      </div>
    </div>
  );
}
