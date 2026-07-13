import type { SurvivalMonth } from "../stats";
import { formatNum } from "../format";

export function SurvivalSection({ survival }: { survival: SurvivalMonth[] }) {
  const maxAdded = Math.max(1, ...survival.map((s) => s.added));

  return (
    <div id="sec-survival" className="section">
      <div className="section-title">Code survival (estimated)</div>
      <div className="section-subtitle">
        Lines added per month vs. an estimated share still present today — a decay heuristic, not a real git-blame
        analysis
      </div>
      <div className="legend-row">
        <div className="legend-item">
          <span className="legend-swatch" style={{ background: "var(--text-muted)", opacity: 0.4 }} />
          Added that month
        </div>
        <div className="legend-item">
          <span className="legend-swatch" style={{ background: "var(--accent)" }} />
          Estimated surviving
        </div>
      </div>
      {survival.length === 0 ? (
        <div className="empty-state">No data</div>
      ) : (
        <div className="survival-chart">
          {survival.map((s) => (
            <div className="survival-col" key={s.month}>
              <div className="survival-bar-pair">
                <div
                  className="survival-bar"
                  title={`Added ${formatNum(s.added)} lines`}
                  style={{ height: `${(s.added / maxAdded) * 140}px`, background: "var(--text-muted)", opacity: 0.4 }}
                />
                <div
                  className="survival-bar"
                  title={`Estimated surviving ${formatNum(s.surviving)} lines`}
                  style={{ height: `${(s.surviving / maxAdded) * 140}px`, background: "var(--accent)" }}
                />
              </div>
              <div className="survival-month-label">{s.month.slice(2)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
