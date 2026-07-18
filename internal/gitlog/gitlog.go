// Package gitlog shells out to the system `git` binary and streams the
// output into model.Commit values without buffering the whole log in memory.
package gitlog

import (
	"bufio"
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/ropean/git-z/internal/model"
)

// headerMarker/fieldSep are control characters that never appear in commit
// metadata, used to delimit our custom --pretty=format record.
const (
	headerMarker = "\x01"
	fieldSep     = "\x1f"
)

// Options configures a single `git log` walk.
type Options struct {
	RepoPath    string
	Since       string
	Until       string
	Authors     []string
	Branch      string
	AllBranches bool
	MaxCommits  int
}

// Walk runs `git log` under opts and invokes fn once per commit, in the
// order git emits them (newest first). fn is called as soon as a commit is
// fully parsed, so memory usage stays bounded regardless of repo size.
func Walk(opts Options, fn func(model.Commit) error) error {
	args := buildLogArgs(opts)
	cmd := exec.Command("git", args...)
	cmd.Dir = opts.RepoPath

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("git log: %w", err)
	}
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("git log: %w", err)
	}

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64*1024), 10*1024*1024)

	var current *model.Commit
	flush := func() error {
		if current == nil {
			return nil
		}
		c := *current
		current = nil
		return fn(c)
	}

	var parseErr error
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, headerMarker) {
			if err := flush(); err != nil {
				parseErr = err
				break
			}
			c, err := parseHeader(line)
			if err != nil {
				parseErr = err
				break
			}
			current = &c
			continue
		}
		if current == nil {
			continue
		}
		if fc, ok := parseNumstat(line); ok {
			current.Files = append(current.Files, fc)
			current.Insertions += fc.Insertions
			current.Deletions += fc.Deletions
		}
	}

	if parseErr == nil {
		parseErr = scanner.Err()
	}
	if parseErr == nil {
		parseErr = flush()
	}

	waitErr := cmd.Wait()
	if parseErr != nil {
		_ = cmd.Process.Kill()
		return parseErr
	}
	if waitErr != nil {
		return fmt.Errorf("git log failed: %w: %s", waitErr, strings.TrimSpace(stderr.String()))
	}
	return nil
}

func buildLogArgs(opts Options) []string {
	args := []string{
		"-c", "core.quotePath=false",
		"log",
		"--no-renames",
		"--numstat",
		"--source",
		"--date=iso-strict",
		"--pretty=format:" + headerMarker + "%H" + fieldSep + "%an" + fieldSep + "%ae" + fieldSep + "%ad" + fieldSep + "%P" + fieldSep + "%S" + fieldSep + "%s",
	}
	if opts.Since != "" {
		args = append(args, "--since="+normalizeRelativeDate(opts.Since))
	}
	if opts.Until != "" {
		args = append(args, "--until="+normalizeRelativeDate(opts.Until))
	}
	for _, a := range opts.Authors {
		a = strings.TrimSpace(a)
		if a != "" {
			args = append(args, "--author="+a)
		}
	}
	if opts.MaxCommits > 0 {
		args = append(args, "-n", strconv.Itoa(opts.MaxCommits))
	}
	if opts.AllBranches {
		args = append(args, "--all")
	} else if opts.Branch != "" {
		args = append(args, opts.Branch)
	}
	return args
}

var relativeDatePattern = regexp.MustCompile(`^(\d+)([dwmy])$`)

// normalizeRelativeDate turns shorthand like "30d" into a form `git log
// --since` understands ("30 days ago"). Anything else (absolute dates,
// or git's own "N days ago" syntax) passes through unchanged.
func normalizeRelativeDate(s string) string {
	m := relativeDatePattern.FindStringSubmatch(strings.TrimSpace(s))
	if m == nil {
		return s
	}
	units := map[string]string{"d": "days", "w": "weeks", "m": "months", "y": "years"}
	return fmt.Sprintf("%s %s ago", m[1], units[m[2]])
}

func parseHeader(line string) (model.Commit, error) {
	rest := strings.TrimPrefix(line, headerMarker)
	parts := strings.SplitN(rest, fieldSep, 7)
	if len(parts) != 7 {
		return model.Commit{}, fmt.Errorf("gitlog: malformed commit header: %q", line)
	}
	date, err := time.Parse(time.RFC3339, parts[3])
	if err != nil {
		return model.Commit{}, fmt.Errorf("gitlog: bad date %q: %w", parts[3], err)
	}
	var parents []string
	if p := strings.TrimSpace(parts[4]); p != "" {
		parents = strings.Split(p, " ")
	}
	return model.Commit{
		Hash:         parts[0],
		AuthorName:   parts[1],
		AuthorEmail:  parts[2],
		Date:         date,
		ParentHashes: parents,
		Branch:       normalizeSourceRef(parts[5]),
		Subject:      parts[6],
	}, nil
}

// normalizeSourceRef strips the refs/heads/ or refs/remotes/ prefix that
// %S (--source) reports when git log expands --all internally, so the
// UI sees plain branch names like "main" or "origin/main".
func normalizeSourceRef(ref string) string {
	ref = strings.TrimPrefix(ref, "refs/heads/")
	ref = strings.TrimPrefix(ref, "refs/remotes/")
	ref = strings.TrimPrefix(ref, "refs/tags/")
	return ref
}

// parseNumstat parses one `--numstat` line: "<ins>\t<del>\t<path>".
// Binary files report "-" for ins/del.
func parseNumstat(line string) (model.FileChange, bool) {
	parts := strings.SplitN(line, "\t", 3)
	if len(parts) != 3 {
		return model.FileChange{}, false
	}
	fc := model.FileChange{Path: parts[2]}
	if parts[0] == "-" || parts[1] == "-" {
		fc.Binary = true
		return fc, true
	}
	ins, err1 := strconv.Atoi(parts[0])
	del, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil {
		return model.FileChange{}, false
	}
	fc.Insertions = ins
	fc.Deletions = del
	return fc, true
}

// Count returns how many commits opts would select, ignoring MaxCommits.
// It's used to detect (and report) truncation when --max-commits is set.
func Count(opts Options) (int, error) {
	args := []string{"rev-list", "--count"}
	if opts.Since != "" {
		args = append(args, "--since="+normalizeRelativeDate(opts.Since))
	}
	if opts.Until != "" {
		args = append(args, "--until="+normalizeRelativeDate(opts.Until))
	}
	for _, a := range opts.Authors {
		a = strings.TrimSpace(a)
		if a != "" {
			args = append(args, "--author="+a)
		}
	}
	if opts.AllBranches {
		args = append(args, "--all")
	} else if opts.Branch != "" {
		args = append(args, opts.Branch)
	} else {
		args = append(args, "HEAD")
	}
	out, err := runGit(opts.RepoPath, args...)
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(strings.TrimSpace(out))
}

// CurrentBranch returns the checked-out branch name (or "HEAD" if detached).
func CurrentBranch(repoPath string) (string, error) {
	out, err := runGit(repoPath, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out), nil
}

// Branches lists local and remote branch short names.
func Branches(repoPath string) ([]string, error) {
	out, err := runGit(repoPath, "branch", "-a", "--format=%(refname:short)")
	if err != nil {
		return nil, err
	}
	return splitNonEmptyLines(out), nil
}

// Tags lists all tag names.
func Tags(repoPath string) ([]string, error) {
	out, err := runGit(repoPath, "tag")
	if err != nil {
		return nil, err
	}
	return splitNonEmptyLines(out), nil
}

// Tree lists tracked file paths in ref's tree. Because it reads the
// committed tree (not the working directory), it automatically excludes
// anything .gitignore'd — an ignored file was never tracked in the first
// place, so there's nothing to filter out.
func Tree(repoPath, ref string) ([]string, error) {
	out, err := runGit(repoPath, "ls-tree", "-r", "--name-only", ref)
	if err != nil {
		return nil, err
	}
	return splitNonEmptyLines(out), nil
}

// TreeSize is one tracked blob's path and byte size at a ref, used to
// estimate language distribution the same way GitHub's language bar does
// (by bytes, not by reading and counting lines of every file).
type TreeSize struct {
	Path  string
	Bytes int64
}

// TreeSizes lists every tracked blob's size in ref's tree via a single
// `git ls-tree -r -l` call.
func TreeSizes(repoPath, ref string) ([]TreeSize, error) {
	out, err := runGit(repoPath, "ls-tree", "-r", "-l", ref)
	if err != nil {
		return nil, err
	}
	lines := strings.Split(out, "\n")
	sizes := make([]TreeSize, 0, len(lines))
	for _, line := range lines {
		tab := strings.IndexByte(line, '\t')
		if tab == -1 {
			continue
		}
		meta := strings.Fields(line[:tab])
		if len(meta) != 4 || meta[1] != "blob" {
			continue
		}
		size, err := strconv.ParseInt(meta[3], 10, 64)
		if err != nil {
			continue // "-" for some special objects (e.g. gitlinks)
		}
		sizes = append(sizes, TreeSize{Path: line[tab+1:], Bytes: size})
	}
	return sizes, nil
}

// licenseFileNames are checked case-insensitively against the repo root.
var licenseFileNames = []string{"license", "license.md", "license.txt", "licence", "licence.md", "copying", "copying.md"}

// DetectLicense looks for a well-known license file at the repo root and
// makes a best-effort guess at which license it is by sniffing common
// phrases in the first few KB — this is a heuristic, not SPDX detection.
func DetectLicense(repoPath string) string {
	entries, err := os.ReadDir(repoPath)
	if err != nil {
		return ""
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		lower := strings.ToLower(e.Name())
		for _, cand := range licenseFileNames {
			if lower == cand {
				return sniffLicenseName(filepath.Join(repoPath, e.Name()), e.Name())
			}
		}
	}
	return ""
}

func sniffLicenseName(path, fallback string) string {
	f, err := os.Open(path)
	if err != nil {
		return fallback
	}
	defer f.Close()
	buf := make([]byte, 4000)
	n, _ := f.Read(buf)
	text := strings.ToUpper(string(buf[:n]))
	switch {
	case strings.Contains(text, "MIT LICENSE"):
		return "MIT"
	case strings.Contains(text, "APACHE LICENSE"):
		return "Apache-2.0"
	case strings.Contains(text, "GNU GENERAL PUBLIC LICENSE") && strings.Contains(text, "VERSION 3"):
		return "GPL-3.0"
	case strings.Contains(text, "GNU GENERAL PUBLIC LICENSE") && strings.Contains(text, "VERSION 2"):
		return "GPL-2.0"
	case strings.Contains(text, "GNU LESSER GENERAL PUBLIC LICENSE"):
		return "LGPL"
	case strings.Contains(text, "MOZILLA PUBLIC LICENSE"):
		return "MPL-2.0"
	case strings.Contains(text, "BSD"):
		return "BSD"
	default:
		return fallback
	}
}

// branchRefInfo is the raw per-ref data read from for-each-ref, before
// merged/ahead-behind enrichment.
type branchRefInfo struct {
	fullRef string
	short   string
	date    time.Time
	hash    string
}

// aheadBehindCap bounds how many branches get a `git rev-list --left-right
// --count` call (one process spawn each) — a repo with hundreds of stale
// branches shouldn't make report generation spawn hundreds of git
// processes. Branches beyond the cap (least recently active) still get
// name/date/merged data, just no ahead/behind counts.
const aheadBehindCap = 60

// BranchDetails enriches branchNames (as returned by Branches) with last
// commit date/hash, merged-into-currentRef state, and ahead/behind counts
// relative to currentRef (capped to the most recently active branches).
// currentRef is the branch the report is being generated for (CLI's
// --branch or the checked-out branch), not necessarily the repo's
// configured default branch.
func BranchDetails(repoPath, currentRef string, branchNames []string) ([]model.BranchStat, error) {
	out, err := runGit(repoPath, "for-each-ref",
		"--format=%(refname)"+fieldSep+"%(refname:short)"+fieldSep+"%(committerdate:iso-strict)"+fieldSep+"%(objectname)",
		"refs/heads", "refs/remotes")
	if err != nil {
		return nil, err
	}

	infos := map[string]branchRefInfo{}
	for _, line := range splitNonEmptyLines(out) {
		parts := strings.Split(line, fieldSep)
		if len(parts) != 4 {
			continue
		}
		d, derr := time.Parse(time.RFC3339, parts[2])
		if derr != nil {
			continue
		}
		infos[parts[1]] = branchRefInfo{fullRef: parts[0], short: parts[1], date: d, hash: parts[3]}
	}

	merged := map[string]bool{}
	if currentRef != "" {
		if mergedOut, merr := runGit(repoPath, "branch", "-a", "--format=%(refname:short)", "--merged", currentRef); merr == nil {
			for _, name := range splitNonEmptyLines(mergedOut) {
				merged[strings.TrimPrefix(name, "* ")] = true
			}
		}
	}

	ordered := make([]branchRefInfo, 0, len(branchNames))
	for _, name := range branchNames {
		if info, ok := infos[name]; ok {
			ordered = append(ordered, info)
		}
	}
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].date.After(ordered[j].date) })

	stats := make([]model.BranchStat, 0, len(ordered))
	for i, info := range ordered {
		bs := model.BranchStat{
			Name:           info.short,
			LastCommitDate: info.date,
			LastCommitHash: info.hash,
			Merged:         merged[info.short],
			IsRemote:       strings.HasPrefix(info.fullRef, "refs/remotes/"),
			IsCurrent:      currentRef != "" && info.short == currentRef,
		}
		switch {
		case bs.IsCurrent:
			bs.AheadBehindKnown = true
			bs.Merged = false // trivially "merged into itself" isn't a meaningful status
		case currentRef != "" && i < aheadBehindCap:
			if ahead, behind, aerr := aheadBehindCount(repoPath, currentRef, info.short); aerr == nil {
				bs.AheadOfCurrent = ahead
				bs.BehindCurrent = behind
				bs.AheadBehindKnown = true
			}
		}
		stats = append(stats, bs)
	}
	return stats, nil
}

// aheadBehindCount returns how many commits branch has that base doesn't
// (ahead) and vice versa (behind), via a single symmetric-difference walk.
func aheadBehindCount(repoPath, base, branch string) (ahead, behind int, err error) {
	out, err := runGit(repoPath, "rev-list", "--left-right", "--count", base+"..."+branch)
	if err != nil {
		return 0, 0, err
	}
	parts := strings.Fields(out)
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("unexpected rev-list --left-right output: %q", out)
	}
	behind, err1 := strconv.Atoi(parts[0])
	ahead, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil {
		return 0, 0, fmt.Errorf("bad rev-list --left-right counts: %q", out)
	}
	return ahead, behind, nil
}

// TagDetails lists every tag with its creation date, target hash, and
// whether it's an annotated tag object, sorted oldest-first (the order
// release-cadence bucketing wants).
func TagDetails(repoPath string) ([]model.TagStat, error) {
	out, err := runGit(repoPath, "for-each-ref",
		"--format=%(refname:short)"+fieldSep+"%(creatordate:iso-strict)"+fieldSep+"%(objectname)"+fieldSep+"%(objecttype)",
		"refs/tags")
	if err != nil {
		return nil, err
	}
	var stats []model.TagStat
	for _, line := range splitNonEmptyLines(out) {
		parts := strings.Split(line, fieldSep)
		if len(parts) != 4 {
			continue
		}
		d, derr := time.Parse(time.RFC3339, parts[1])
		if derr != nil {
			continue
		}
		stats = append(stats, model.TagStat{
			Name:      parts[0],
			Date:      d,
			Hash:      parts[2],
			Annotated: parts[3] == "tag",
		})
	}
	sort.Slice(stats, func(i, j int) bool { return stats[i].Date.Before(stats[j].Date) })
	return stats, nil
}

// Show returns the full patch text for a single commit (used by
// --diff-content). This is comparatively expensive and is only meant to be
// called for commits that survived filtering.
func Show(repoPath, hash string) (string, error) {
	return runGit(repoPath, "show", "--no-color", "-p", "--format=", hash)
}

// emptyTreeHash is git's well-known hash for the empty tree object, present
// in every repository without needing to be created.
const emptyTreeHash = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"

// CurrentLines returns the total line count across every tracked text file
// in ref's tree, by diffing against the empty tree: every line in the
// current tree shows up as a pure insertion, so --shortstat's insertion
// count is exactly the current line total (binary files are excluded by
// git automatically, same as --numstat elsewhere in this package).
func CurrentLines(repoPath, ref string) (int, error) {
	out, err := runGit(repoPath, "diff", "--shortstat", emptyTreeHash, ref)
	if err != nil {
		return 0, err
	}
	m := shortstatInsertions.FindStringSubmatch(out)
	if m == nil {
		return 0, nil
	}
	return strconv.Atoi(m[1])
}

var shortstatInsertions = regexp.MustCompile(`(\d+) insertions?\(\+\)`)

// RemoteURL returns the repo's "origin" remote normalized to a browsable
// https URL (e.g. "https://github.com/owner/repo"), or "" if there's no
// such remote (a purely local repo). SSH and git-protocol remote forms are
// converted; credentials embedded in an https remote are stripped.
func RemoteURL(repoPath string) string {
	out, err := runGit(repoPath, "remote", "get-url", "origin")
	if err != nil {
		return ""
	}
	return normalizeRemoteURL(strings.TrimSpace(out))
}

var (
	scpLikeRemote  = regexp.MustCompile(`^(?:[\w.-]+@)?([\w.-]+):(.+)$`)
	sshSchemeRegex = regexp.MustCompile(`^ssh://(?:[\w.-]+@)?([\w.-]+)(?::\d+)?/(.+)$`)
)

func normalizeRemoteURL(remote string) string {
	remote = strings.TrimSuffix(remote, ".git")

	var host, path string
	switch {
	case strings.HasPrefix(remote, "https://") || strings.HasPrefix(remote, "http://"):
		rest := strings.TrimPrefix(strings.TrimPrefix(remote, "https://"), "http://")
		slash := strings.Index(rest, "/")
		if slash == -1 {
			return ""
		}
		hostPart := rest[:slash]
		if at := strings.LastIndex(hostPart, "@"); at != -1 {
			hostPart = hostPart[at+1:] // strip embedded user[:token]@ credentials
		}
		host, path = hostPart, rest[slash+1:]
	case sshSchemeRegex.MatchString(remote):
		m := sshSchemeRegex.FindStringSubmatch(remote)
		host, path = m[1], m[2]
	case scpLikeRemote.MatchString(remote):
		m := scpLikeRemote.FindStringSubmatch(remote)
		host, path = m[1], m[2]
	default:
		return ""
	}

	path = strings.Trim(path, "/")
	if host == "" || path == "" {
		return ""
	}
	return "https://" + host + "/" + path
}

func splitNonEmptyLines(s string) []string {
	lines := strings.Split(s, "\n")
	out := make([]string, 0, len(lines))
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l != "" {
			out = append(out, l)
		}
	}
	return out
}

func runGit(repoPath string, args ...string) (string, error) {
	args = append([]string{"-c", "core.quotePath=false"}, args...)
	cmd := exec.Command("git", args...)
	cmd.Dir = repoPath
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git %s failed: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(errBuf.String()))
	}
	return out.String(), nil
}
