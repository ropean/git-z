export interface DiffLine {
  type: "add" | "del" | "ctx" | "hunk";
  text: string;
}

const MAX_LINES_PER_FILE = 400;

// Splits a unified diff produced by `git show -p` (as fetched by
// --diff-content) into per-file line lists. Real diff content only —
// there's no synthetic fallback here; callers should check for an empty
// map and show insertion/deletion counts only.
export function parseDiffByFile(rawDiff: string): Map<string, DiffLine[]> {
  const result = new Map<string, DiffLine[]>();
  if (!rawDiff) return result;

  const lines = rawDiff.split("\n");
  let currentPath: string | null = null;
  let currentLines: DiffLine[] = [];
  let truncated = false;

  const flush = () => {
    if (currentPath) result.set(currentPath, currentLines);
    currentPath = null;
    currentLines = [];
    truncated = false;
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      flush();
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      currentPath = m ? m[2] : line.slice("diff --git ".length);
      continue;
    }
    if (currentPath === null) continue;
    if (line.startsWith("+++ ")) {
      const p = line.slice(4).replace(/^b\//, "");
      if (p !== "/dev/null") currentPath = p;
      continue;
    }
    if (line.startsWith("--- ") || line.startsWith("index ") || line.startsWith("new file mode") || line.startsWith("deleted file mode") || line.startsWith("similarity index") || line.startsWith("rename from") || line.startsWith("rename to") || line.startsWith("Binary files")) {
      continue;
    }
    if (truncated) continue;
    if (currentLines.length >= MAX_LINES_PER_FILE) {
      currentLines.push({ type: "hunk", text: "… diff truncated …" });
      truncated = true;
      continue;
    }
    if (line.startsWith("@@")) {
      currentLines.push({ type: "hunk", text: line });
    } else if (line.startsWith("+")) {
      currentLines.push({ type: "add", text: line.slice(1) });
    } else if (line.startsWith("-")) {
      currentLines.push({ type: "del", text: line.slice(1) });
    } else if (line.startsWith(" ")) {
      currentLines.push({ type: "ctx", text: line.slice(1) });
    }
  }
  flush();
  return result;
}
