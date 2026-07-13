import type { ReleaseAgg } from "../stats";
import { formatDate, formatNum } from "../format";

export function ReleasesSection({ releases }: { releases: ReleaseAgg[] }) {
  const intervals = releases.map((r) => r.daysSincePrevious).filter((d): d is number => d != null);
  const avgInterval = intervals.length ? Math.round(intervals.reduce((sum, d) => sum + d, 0) / intervals.length) : null;
  const avgCommits = releases.length ? Math.round(releases.reduce((sum, r) => sum + r.commits, 0) / releases.length) : 0;
  const maxCommits = Math.max(1, ...releases.map((r) => r.commits));
  const ordered = [...releases].reverse();

  return (
    <div id="sec-releases" className="section">
      <div className="section-title">Releases</div>
      <div className="section-subtitle">Tags, and the commits/contributors that landed since the previous one</div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Total releases</div>
          <div className="kpi-value">{releases.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Avg interval</div>
          <div className="kpi-value">{avgInterval != null ? `${avgInterval}d` : "—"}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Avg commits / release</div>
          <div className="kpi-value">{avgCommits}</div>
        </div>
      </div>

      {ordered.length === 0 ? (
        <div className="empty-state">No tags in this range</div>
      ) : (
        <div className="release-list">
          {ordered.map((r) => (
            <div className="release-row" key={r.name}>
              <span className="release-name">{r.name}</span>
              <span className="release-date">{formatDate(r.date)}</span>
              <div className="contrib-bar-track" style={{ flex: "1 1 100px", minWidth: 80 }}>
                <div style={{ width: `${(r.commits / maxCommits) * 100}%`, background: "var(--accent)" }} />
              </div>
              <span className="release-meta">
                <span>{formatNum(r.commits)} commits</span>
                <span>{r.contributors} contributor{r.contributors === 1 ? "" : "s"}</span>
                {r.daysSincePrevious != null && <span>{r.daysSincePrevious}d since previous</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
