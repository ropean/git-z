import { useMemo } from "react";
import type { CouplingNode, CouplingPair } from "../stats";

const R = 105;
const CX = 140;
const CY = 140;

export function CouplingSection({ pairs, nodes }: { pairs: CouplingPair[]; nodes: CouplingNode[] }) {
  const { positioned, edgeLines } = useMemo(() => {
    const top = nodes.slice(0, 10);
    const maxChange = Math.max(1, ...top.map((n) => n.changeCount));
    const posByPath = new Map<string, { x: number; y: number }>();
    const positioned = top.map((n, i) => {
      const angle = (i / Math.max(1, top.length)) * 2 * Math.PI - Math.PI / 2;
      const pos = { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) };
      posByPath.set(n.path, pos);
      return { path: n.path, x: pos.x, y: pos.y, r: 5 + (n.changeCount / maxChange) * 12 };
    });
    const edgeLines = pairs
      .filter((p) => posByPath.has(p.a) && posByPath.has(p.b))
      .map((p) => {
        const a = posByPath.get(p.a)!;
        const b = posByPath.get(p.b)!;
        return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, w: Math.min(6, 1 + p.count / 2) };
      });
    return { positioned, edgeLines };
  }, [pairs, nodes]);

  const pairsView = pairs.slice(0, 10).map((p) => ({
    a: p.a.split("/").pop() ?? p.a,
    b: p.b.split("/").pop() ?? p.b,
    count: p.count,
  }));

  return (
    <div id="sec-coupling" className="section">
      <div className="section-title">File coupling</div>
      <div className="section-subtitle">Files frequently changed together in the same commit</div>
      <div className="coupling-layout">
        <svg width={280} height={280} style={{ display: "block", maxWidth: "100%" }}>
          {edgeLines.map((e, i) => (
            <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="var(--accent)" strokeWidth={e.w} opacity={0.4} />
          ))}
          {positioned.map((n) => (
            <circle key={n.path} cx={n.x} cy={n.y} r={n.r} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={1.5}>
              <title>{n.path}</title>
            </circle>
          ))}
        </svg>
        <div className="coupling-list">
          {pairsView.map((p, i) => (
            <div className="coupling-row" key={i}>
              <div className="coupling-pair-text">{p.a} ↔ {p.b}</div>
              <div className="coupling-count">{p.count}×</div>
            </div>
          ))}
          {pairsView.length === 0 && <div className="empty-state">Not enough data in this range to analyze coupling</div>}
        </div>
      </div>
    </div>
  );
}
