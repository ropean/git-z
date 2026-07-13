// Package gitlog shells out to the system `git` binary and streams the
// output into model.Commit values without buffering the whole log in memory.
package gitlog

import (
	"bufio"
	"bytes"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/ropean/digit/internal/model"
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
