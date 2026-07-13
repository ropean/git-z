import { useMemo } from "react";
import type { Commit } from "../types";
import { categoricalColor } from "../theme";
import { formatDateTime, truncate } from "../format";

const LANE_WIDTH = 90;
const ROW_HEIGHT = 30;

export function BranchGraphSection({ commits, dark }: { commits: Commit[]; dark: boolean }) {
  const { nodes, edges, width, height, legend } = useMemo(() => {
    // Most recent 60 commits, oldest-first so the graph reads top-to-bottom.
    const raw = [...commits].slice(0, 60).reverse();
    const laneOf = new Map<string, number>();
    for (const c of raw) {
      const b = c.branch || "HEAD";
      if (!laneOf.has(b)) laneOf.set(b, laneOf.size);
    }
    const colorFor = (branch: string) => categoricalColor(laneOf.get(branch) ?? 0, dark);

    const posByHash = new Map<string, { x: number; y: number }>();
    raw.forEach((c, i) => {
      const lane = laneOf.get(c.branch || "HEAD") ?? 0;
      posByHash.set(c.hash, { x: lane * LANE_WIDTH + 46, y: i * ROW_HEIGHT + 20 });
    });

    const nodes = raw.map((c) => {
      const pos = posByHash.get(c.hash)!;
      return {
        hash: c.hash,
        x: pos.x,
        y: pos.y,
        color: colorFor(c.branch || "HEAD"),
        tooltip: `${c.hash.slice(0, 7)} · ${c.authorName} · ${formatDateTime(c.date)}\n${truncate(c.subject, 80)}`,
      };
    });

    const edges: { x1: number; y1: number; x2: number; y2: number; color: string; width: number }[] = [];
    for (const c of raw) {
      const p = posByHash.get(c.hash)!;
      for (const parent of c.parents ?? []) {
        const pp = posByHash.get(parent);
        if (pp) edges.push({ x1: pp.x, y1: pp.y, x2: p.x, y2: p.y, color: colorFor(c.branch || "HEAD"), width: (c.parents?.length ?? 0) > 1 ? 2.5 : 1.5 });
      }
    }

    const legend = [...laneOf.entries()].map(([name, i]) => ({ name, color: categoricalColor(i, dark) }));
    const width = Math.max(300, laneOf.size * LANE_WIDTH + 70);
    const height = Math.max(80, raw.length * ROW_HEIGHT + 40);
    return { nodes, edges, width, height, legend };
  }, [commits, dark]);

  return (
    <div id="sec-branches" className="section">
      <div className="section-title">Branch / merge graph</div>
      <div className="section-subtitle">Most recent {nodes.length} commits — hover a node for details</div>
      {legend.length > 0 && (
        <div className="legend-row">
          {legend.map((l) => (
            <div className="legend-item" key={l.name}>
              <span className="legend-swatch" style={{ background: l.color }} />
              {l.name}
            </div>
          ))}
        </div>
      )}
      {nodes.length === 0 ? (
        <div className="empty-state">No commits to graph</div>
      ) : (
        <div className="graph-scroll">
          <svg width={width} height={height} style={{ display: "block", maxWidth: "100%" }}>
            {edges.map((e, i) => (
              <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={e.color} strokeWidth={e.width} opacity={0.55} />
            ))}
            {nodes.map((n) => (
              <circle key={n.hash} cx={n.x} cy={n.y} r={6} fill={n.color} stroke="var(--surface-1)" strokeWidth={1.5}>
                <title>{n.tooltip}</title>
              </circle>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}
