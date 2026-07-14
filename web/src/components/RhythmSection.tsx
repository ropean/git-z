import { useMemo } from "react";
import type { Commit } from "../types";
import type { CommitStats } from "../stats";
import { heatmapColor } from "../theme";
import { formatNum } from "../format";
import { useElementWidth } from "../useElementWidth";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MIN_CELL = 8;
const MAX_CELL = 16;
const GAP = 3;
const LABEL_WIDTH = 34;
const CELL_LEGEND = 11;
const HOURS = 24;

function levelFor(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) return 0;
  const ratio = count / maxCount;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export function RhythmSection({ commits, commitStats }: { commits: Commit[]; commitStats: CommitStats }) {
  const { grid, maxCount } = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const c of commits) {
      const d = new Date(c.date);
      grid[d.getDay()][d.getHours()]++;
    }
    const maxCount = Math.max(0, ...grid.map((row) => Math.max(...row)));
    return { grid, maxCount };
  }, [commits]);

  const peak = useMemo(() => {
    let best = { day: 0, hour: 0, count: -1 };
    grid.forEach((row, day) => row.forEach((count, hour) => {
      if (count > best.count) best = { day, hour, count };
    }));
    return best;
  }, [grid]);

  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const available = Math.max(0, width - LABEL_WIDTH);
  const rawStep = width > 0 ? available / HOURS : MAX_CELL + GAP;
  const step = Math.min(MAX_CELL + GAP, Math.max(MIN_CELL + GAP, rawStep));
  const cell = step - GAP;

  const stats = [
    { label: "Merge commits", value: formatNum(commitStats.mergeCommits) },
    { label: "Avg commits / day", value: commitStats.avgPerDay.toFixed(1) },
    { label: "Avg files / commit", value: commitStats.avgFilesChanged.toFixed(1) },
    { label: "Weekend commits", value: `${commitStats.weekendPct.toFixed(0)}%` },
    { label: "Work-hours commits", value: `${commitStats.workHoursPct.toFixed(0)}%` },
  ];

  return (
    <div id="sec-rhythm" className="section">
      <div className="section-title">Rhythm</div>
      <div className="section-subtitle">When commits happen — weekday × hour (viewer's local time zone)</div>

      <div className="kpi-grid tier2" style={{ margin: "14px 0 22px" }}>
        {stats.map((s) => (
          <div className="kpi-card tier2" key={s.label}>
            <div className="kpi-label">{s.label}</div>
            <div className="kpi-value">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="rhythm-chart">
        {commits.length === 0 ? (
          <div className="empty-state">No commits in this range</div>
        ) : (
          <>
            <div ref={wrapRef}>
              <div style={{ display: "flex" }}>
                <div className="heatmap-daylabels" style={{ width: LABEL_WIDTH - 4, marginTop: 16 }}>
                  {WEEKDAY_LABELS.map((label) => (
                    <span key={label} style={{ height: cell, marginBottom: GAP, lineHeight: `${cell}px` }}>{label}</span>
                  ))}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", marginBottom: 4 }}>
                    {Array.from({ length: HOURS }, (_, h) => (
                      <div key={h} style={{ width: cell + GAP, fontSize: 9, color: "var(--text-muted)", textAlign: "center" }}>
                        {h % 3 === 0 ? h : ""}
                      </div>
                    ))}
                  </div>
                  {grid.map((row, day) => (
                    <div key={day} style={{ display: "flex", marginBottom: GAP }}>
                      {row.map((count, hour) => (
                        <div
                          key={hour}
                          className="heatmap-cell"
                          title={`${WEEKDAY_LABELS[day]} ${hour}:00 — ${count} commit${count === 1 ? "" : "s"}`}
                          style={{
                            width: cell,
                            height: cell,
                            marginRight: GAP,
                            background: heatmapColor(levelFor(count, maxCount), "var(--surface-2)"),
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="heatmap-controls" style={{ marginLeft: LABEL_WIDTH, width: HOURS * step }}>
              {peak.count > 0 && (
                <div className="section-subtitle" style={{ margin: 0 }}>
                  Peak: {WEEKDAY_LABELS[peak.day]} at {peak.hour}:00 ({formatNum(peak.count)} commits)
                </div>
              )}
              <div className="heatmap-legend">
                <span>Less</span>
                {[0, 1, 2, 3, 4].map((level) => (
                  <div key={level} className="heatmap-cell" style={{ width: CELL_LEGEND, height: CELL_LEGEND, background: heatmapColor(level, "var(--surface-2)") }} />
                ))}
                <span>More</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
