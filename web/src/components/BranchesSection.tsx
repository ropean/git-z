import type { BranchStat } from "../types";
import { timeAgo } from "../format";

const STALE_DAYS = 90;
const MAX_ROWS = 60;

export function BranchesSection({ branches }: { branches: BranchStat[] }) {
  const now = Date.now();
  const staleCutoff = now - STALE_DAYS * 86400000;
  const active = branches.filter((b) => new Date(b.lastCommitDate).getTime() >= staleCutoff);
  const stale = branches.filter((b) => !b.merged && !b.isDefault && new Date(b.lastCommitDate).getTime() < staleCutoff);
  const merged = branches.filter((b) => b.merged);
  const unmerged = branches.filter((b) => !b.merged && !b.isDefault);

  const rows = [...branches].sort((a, b) => new Date(b.lastCommitDate).getTime() - new Date(a.lastCommitDate).getTime()).slice(0, MAX_ROWS);

  return (
    <div id="sec-branches" className="section">
      <div className="section-title">Branches</div>
      <div className="section-subtitle">Local &amp; remote-tracking branches, most recently active first</div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Total branches</div>
          <div className="kpi-value">{branches.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Active (90d)</div>
          <div className="kpi-value good">{active.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Stale &amp; unmerged</div>
          <div className="kpi-value critical">{stale.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Merged</div>
          <div className="kpi-value">{merged.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Unmerged</div>
          <div className="kpi-value">{unmerged.length}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">No branch data</div>
      ) : (
        <div className="table-card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Branch</th>
                <th>Last commit</th>
                <th>Ahead / behind default</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const isStale = !b.merged && new Date(b.lastCommitDate).getTime() < staleCutoff;
                return (
                  <tr key={b.name}>
                    <td className="stat-table-row-name">
                      {b.name}
                      {b.isRemote && <span className="badge muted" style={{ marginLeft: 6 }}>remote</span>}
                    </td>
                    <td className="td-mono">{timeAgo(b.lastCommitDate)}</td>
                    <td className="ahead-behind">
                      {b.aheadBehindKnown ? (
                        <>
                          <span className="plus-text">+{b.aheadOfDefault}</span> / <span className="minus-text">−{b.behindDefault}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {b.isDefault ? (
                        <span className="badge accent">default</span>
                      ) : b.merged ? (
                        <span className="badge good">merged</span>
                      ) : isStale ? (
                        <span className="badge warning">stale</span>
                      ) : (
                        <span className="badge accent">active</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {branches.length > rows.length && (
        <div className="section-subtitle" style={{ marginTop: 10, marginBottom: 0 }}>
          Showing the {rows.length} most recently active of {branches.length} branches.
        </div>
      )}
    </div>
  );
}
