import type { FileAgg } from "../stats";
import { timeAgo } from "../format";

const HOTSPOT_MIN_AUTHORS = 3;

interface Props {
  files: FileAgg[];
  onSelectFile: (path: string) => void;
}

export function FileHeatSection({ files, onSelectFile }: Props) {
  const top = files.slice(0, 30);
  const maxChange = Math.max(1, ...top.map((f) => f.changeCount));

  // Top-quartile churn (across the full set, not just the displayed top 30)
  // combined with a minimum author count flags files worth extra scrutiny —
  // widely-touched, heavily-churned code is the classic refactor candidate.
  const churnDesc = files.map((f) => f.changeCount).sort((a, b) => b - a);
  const quartileThreshold = churnDesc[Math.max(0, Math.ceil(churnDesc.length * 0.25) - 1)] ?? 0;

  return (
    <div id="sec-files" className="section">
      <div className="section-title">File heat</div>
      <div className="section-subtitle">Chip size / intensity reflects change frequency — 🔥 marks multi-author hotspots — click a file to filter commits</div>
      {top.length === 0 ? (
        <div className="empty-state">No file change data</div>
      ) : (
        <div className="file-heat-grid">
          {top.map((f) => {
            const t = f.changeCount / maxChange;
            const base = f.path.split("/").pop() ?? f.path;
            const isHotspot = f.authors.length >= HOTSPOT_MIN_AUTHORS && f.changeCount >= quartileThreshold;
            return (
              <div
                key={f.path}
                className="file-chip"
                title={`${f.path} — changed ${f.changeCount}× by ${f.authors.length} author${f.authors.length === 1 ? "" : "s"}, last modified ${timeAgo(f.lastModified)}`}
                onClick={() => onSelectFile(f.path)}
                style={{
                  fontSize: `${11 + t * 8}px`,
                  padding: `${6 + t * 6}px ${10 + t * 6}px`,
                  background: `color-mix(in srgb, var(--accent) ${10 + t * 45}%, transparent)`,
                }}
              >
                {isHotspot && <span title="Hotspot: multi-author, heavily churned">🔥 </span>}
                {base}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
