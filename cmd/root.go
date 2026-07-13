// Package cmd wires the CLI flags (cobra) to the gitlog -> aggregate ->
// render pipeline.
package cmd

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/ropean/digit/internal/aggregate"
	"github.com/ropean/digit/internal/gitlog"
	"github.com/ropean/digit/internal/model"
	"github.com/ropean/digit/internal/render"
)

// WebDist is the embedded frontend build (web/dist), injected by main().
var WebDist fs.FS

var (
	flagOutput      string
	flagSince       string
	flagUntil       string
	flagAuthor      string
	flagBranch      string
	flagAllBranches bool
	flagExclude     string
	flagInclude     string
	flagMaxCommits  int
	flagDiffContent bool
	flagFormat      string
	flagOpen        bool
	flagQuiet       bool
)

var rootCmd = &cobra.Command{
	Use:   "digit <repo-path>",
	Short: "Generate a visual report of a git repository's history",
	Args:  cobra.ExactArgs(1),
	RunE:  runGitViz,
}

func init() {
	flags := rootCmd.Flags()
	flags.StringVarP(&flagOutput, "output", "o", "", "output file path (defaults to <Downloads>/digit-reports/<repo-name>-<hash>/report-<timestamp>.html)")
	flags.StringVar(&flagSince, "since", "", "start date (inclusive); accepts an absolute date or a relative value like 30d")
	flags.StringVar(&flagUntil, "until", "", "end date (inclusive)")
	flags.StringVar(&flagAuthor, "author", "", "filter by author name/email, comma-separated, multiple allowed")
	flags.StringVar(&flagBranch, "branch", "", "branch to analyze (defaults to the current branch)")
	flags.BoolVar(&flagAllBranches, "all-branches", false, "analyze all branches")
	flags.StringVar(&flagExclude, "exclude", "", "glob patterns of paths to exclude, comma-separated")
	flags.StringVar(&flagInclude, "include", "", "glob patterns of paths to include only, comma-separated")
	flags.IntVar(&flagMaxCommits, "max-commits", 0, "max number of commits (0 = unlimited; truncates to the most recent N)")
	flags.BoolVar(&flagDiffContent, "diff-content", false, "extract full diff content (significantly increases size and runtime)")
	flags.StringVar(&flagFormat, "format", "html", "output format: html or json")
	flags.BoolVar(&flagOpen, "open", false, "open the report in the default browser once generated")
	flags.BoolVarP(&flagQuiet, "quiet", "q", false, "quiet mode: only print what's necessary")
}

// Execute runs the root command.
func Execute() error {
	return rootCmd.Execute()
}

func runGitViz(c *cobra.Command, args []string) error {
	repoPath := args[0]
	info, err := os.Stat(repoPath)
	if err != nil || !info.IsDir() {
		return fmt.Errorf("repo path doesn't exist or isn't a directory: %s", repoPath)
	}
	if flagFormat != "html" && flagFormat != "json" {
		return fmt.Errorf("--format only supports html or json, got: %s", flagFormat)
	}

	branch := flagBranch
	if branch == "" && !flagAllBranches {
		branch, err = gitlog.CurrentBranch(repoPath)
		if err != nil {
			return fmt.Errorf("couldn't read the current branch (is %s a git repo?): %w", repoPath, err)
		}
	}

	opts := gitlog.Options{
		RepoPath:    repoPath,
		Since:       flagSince,
		Until:       flagUntil,
		Authors:     splitCSV(flagAuthor),
		Branch:      branch,
		AllBranches: flagAllBranches,
		MaxCommits:  flagMaxCommits,
	}

	truncated := false
	if flagMaxCommits > 0 {
		if total, cerr := gitlog.Count(opts); cerr == nil && total > flagMaxCommits {
			truncated = true
			if !flagQuiet {
				fmt.Fprintf(os.Stderr, "note: repo has %d commits total; truncated to the most recent %d via --max-commits\n", total, flagMaxCommits)
			}
		}
	}

	pathFilter := aggregate.PathFilter{Include: splitCSV(flagInclude), Exclude: splitCSV(flagExclude)}
	hasPathFilter := len(pathFilter.Include) > 0 || len(pathFilter.Exclude) > 0

	var commits []model.Commit
	err = gitlog.Walk(opts, func(commit model.Commit) error {
		commit = pathFilter.Apply(commit)
		if hasPathFilter && len(commit.Files) == 0 {
			return nil
		}
		if flagDiffContent {
			if diff, derr := gitlog.Show(repoPath, commit.Hash); derr == nil {
				commit.RawDiff = diff
			}
		}
		commits = append(commits, commit)
		return nil
	})
	if err != nil {
		return fmt.Errorf("failed to parse git log: %w", err)
	}

	branches, err := gitlog.Branches(repoPath)
	if err != nil {
		return fmt.Errorf("failed to read branch list: %w", err)
	}
	tags, err := gitlog.Tags(repoPath)
	if err != nil {
		return fmt.Errorf("failed to read tag list: %w", err)
	}

	treeRef := branch
	if treeRef == "" {
		treeRef = "HEAD"
	}
	tree, err := gitlog.Tree(repoPath, treeRef)
	if err != nil {
		return fmt.Errorf("failed to read project file tree: %w", err)
	}

	filters := model.Filters{
		Since: flagSince, Until: flagUntil, Authors: opts.Authors,
		Branch: branch, AllBranches: flagAllBranches,
		Exclude: pathFilter.Exclude, Include: pathFilter.Include,
		MaxCommits: flagMaxCommits, DiffContent: flagDiffContent,
	}

	data := aggregate.BuildRepoData(repoPath, commits, branches, tags, filters, truncated)
	data.Tree = tree
	data.RemoteURL = gitlog.RemoteURL(repoPath)
	if lines, lerr := gitlog.CurrentLines(repoPath, treeRef); lerr == nil {
		data.CurrentLines = lines
	}
	data.License = gitlog.DetectLicense(repoPath)
	if sizes, serr := gitlog.TreeSizes(repoPath, treeRef); serr == nil {
		data.Languages = aggregate.ComputeLanguages(sizes)
		for _, s := range sizes {
			data.RepoSizeBytes += s.Bytes
			if s.Bytes > data.LargestFileBytes {
				data.LargestFileBytes = s.Bytes
				data.LargestFilePath = s.Path
			}
		}
	}
	if branchStats, berr := gitlog.BranchDetails(repoPath, branch, branches); berr == nil {
		data.BranchStats = branchStats
	} else if !flagQuiet {
		fmt.Fprintf(os.Stderr, "note: couldn't compute branch details: %v\n", berr)
	}
	if tagStats, terr := gitlog.TagDetails(repoPath); terr == nil {
		data.TagStats = tagStats
	} else if !flagQuiet {
		fmt.Fprintf(os.Stderr, "note: couldn't compute tag details: %v\n", terr)
	}

	outputPath := flagOutput
	if outputPath == "" {
		absRepo, aerr := filepath.Abs(repoPath)
		if aerr != nil {
			absRepo = repoPath
		}
		outputPath, err = defaultOutputPath(absRepo, flagFormat)
		if err != nil {
			return err
		}
	}
	if dir := filepath.Dir(outputPath); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("failed to create output directory: %w", err)
		}
	}

	switch flagFormat {
	case "json":
		err = render.WriteJSON(data, outputPath)
	default:
		err = render.WriteHTML(data, outputPath, WebDist)
	}
	if err != nil {
		return fmt.Errorf("failed to generate report: %w", err)
	}

	if !flagQuiet {
		fmt.Printf("Report generated: %s (%d commits, %d authors)\n", outputPath, len(data.Commits), len(data.Authors))
	}

	if flagOpen {
		if err := openBrowser(outputPath); err != nil && !flagQuiet {
			fmt.Fprintf(os.Stderr, "couldn't open browser automatically: %v\n", err)
		}
	}
	return nil
}

// defaultOutputPath builds the report path used when --output isn't given:
// <Downloads>/digit-reports/<repo-name>-<hash>/report-<MMDDYY-HHmm>.<ext>.
// The hash is derived from the repo's absolute path so the same repo
// always lands in the same subfolder even if its basename collides with
// another repo elsewhere on disk. The timestamp avoids colons so the
// filename is valid on Windows.
func defaultOutputPath(absRepoPath, format string) (string, error) {
	downloads, err := userDownloadsDir()
	if err != nil {
		return "", fmt.Errorf("couldn't locate the system Downloads directory: %w", err)
	}
	repoBase := filepath.Base(absRepoPath)
	ext := "html"
	if format == "json" {
		ext = "json"
	}
	dirName := fmt.Sprintf("%s-%s", repoBase, shortHash(absRepoPath))
	fileName := fmt.Sprintf("report-%s.%s", time.Now().Format("010206-1504"), ext)
	return filepath.Join(downloads, "digit-reports", dirName, fileName), nil
}

func userDownloadsDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Downloads"), nil
}

// shortHash derives a short, stable, filesystem-friendly id from s.
func shortHash(s string) string {
	sum := sha1.Sum([]byte(s))
	return hex.EncodeToString(sum[:])[:7]
}

func splitCSV(s string) []string {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func openBrowser(path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", abs).Start()
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", abs).Start()
	default:
		return exec.Command("xdg-open", abs).Start()
	}
}
