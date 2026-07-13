import { useMemo } from "react";
import type { LanguageStat } from "../types";
import type { LanguageActivity } from "../stats";
import { categoricalColor } from "../theme";
import { formatNum } from "../format";

export function LanguagesSection({
  languages,
  activity,
  dark,
}: {
  languages: LanguageStat[];
  activity: LanguageActivity[];
  dark: boolean;
}) {
  const totalBytes = languages.reduce((sum, l) => sum + l.bytes, 0);
  const totalChurn = activity.reduce((sum, a) => sum + a.churn, 0);
  const topActivity = activity.slice(0, 10);

  // Same language must render as the same color in both charts below, even
  // though one is ordered by byte size and the other by churn — so color is
  // keyed by language name (indexed off the byte-size list, the canonical
  // ordering) rather than by position within whichever list is being drawn.
  const colorIndex = useMemo(() => {
    const m = new Map<string, number>();
    languages.forEach((l, i) => m.set(l.language, i));
    const extra = activity.map((a) => a.language).filter((name) => !m.has(name)).sort();
    extra.forEach((name, i) => m.set(name, languages.length + i));
    return m;
  }, [languages, activity]);
  const colorFor = (name: string) => categoricalColor(colorIndex.get(name) ?? 0, dark);

  return (
    <div id="sec-languages" className="section">
      <div className="section-title">Languages</div>
      <div className="section-subtitle">Share of tracked files by byte size at HEAD (same method GitHub's language bar uses)</div>
      {languages.length === 0 || totalBytes === 0 ? (
        <div className="empty-state">No language data</div>
      ) : (
        <>
          <div className="lang-bar">
            {languages.map((l) => (
              <div
                key={l.language}
                className="lang-bar-seg"
                title={`${l.language} — ${((l.bytes / totalBytes) * 100).toFixed(1)}%`}
                style={{ width: `${(l.bytes / totalBytes) * 100}%`, background: colorFor(l.language) }}
              />
            ))}
          </div>
          <div className="lang-legend">
            {languages.map((l) => (
              <div key={l.language} className="lang-legend-item">
                <span className="legend-swatch" style={{ background: colorFor(l.language) }} />
                <span className="lang-legend-name" title={l.language}>{l.language}</span>
                <span className="lang-legend-pct">
                  {((l.bytes / totalBytes) * 100).toFixed(1)}% · {l.files} file{l.files === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {topActivity.length > 0 && totalChurn > 0 && (
        <>
          <div className="section-subtitle" style={{ marginTop: 24 }}>Lines changed by language (selected range)</div>
          <div className="contributor-list">
            {topActivity.map((a) => (
              <div className="contributor-row" key={a.language} style={{ cursor: "default" }}>
                <div className="contrib-head">
                  <span className="author-dot" style={{ background: colorFor(a.language) }} />
                  <span className="contrib-name">{a.language}</span>
                  <span className="contrib-meta">{formatNum(a.churn)} lines changed</span>
                </div>
                <div className="contrib-bar-track">
                  <div style={{ width: `${(a.churn / totalChurn) * 100}%`, background: colorFor(a.language) }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
