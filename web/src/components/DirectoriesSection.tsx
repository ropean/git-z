import type { DirectoryAgg } from "../stats";

export function DirectoriesSection({ directories, onSelectDirectory }: { directories: DirectoryAgg[]; onSelectDirectory: (path: string) => void }) {
  const top = directories.slice(0, 20);
  const maxChurn = Math.max(1, ...top.map((d) => d.additions + d.deletions));

  return (
    <div id="sec-directories" className="section">
      <div className="section-title">Directories</div>
      <div className="section-subtitle">Top-level directories ranked by lines changed — click a row to filter commits</div>
      {top.length === 0 ? (
        <div className="empty-state">No directory data</div>
      ) : (
        <div className="contributor-list">
          {top.map((d) => {
            const churn = d.additions + d.deletions;
            return (
              <div key={d.path} className="contributor-row" onClick={() => onSelectDirectory(d.path === "(root)" ? "" : d.path)}>
                <div className="contrib-head">
                  <span className="contrib-name">{d.path}</span>
                  <span className="contrib-meta">
                    {d.fileCount} file{d.fileCount === 1 ? "" : "s"} · {d.changeCount} change{d.changeCount === 1 ? "" : "s"} · {d.authors.length} author{d.authors.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="contrib-bar-track">
                  <div style={{ width: `${(churn / maxChurn) * 100}%`, background: "var(--accent)" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
