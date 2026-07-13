import type { CommitHeatmap } from "../stats";
import { heatmapColor } from "../theme";
import { formatDate } from "../format";

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function levelFor(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) return 0;
  const ratio = count / maxCount;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export function ContributionHeatmap({ heatmap }: { heatmap: CommitHeatmap }) {
  if (heatmap.weeks.length === 0) {
    return <div className="empty-state">Not enough data to plot a heatmap</div>;
  }
  const gridWidth = heatmap.weeks.length * STEP - GAP;

  return (
    <div className="heatmap-scroll">
      <div className="heatmap-inner" style={{ width: gridWidth + 34 }}>
        <div className="heatmap-months" style={{ marginLeft: 34 }}>
          {heatmap.monthLabels.map((m) => (
            <span key={m.weekIndex} style={{ position: "absolute", left: m.weekIndex * STEP }}>
              {m.label}
            </span>
          ))}
        </div>
        <div className="heatmap-body">
          <div className="heatmap-daylabels">
            {DAY_LABELS.map((label, i) => (
              <span key={i} style={{ height: CELL, marginBottom: i === 6 ? 0 : GAP }}>
                {label}
              </span>
            ))}
          </div>
          <div className="heatmap-grid">
            {heatmap.weeks.map((week, wi) => (
              <div key={wi} className="heatmap-week" style={{ width: CELL, marginRight: wi === heatmap.weeks.length - 1 ? 0 : GAP }}>
                {week.cells.map((cell, di) => {
                  const level = levelFor(cell.count, heatmap.maxCount);
                  return (
                    <div
                      key={di}
                      className="heatmap-cell"
                      style={{ width: CELL, height: CELL, marginBottom: di === 6 ? 0 : GAP, background: heatmapColor(level, "var(--surface-2)") }}
                      title={cell.date ? `${cell.count} commit${cell.count === 1 ? "" : "s"} on ${formatDate(cell.date)}` : undefined}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="heatmap-legend">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <div key={level} className="heatmap-cell" style={{ width: CELL, height: CELL, background: heatmapColor(level, "var(--surface-2)") }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
