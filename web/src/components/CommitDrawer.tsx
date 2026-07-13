import { useMemo } from "react";
import type { Commit } from "../types";
import { parseDiffByFile } from "../diff";
import { commitUrl, formatDateTime } from "../format";

interface Props {
  commit: Commit;
  remoteUrl?: string;
  openFile: string | null;
  onToggleFile: (path: string) => void;
  onClose: () => void;
}

export function CommitDrawer({ commit, remoteUrl, openFile, onToggleFile, onClose }: Props) {
  const diffMap = useMemo(() => parseDiffByFile(commit.rawDiff ?? ""), [commit.rawDiff]);
  const hasDiff = !!commit.rawDiff;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header">
          <div className="drawer-hash-row">
            <span className="drawer-hash">{commit.hash.slice(0, 10)}</span>
            {commit.branch && <span className="drawer-branch">{commit.branch}</span>}
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
            Full diff content wasn't captured for this report — rerun digit with --diff-content to see line-by-line diffs here.
          </div>
        )}
      </div>
    </>
  );
}
