export interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children: TreeNode[];
}

// Builds a nested tree from git's flat "a/b/c.ts" path list (always
// forward-slash separated, regardless of host OS).
export function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: "", path: "", isFile: false, children: [] };
  for (const p of paths) {
    const parts = p.split("/").filter(Boolean);
    let cur = root;
    let acc = "";
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part;
      const isFile = i === parts.length - 1;
      let child = cur.children.find((c) => c.name === part && c.isFile === isFile);
      if (!child) {
        child = { name: part, path: acc, isFile, children: [] };
        cur.children.push(child);
      }
      cur = child;
    });
  }
  sortTree(root);
  return root;
}

function sortTree(node: TreeNode) {
  node.children.sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(sortTree);
}

export function countEntries(node: TreeNode): { files: number; folders: number } {
  let files = 0;
  let folders = 0;
  const walk = (n: TreeNode) => {
    for (const c of n.children) {
      if (c.isFile) files++;
      else {
        folders++;
        walk(c);
      }
    }
  };
  walk(node);
  return { files, folders };
}

// Paths (folder + file) of every node that either matches `query` itself or
// has a descendant that does — used to auto-expand+show only relevant
// branches while filtering.
export function collectMatchPaths(node: TreeNode, query: string): Set<string> {
  const q = query.toLowerCase();
  const keep = new Set<string>();
  const visit = (n: TreeNode): boolean => {
    let selfMatch = n.name.toLowerCase().includes(q);
    let childMatch = false;
    for (const c of n.children) {
      if (visit(c)) childMatch = true;
    }
    if (selfMatch || childMatch) {
      keep.add(n.path);
      return true;
    }
    return false;
  };
  for (const c of node.children) visit(c);
  return keep;
}

// Renders the full tree as plain text in the classic `tree` layout
// (├── / └── connectors, │ guides), folders suffixed with "/". Every node
// is included regardless of the UI's expand/filter state.
export function formatTreeText(root: TreeNode, rootLabel = "."): string {
  const lines: string[] = [rootLabel];
  const walk = (n: TreeNode, prefix: string) => {
    n.children.forEach((c, i) => {
      const last = i === n.children.length - 1;
      lines.push(`${prefix}${last ? "└── " : "├── "}${c.name}${c.isFile ? "" : "/"}`);
      if (!c.isFile) walk(c, prefix + (last ? "    " : "│   "));
    });
  };
  walk(root, "");
  return lines.join("\n") + "\n";
}

// Copies text to the clipboard; falls back to execCommand for contexts
// (e.g. some file:// pages) where the async Clipboard API is unavailable.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}
