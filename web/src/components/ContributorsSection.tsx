import type { AuthorAgg } from "../stats";
import { formatNum } from "../format";

interface Props {
  authors: AuthorAgg[];
  authorFilter: string | null;
  onSelectAuthor: (name: string) => void;
  authorColor: (name: string) => string;
}

export function ContributorsSection({ authors, authorFilter, onSelectAuthor, authorColor }: Props) {
  const maxLines = Math.max(1, ...authors.map((a) => a.additions + a.deletions));

  return (
    <div id="sec-contributors" className="section">
      <div className="section-title">Contributors</div>
      {authors.length === 0 ? (
        <div className="empty-state">No contributor data</div>
      ) : (
        <div className="contributor-list">
          {authors.map((a) => (
            <div
              key={a.email || a.name}
              className={"contributor-row" + (authorFilter === a.name ? " active" : "")}
              onClick={() => onSelectAuthor(a.name)}
            >
              <div className="contrib-head">
                <span className="author-dot" style={{ width: 9, height: 9, background: authorColor(a.name) }} />
                <span className="contrib-name">{a.name}</span>
                <span className="contrib-meta">{a.commitCount} commits · +{formatNum(a.additions)} / −{formatNum(a.deletions)}</span>
              </div>
              <div className="contrib-bar-track">
                <div style={{ width: `${(a.additions / maxLines) * 100}%`, background: "var(--good)" }} />
                <div style={{ width: `${(a.deletions / maxLines) * 100}%`, background: "var(--critical)" }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
