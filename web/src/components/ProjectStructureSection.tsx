import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildTree, collectMatchPaths, copyText, countEntries, formatTreeText, type TreeNode } from "../tree";

function collectAllFolderPaths(node: TreeNode): Set<string> {
  const out = new Set<string>();
  const walk = (n: TreeNode) => {
    for (const c of n.children) {
      if (!c.isFile) {
        out.add(c.path);
        walk(c);
      }
    }
  };
  walk(node);
  return out;
}

export function ProjectStructureSection({ tree }: { tree: string[] }) {
  const root = useMemo(() => buildTree(tree), [tree]);
  const { files, folders } = useMemo(() => countEntries(root), [root]);
  const allFolderPaths = useMemo(() => collectAllFolderPaths(root), [root]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copyTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const copyStructure = async () => {
    const ok = await copyText(formatTreeText(root));
    setCopyState(ok ? "copied" : "failed");
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopyState("idle"), 1500);
  };

  const filterActive = filter.trim().length > 0;
  const matchPaths = useMemo(() => (filterActive ? collectMatchPaths(root, filter.trim()) : null), [filterActive, root, filter]);

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number): ReactNode => {
    if (matchPaths && !matchPaths.has(node.path)) return null;
    const indent = depth * 16;
    if (node.isFile) {
      return (
        <div key={node.path} className="tree-row" style={{ paddingLeft: indent + 18 }}>
          {node.name}
        </div>
      );
    }
    const isOpen = matchPaths ? true : expanded.has(node.path);
    return (
      <div key={node.path}>
        <div className="tree-row tree-folder" style={{ paddingLeft: indent }} onClick={() => toggle(node.path)}>
          <span className="tree-chevron">{isOpen ? "▾" : "▸"}</span>
          {node.name}/
        </div>
        {isOpen && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div id="sec-structure" className="section">
      <div className="section-title">Project structure</div>
      <div className="section-subtitle">
        {files} files in {folders} folders — tracked files only (same set .gitignore already excludes)
      </div>
      <div className="filter-row">
        <input
          className="filter-input"
          type="text"
          placeholder="Filter by name…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="pager-btn" onClick={() => setExpanded(new Set(allFolderPaths))}>Expand all</button>
        <button className="pager-btn" onClick={() => setExpanded(new Set())}>Collapse all</button>
        <button
          className="pager-btn"
          onClick={copyStructure}
          disabled={root.children.length === 0}
          title="Copy the full file structure as indented text"
        >
          {copyState === "copied" ? "Copied!" : copyState === "failed" ? "Copy failed" : "Copy structure"}
        </button>
      </div>
      <div className="table-card tree-view">
        {root.children.length === 0 ? (
          <div className="empty-state">No tracked files</div>
        ) : (
          root.children.map((c) => renderNode(c, 0))
        )}
      </div>
    </div>
  );
}
