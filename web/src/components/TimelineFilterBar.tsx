import { useMemo, useState } from "react";
import type { DensityDay } from "../stats";
import { formatDate } from "../format";

const DAY_MS = 86400000;

interface Props {
  minDate: Date;
  maxDate: Date;
  dateFrom: Date;
  dateTo: Date;
  quickRange: string;
  density: DensityDay[];
  onQuickRange: (id: string) => void;
  onCustomFrom: (iso: string) => void;
  onCustomTo: (iso: string) => void;
  onRangeFrom: (dayIndex: number) => void;
  onRangeTo: (dayIndex: number) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  filteredCount: number;
  totalCount: number;
}

const QUICK_DEFS = [
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
  { id: "90", label: "Last 90 days" },
  { id: "all", label: "All time" },
];

export function TimelineFilterBar(props: Props) {
  const { minDate, maxDate, dateFrom, dateTo, quickRange, density } = props;
  const [showCustom, setShowCustom] = useState(false);
  const totalDaySpan = Math.max(1, Math.round((maxDate.getTime() - minDate.getTime()) / DAY_MS));
  const fromDayIndex = Math.round((dateFrom.getTime() - minDate.getTime()) / DAY_MS);
  const toDayIndex = Math.round((dateTo.getTime() - minDate.getTime()) / DAY_MS);
  const maxDensity = useMemo(() => Math.max(1, ...density.map((d) => d.count)), [density]);

  return (
    <div className="timeline-bar">
      <div className="quick-row">
        {QUICK_DEFS.map((q) => (
          <button
            key={q.id}
            className={"quick-btn" + (quickRange === q.id ? " active" : "")}
            onClick={() => props.onQuickRange(q.id)}
          >
            {q.label}
          </button>
        ))}
        <button
          className={"quick-btn" + (showCustom ? " active" : "")}
          onClick={() => setShowCustom((v) => !v)}
        >
          Custom range…
        </button>
        {props.hasActiveFilters && (
          <button className="clear-btn" onClick={props.onClearFilters}>
            Clear filters ({props.filteredCount} / {props.totalCount})
          </button>
        )}
      </div>
      {showCustom && (
        <div className="date-inputs-row">
          <input
            type="date"
            className="date-input"
            value={formatDate(dateFrom.toISOString())}
            onChange={(e) => e.target.value && props.onCustomFrom(e.target.value)}
          />
          <span className="date-sep">→</span>
          <input
            type="date"
            className="date-input"
            value={formatDate(dateTo.toISOString())}
            onChange={(e) => e.target.value && props.onCustomTo(e.target.value)}
          />
        </div>
      )}
      <div className="density-wrap">
        <div className="density-bars">
          {density.map((d) => {
            const t = new Date(d.date).getTime();
            const inRange = t >= dateFrom.getTime() && t <= dateTo.getTime();
            return (
              <div
                key={d.date}
                className="density-bar"
                title={`${d.date}: ${d.count} commit${d.count === 1 ? "" : "s"}`}
                style={{
                  height: `${4 + (d.count / maxDensity) * 40}px`,
                  background: inRange ? "var(--accent)" : "var(--baseline)",
                  opacity: inRange ? 0.9 : 0.5,
                }}
              />
            );
          })}
        </div>
        <input
          type="range"
          className="range-input"
          min={0}
          max={totalDaySpan}
          value={fromDayIndex}
          onChange={(e) => props.onRangeFrom(Number(e.target.value))}
        />
        <input
          type="range"
          className="range-input range-input-top"
          min={0}
          max={totalDaySpan}
          value={toDayIndex}
          onChange={(e) => props.onRangeTo(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
