# digit

A git history visualization CLI: analyzes a local repository's commit history and
generates a self-contained HTML report (or JSON). The report page has an English UI
covering overview trends, a filterable commit list (with a real diff detail drawer),
contributors, file heat, file coupling analysis, an estimated code-survival curve,
and a commit-keyword cloud.

## Build

```bash
make build        # equivalent to build-web then build-cli
./digit --help     # produces digit.exe on Windows
```

The frontend (`web/`) is Vite + React + ECharts, bundled into a single
`web/dist/index.html` via `vite-plugin-singlefile`, then embedded into the final
binary with Go's `go:embed`. **`web/dist/` is not committed** — it's a build
artifact, so you must run `make build-web` (or `cd web && pnpm install && pnpm run
build`) first; only then will `go build .` / `make build-cli` succeed (`go:embed`
requires that directory to exist at compile time — a fresh clone running `go build
.` directly will fail with `pattern web/dist: no matching files found`, which is
expected; just run `make build-web` once). Frontend changes likewise need a
`make build-web` rerun before `go build` picks up the new output.

## Usage

```bash
digit .                                   # analyze the repo in the current directory; writes to
                                           # ~/Downloads/digit-reports/<repo-name>-<hash>/report-<timestamp>.html
digit /path/to/repo -o report.html
digit . --since 2026-01-01 --until 2026-07-01
digit . --author "Wei,someone@example.com"
digit . --exclude "node_modules/**,dist/**"
digit . --branch main
digit . --all-branches
digit . --max-commits 5000
digit . --open
digit . --format json --output data.json
```

See `digit --help` for the full flag list.

## Project layout

```
cmd/                 cobra command and flag wiring
internal/gitlog      shells out to system git, streams and parses numstat output
internal/model       shared data structures
internal/aggregate   include/exclude glob filtering + author/file rollups
internal/render      HTML template injection / JSON output
web/                 frontend source (Vite + React + ECharts)
web/dist/            frontend build output (not committed; run make build-web first)
```

## Report sections

- **Overview** — KPI cards + a weekly codebase-size trend chart
- **Structure** — project file tree (`git ls-tree` reads tracked files, which
  naturally respects .gitignore since ignored files were never tracked), with
  expand/collapse and a name filter
- **Commits** — filterable (author/file path/message keyword), paginated table;
  clicking a row opens a detail drawer on the right (expand any file there to see
  its real diff — only available if the report was generated with `--diff-content`,
  otherwise just insertion/deletion counts are shown)
- **Contributors** — ranked by commit count; click one to filter Commits
- **File Heat** — chips sized/colored by change frequency; click one to filter
  Commits
- **Coupling** — a network graph + list of files frequently changed together in the
  same commit
- **Survival (estimated)** — lines added per month vs. an estimated surviving
  share, computed with a decay heuristic (not a real `git blame` analysis)
- **Keywords** — a word cloud of commit-message prefixes (`feat:`/`fix:`/…)

The top of the report also has quick date-range presets, a custom-range picker, a
commit-density histogram with a dual-handle brush selector, and a global search box.

## Known gaps

Not implemented this round: incremental analysis caching, a `.digit.yaml` config
file, or scheduled CI reports. The design mock's "repo switcher / compare mode"
was intentionally skipped — that existed only to demo two fake mock repos side by
side, and doesn't fit this tool's single-repo-per-report model.
