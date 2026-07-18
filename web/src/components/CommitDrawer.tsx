import { useMemo } from "react";
import type { Commit } from "../types";
import { computeCommitContext } from "../stats";
import { parseDiffByFile } from "../diff";
import { commitUrl, formatDateTime, formatNum } from "../format";

interface Props {
  commit: Commit;
  allCommits: Commit[];
  remoteUrl?: string;
  openFile: string | null;
  onToggleFile: (path: string) => void;
  onClose: () => void;
}

export function CommitDrawer({ commit, allCommits, remoteUrl, openFile, onToggleFile, onClose }: Props) {
  const diffMap = useMemo(() => parseDiffByFile(commit.rawDiff ?? ""), [commit.rawDiff]);
  const hasDiff = !!commit.rawDiff;
  const ctx = useMemo(() => computeCommitContext(commit, allCommits), [commit, allCommits]);
  const net = commit.insertions - commit.deletions;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header">
          <div className="drawer-hash-row">
            <span className="drawer-hash">{commit.hash.slice(0, 10)}</span>
            {commit.branch && <span className="drawer-branch">{commit.branch}</span>}
            {ctx.isMerge && <span className="drawer-branch">merge</span>}
            {remoteUrl && (
              <a className="drawer-remote-link" href={commitUrl(remoteUrl, commit.hash)} target="_blank" rel="noreferrer">
                View on remote ↗
              </a>
            )}
          </div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-meta">{commit.authorName} · {formatDateTime(commit.date)}</div>
        <div className="drawer-message">{commit.subject}</div>
        <div className="drawer-stats">
          <div className="drawer-stat">
            <div className="drawer-stat-label">Changes</div>
            <div className="drawer-stat-value">
              <span className="plus-text">+{formatNum(commit.insertions)}</span> <span className="minus-text">−{formatNum(commit.deletions)}</span>
              <span className="drawer-stat-sub"> · net {net >= 0 ? "+" : ""}{formatNum(net)}</span>
            </div>
          </div>
          <div className="drawer-stat">
            <div className="drawer-stat-label">Files</div>
            <div className="drawer-stat-value">
              {ctx.filesCount}
              <span className="drawer-stat-sub"> · avg {ctx.avgFilesPerCommit.toFixed(1)}</span>
            </div>
          </div>
          <div className="drawer-stat">
            <div className="drawer-stat-label">Size</div>
            <div className="drawer-stat-value">
              &gt;{ctx.sizePercentile}%<span className="drawer-stat-sub"> of commits</span>
            </div>
          </div>
          <div className="drawer-stat">
            <div className="drawer-stat-label">Position</div>
            <div className="drawer-stat-value">
              #{ctx.sequenceIndex}
              <span className="drawer-stat-sub"> of {ctx.totalCommits}</span>
            </div>
          </div>
          {ctx.authorGapDays != null && (
            <div className="drawer-stat drawer-stat-wide">
              <div className="drawer-stat-label">Cadence</div>
              <div className="drawer-stat-value">
                {ctx.authorGapDays === 0 ? "same day as" : `${ctx.authorGapDays}d since`}
                <span className="drawer-stat-sub"> {commit.authorName}'s previous commit</span>
              </div>
            </div>
          )}
        </div>
        <div className="drawer-files-title">Changed files ({commit.files?.length ?? 0})</div>
        <div className="drawer-file-list">
          {(commit.files ?? []).map((f) => {
            const isOpen = openFile === f.path;
            const lines = diffMap.get(f.path);
            return (
              <div key={f.path}>
                <div
                  className={"drawer-file-row" + (isOpen ? " open" : "")}
                  onClick={() => hasDiff && onToggleFile(f.path)}
                  style={{ cursor: hasDiff ? "pointer" : "default" }}
                >
                  <span className="drawer-file-chevron">{hasDiff ? (isOpen ? "▾" : "▸") : " "}</span>
                  <span className="drawer-file-path">{f.path}</span>
                  <span className="plus-text">+{f.insertions}</span>
                  <span className="minus-text">−{f.deletions}</span>
                </div>
                {isOpen && (
                  <div className="diff-block">
                    {lines && lines.length > 0 ? (
                      lines.map((l, i) => (
                        <div key={i} className={"diff-line " + l.type}>
                          {(l.type === "add" ? "+ " : l.type === "del" ? "- " : l.type === "hunk" ? "" : "  ") + l.text}
                        </div>
                      ))
                    ) : (
                      <div className="diff-note">No text diff available for this file (binary or rename).</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!hasDiff && (
          <div className="diff-note">
            Full diff content wasn't captured for this report — rerun gitz with --diff-content to see line-by-line diffs here.
          </div>
        )}
      </div>
    </>
  );
}
