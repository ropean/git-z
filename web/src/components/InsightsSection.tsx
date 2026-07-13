import type { CSSProperties } from "react";
import type { HealthScore, Insight } from "../stats";

const SEVERITY_ICON: Record<Insight["severity"], string> = { good: "✓", warning: "⚠", info: "•" };

function scoreColor(score: number): string {
  if (score >= 80) return "var(--good)";
  if (score >= 50) return "var(--accent)";
  return "var(--critical)";
}

export function InsightsSection({ health, insights }: { health: HealthScore; insights: Insight[] }) {
  const gaugeStyle: CSSProperties = {
    background: `conic-gradient(${scoreColor(health.overall)} calc(${health.overall} * 3.6deg), var(--surface-2) 0)`,
  };

  return (
    <div id="sec-insights" className="section">
      <div className="section-title">Insights</div>
      <div className="section-subtitle">Composite health score and auto-generated findings — a heuristic signal, not a certification</div>

      <div className="health-hero">
        <div className="health-gauge-wrap">
          <div className="health-gauge" style={gaugeStyle}>
            <div className="health-gauge-inner">
              <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--mono)" }}>{health.overall}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>/ 100</div>
            </div>
          </div>
          <div className="health-gauge-label">Overall health</div>
        </div>
        <div className="health-breakdown" style={{ flex: 1, marginTop: 0, justifyContent: "center" }}>
          {health.breakdown.map((b) => (
            <div className="health-breakdown-row" key={b.label}>
              <span className="health-breakdown-label">{b.label}</span>
              <div className="health-breakdown-track">
                <div className="health-breakdown-fill" style={{ width: `${b.score}%`, background: scoreColor(b.score) }} />
              </div>
              <span className="health-breakdown-detail">{b.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {insights.length === 0 ? (
        <div className="empty-state">No notable findings in this range</div>
      ) : (
        <div className="insight-cards">
          {insights.map((insight, i) => (
            <div className={`insight-card ${insight.severity}`} key={i}>
              <span className="insight-icon">{SEVERITY_ICON[insight.severity]}</span>
              <span>{insight.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
