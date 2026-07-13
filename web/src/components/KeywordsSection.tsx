import type { KeywordCount } from "../stats";

export function KeywordsSection({ keywords }: { keywords: KeywordCount[] }) {
  const maxCount = Math.max(1, ...keywords.map((k) => k.count));

  return (
    <div id="sec-keywords" className="section">
      <div className="section-title">Commit keywords</div>
      <div className="section-subtitle">Conventional-commit prefixes extracted from messages, sized by frequency</div>
      {keywords.length === 0 ? (
        <div className="empty-state">No data</div>
      ) : (
        <div className="keyword-cloud">
          {keywords.map((k) => {
            const t = k.count / maxCount;
            return (
              <span
                key={k.word}
                title={`${k.count} commits`}
                style={{
                  fontSize: `${13 + t * 22}px`,
                  color: t > 0.5 ? "var(--accent)" : "var(--text-secondary)",
                  fontWeight: t > 0.6 ? 700 : 500,
                  fontFamily: "var(--mono)",
                }}
              >
                {k.word}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
