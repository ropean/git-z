import type { FileAgg } from "../stats";

interface Props {
  files: FileAgg[];
  onSelectFile: (path: string) => void;
}

export function FileHeatSection({ files, onSelectFile }: Props) {
  const top = files.slice(0, 30);
  const maxChange = Math.max(1, ...top.map((f) => f.changeCount));

  return (
    <div id="sec-files" className="section">
      <div className="section-title">File heat</div>
      <div className="section-subtitle">Chip size / intensity reflects change frequency — click a file to filter commits</div>
      {top.length === 0 ? (
        <div className="empty-state">No file change data</div>
      ) : (
        <div className="file-heat-grid">
          {top.map((f) => {
            const t = f.changeCount / maxChange;
            const base = f.path.split("/").pop() ?? f.path;
            return (
              <div
                key={f.path}
                className="file-chip"
                title={`${f.path} (changed ${f.changeCount}×)`}
                onClick={() => onSelectFile(f.path)}
                style={{
                  fontSize: `${11 + t * 8}px`,
                  padding: `${6 + t * 6}px ${10 + t * 6}px`,
                  background: `color-mix(in srgb, var(--accent) ${10 + t * 45}%, transparent)`,
                }}
              >
                {base}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
