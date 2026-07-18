# git-z

A git history visualization CLI: analyzes a local repository's commit history and
generates a self-contained HTML report (or JSON). The report page has an English UI
covering overview trends, a filterable commit list (with a real diff detail drawer),
contributors, file heat, file coupling analysis, and a commit-keyword cloud.

## Install

Download a pre-built binary from GitHub Releases.

macOS, Linux, WSL:

```bash
curl -fsSL https://raw.githubusercontent.com/ropean/git-z/main/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/ropean/git-z/main/install.ps1 | iex
```

Windows CMD:

```bat
curl -fsSL https://raw.githubusercontent.com/ropean/git-z/main/install.cmd -o install.cmd && install.cmd && del install.cmd
```

All three install to `~/.local/bin` (i.e. `%USERPROFILE%\.local\bin` on Windows)
and pick the binary matching your CPU architecture (amd64/arm64).

Pin a specific version:

```bash
GITZ_VERSION=v0.1.0 curl -fsSL https://raw.githubusercontent.com/ropean/git-z/main/install.sh | bash
```

```powershell
$env:GITZ_VERSION = "v0.1.0"; irm https://raw.githubusercontent.com/ropean/git-z/main/install.ps1 | iex
```

## Build

```bash
npm run build        # equivalent to build-web then build-cli
./gitz --help          # produces gitz.exe on Windows
```

The frontend (`web/`) is Vite + React + ECharts, bundled into a single
`web/dist/index.html` via `vite-plugin-singlefile`, then embedded into the final
binary with Go's `go:embed`. **`web/dist/` is not committed** — it's a build
artifact, so you must run `npm run build-web` (or `cd web && pnpm install && pnpm run
build`) first; only then will `go build .` / `npm run build-cli` succeed (`go:embed`
requires that directory to exist at compile time — a fresh clone running `go build
.` directly will fail with `pattern web/dist: no matching files found`, which is
expected; just run `npm run build-web` once). Frontend changes likewise need a
`npm run build-web` rerun before `go build` picks up the new output.

## Release

Pushing a tag triggers the GitHub Actions release workflow (6 platforms: linux/darwin/windows × amd64/arm64):

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow builds the frontend once, then cross-compiles the CLI for each
platform and publishes the binaries plus a `checksums.txt` to the GitHub
release. It can also be run manually via `workflow_dispatch` with a `tag` input.

## Usage

```bash
gitz .                                     # analyze the repo in the current directory; writes to
                                           # ~/Downloads/gitz-reports/<repo-name>-<hash>/report-<timestamp>.html
gitz /path/to/repo -o report.html
gitz . --since 2026-01-01 --until 2026-07-01
gitz . --author "Wei,someone@example.com"
gitz . --exclude "node_modules/**,dist/**"
gitz . --branch main
gitz . --all-branches
gitz . --max-commits 5000
gitz . --open
gitz . --format json --output data.json
gitz version
gitz check-update
gitz upgrade [--version v0.1.0]
```

See `gitz --help` for the full flag list.

`gitz version` prints the running build's version (embedded at release-build
time; local `go build` / `npm run build` gives `dev`). `gitz check-update`
compares it against the latest GitHub release. `gitz upgrade` downloads the
matching platform asset and replaces the running binary in place — same
release assets and the same default install location (`~/.local/bin` on every
platform, e.g. `C:\Users\<you>\.local\bin` on Windows) as the install
scripts.

## Project layout

```
cmd/                 cobra command and flag wiring
internal/gitlog      shells out to system git, streams and parses numstat output
internal/model       shared data structures
internal/aggregate   include/exclude glob filtering + author/file/language rollups
internal/render      HTML template injection / JSON output
internal/selfupdate  GitHub release lookup + in-place binary replace (check-update / upgrade)
web/                 frontend source (Vite + React + ECharts)
web/dist/            frontend build output (not committed; run npm run build-web first)
```

## Report sections

Sections are grouped into nav tabs: Overview / Activity / Code / People / Branches
& Releases / Insights.

- **Overview** — health score, KPI cards + trend sparklines, repository facts, and
  a GitHub-style commit-activity heatmap (per year)
- **Activity**
  - **Commits** — filterable (author/file path/message keyword), paginated table;
    clicking a row opens a detail drawer on the right (expand any file there to see
    its real diff — only available if the report was generated with
    `--diff-content`, otherwise just insertion/deletion counts are shown)
  - **Rhythm** — when commits happen, as a weekday × hour heatmap (viewer's local
    time zone)
- **Code**
  - **Structure** — project file tree (`git ls-tree` reads tracked files, which
    naturally respects .gitignore since ignored files were never tracked), with
    expand/collapse and a name filter
  - **Languages** — share of tracked files by byte size at HEAD (same method
    GitHub's language bar uses), plus lines changed by language for the selected
    range
  - **Directories** — top-level directories ranked by lines changed; click a row
    to filter Commits
  - **File Heat** — chips sized/colored by change frequency (🔥 marks
    multi-author hotspots); click one to filter Commits
  - **Coupling** — a network graph + list of files frequently changed together in
    the same commit
- **People**
  - **Contributors** — ranked by commit count, with a bus-factor summary and
    per-author file ownership; click one to filter Commits
- **Branches & Releases**
  - **Branches** — local & remote-tracking branches, most recently active first
  - **Releases** — tags, and the commits/contributors that landed since the
    previous one
- **Insights**
  - **Keywords** — a word cloud of commit-message prefixes (`feat:`/`fix:`/…)
  - **Insights** — composite health score and auto-generated findings (a
    heuristic signal, not a certification)

The top of the report also has quick date-range presets (7/30/90 days, all time),
a custom from/to range picker, and a global search box (author / file path /
message keyword) in the header. The bottom of the report has a footer crediting
git-z and linking back to this repository.

## Known gaps

Not implemented this round: incremental analysis caching, a `.gitz.yaml` config
file, or scheduled CI reports. The design mock's "repo switcher / compare mode"
was intentionally skipped — that existed only to demo two fake mock repos side by
side, and doesn't fit this tool's single-repo-per-report model.
</content>
