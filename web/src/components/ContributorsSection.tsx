import { useMemo } from "react";
import type { AuthorAgg, BusFactor, FileAgg } from "../stats";
import { dominantOwnerShare } from "../stats";
import { formatNum } from "../format";

const OWNERSHIP_THRESHOLD = 0.6;

interface Props {
  authors: AuthorAgg[];
  authorFilter: string | null;
  onSelectAuthor: (name: string) => void;
  authorColor: (name: string) => string;
  busFactor: BusFactor;
  fileStats: FileAgg[];
}

export function ContributorsSection({ authors, authorFilter, onSelectAuthor, authorColor, busFactor, fileStats }: Props) {
  const maxLines = Math.max(1, ...authors.map((a) => a.additions + a.deletions));

  // Files where one author made >=60% of the changes count as "owned" by
  // that author — a simple ownership-concentration signal per contributor.
  const ownedFileCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of fileStats) {
      if (dominantOwnerShare(f) < OWNERSHIP_THRESHOLD) continue;
      const entries = Object.entries(f.authorCounts);
      if (entries.length === 0) continue;
      const [owner] = entries.reduce((best, entry) => (entry[1] > best[1] ? entry : best));
      counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    return counts;
  }, [fileStats]);

  return (
    <div id="sec-contributors" className="section">
      <div className="section-title">Contributors</div>
      {authors.length > 1 && (
        <div className="section-subtitle" style={{ marginBottom: 14 }}>
          Bus factor <strong style={{ color: "var(--text-primary)" }}>{busFactor.count}</strong> of {authors.length} — top
          contributor accounts for {busFactor.topShare.toFixed(0)}% of commits in this range
        </div>
      )}
      {authors.length === 0 ? (
        <div className="empty-state">No contributor data</div>
      ) : (
        <div className="contributor-list">
          {authors.map((a) => {
            const owned = ownedFileCounts.get(a.name) ?? 0;
            return (
              <div
                key={a.email || a.name}
                className={"contributor-row" + (authorFilter === a.name ? " active" : "")}
                onClick={() => onSelectAuthor(a.name)}
              >
                <div className="contrib-head">
                  <span className="author-dot" style={{ width: 9, height: 9, background: authorColor(a.name) }} />
                  <span className="contrib-name">{a.name}</span>
                  <span className="contrib-meta">
                    {a.commitCount} commits · +{formatNum(a.additions)} / −{formatNum(a.deletions)}
                    {owned > 0 ? ` · owns ${owned} file${owned === 1 ? "" : "s"}` : ""}
                  </span>
                </div>
                <div className="contrib-bar-track">
                  <div style={{ width: `${(a.additions / maxLines) * 100}%`, background: "var(--good)" }} />
                  <div style={{ width: `${(a.deletions / maxLines) * 100}%`, background: "var(--critical)" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
