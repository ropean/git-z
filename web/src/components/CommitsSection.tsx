import { useMemo } from "react";
import type { Commit } from "../types";
import { formatDate, truncate } from "../format";

const PAGE_SIZE = 18;

interface Props {
  commits: Commit[];
  authorNames: string[];
  authorFilter: string | null;
  onAuthorFilterChange: (v: string | null) => void;
  fileFilter: string;
  onFileFilterChange: (v: string) => void;
  messageFilter: string;
  onMessageFilterChange: (v: string) => void;
  page: number;
  onPageChange: (p: number) => void;
  selectedHash: string | null;
  onSelectCommit: (hash: string) => void;
  authorColor: (name: string) => string;
}

export function CommitsSection(props: Props) {
  const { commits } = props;
  const totalPages = Math.max(1, Math.ceil(commits.length / PAGE_SIZE));
  const page = Math.min(props.page, totalPages);
  const paged = useMemo(() => commits.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [commits, page]);

  return (
    <div id="sec-commits" className="section">
      <div className="section-title">Commits</div>
      <div className="filter-row">
        <select
          className="filter-select"
          value={props.authorFilter ?? ""}
          onChange={(e) => props.onAuthorFilterChange(e.target.value || null)}
        >
          <option value="">All authors</option>
          {props.authorNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <input
          className="filter-input"
          type="text"
          placeholder="Filter by file path…"
          value={props.fileFilter}
          onChange={(e) => props.onFileFilterChange(e.target.value)}
        />
        <input
          className="filter-input"
          type="text"
          placeholder="Filter by commit message keyword…"
          value={props.messageFilter}
          onChange={(e) => props.onMessageFilterChange(e.target.value)}
        />
      </div>
      <div className="table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Author</th>
                <th style={{ width: "46%" }}>Message</th>
                <th>Files</th>
                <th>+/-</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((c) => (
                <tr
                  key={c.hash}
                  className={"commit-row" + (props.selectedHash === c.hash ? " selected" : "")}
                  onClick={() => props.onSelectCommit(c.hash)}
                >
                  <td className="td-mono">{formatDate(c.date)}</td>
                  <td>
                    <span className="author-dot" style={{ background: props.authorColor(c.authorName) }} />
                    {c.authorName}
                  </td>
                  <td className="td-message" title={c.subject}>{truncate(c.subject, 58)}</td>
                  <td className="td-mono">{c.files?.length ?? 0}</td>
                  <td className="td-mono">
                    <span className="plus-text">+{c.insertions}</span> <span className="minus-text">−{c.deletions}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {paged.length === 0 && <div className="empty-state">No commits match the current filters</div>}
      </div>
      <div className="pager-row">
        <button className="pager-btn" disabled={page <= 1} onClick={() => props.onPageChange(page - 1)}>← Prev</button>
        <span className="pager-label">Page {page} / {totalPages} · {commits.length} commits</span>
        <button className="pager-btn" disabled={page >= totalPages} onClick={() => props.onPageChange(page + 1)}>Next →</button>
      </div>
    </div>
  );
}
