// Package cmd wires the CLI flags (cobra) to the gitlog -> aggregate ->
// render pipeline.
package cmd

import (
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

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
	Use:   "git-viz <repo-path>",
	Short: "生成 Git 仓库历史的可视化报告",
	Args:  cobra.ExactArgs(1),
	RunE:  runGitViz,
}

func init() {
	flags := rootCmd.Flags()
	flags.StringVarP(&flagOutput, "output", "o", "./git-viz-report.html", "输出文件路径")
	flags.StringVar(&flagSince, "since", "", "起始日期（含），支持绝对日期或相对值如 30d")
	flags.StringVar(&flagUntil, "until", "", "截止日期（含）")
	flags.StringVar(&flagAuthor, "author", "", "按作者名/邮箱过滤，逗号分隔，支持多个")
	flags.StringVar(&flagBranch, "branch", "", "指定分支，默认取当前分支")
	flags.BoolVar(&flagAllBranches, "all-branches", false, "分析所有分支")
	flags.StringVar(&flagExclude, "exclude", "", "排除路径的 glob 模式，逗号分隔")
	flags.StringVar(&flagInclude, "include", "", "只包含匹配路径的 glob 模式，逗号分隔")
	flags.IntVar(&flagMaxCommits, "max-commits", 0, "最大提交数（0 为不限制，超过则按时间倒序截断）")
	flags.BoolVar(&flagDiffContent, "diff-content", false, "提取完整 diff 内容（会显著增大体积和耗时）")
	flags.StringVar(&flagFormat, "format", "html", "输出格式：html 或 json")
	flags.BoolVar(&flagOpen, "open", false, "生成后自动用默认浏览器打开")
	flags.BoolVarP(&flagQuiet, "quiet", "q", false, "静默模式，只输出必要信息")
}

// Execute runs the root command.
func Execute() error {
	return rootCmd.Execute()
}

func runGitViz(c *cobra.Command, args []string) error {
	repoPath := args[0]
	info, err := os.Stat(repoPath)
	if err != nil || !info.IsDir() {
		return fmt.Errorf("仓库路径不存在或不是目录: %s", repoPath)
	}
	if flagFormat != "html" && flagFormat != "json" {
		return fmt.Errorf("--format 只支持 html 或 json，收到: %s", flagFormat)
	}

	branch := flagBranch
	if branch == "" && !flagAllBranches {
		branch, err = gitlog.CurrentBranch(repoPath)
		if err != nil {
			return fmt.Errorf("无法读取当前分支（%s 是 git 仓库吗？）: %w", repoPath, err)
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
				fmt.Fprintf(os.Stderr, "提示: 仓库共有 %d 条提交，已按 --max-commits 截取最近 %d 条\n", total, flagMaxCommits)
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
		return fmt.Errorf("解析 git log 失败: %w", err)
	}

	branches, err := gitlog.Branches(repoPath)
	if err != nil {
		return fmt.Errorf("读取分支列表失败: %w", err)
	}
	tags, err := gitlog.Tags(repoPath)
	if err != nil {
		return fmt.Errorf("读取标签列表失败: %w", err)
	}

	filters := model.Filters{
		Since: flagSince, Until: flagUntil, Authors: opts.Authors,
		Branch: branch, AllBranches: flagAllBranches,
		Exclude: pathFilter.Exclude, Include: pathFilter.Include,
		MaxCommits: flagMaxCommits, DiffContent: flagDiffContent,
	}

	data := aggregate.BuildRepoData(repoPath, commits, branches, tags, filters, truncated)

	outputPath := flagOutput
	if dir := filepath.Dir(outputPath); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("创建输出目录失败: %w", err)
		}
	}

	switch flagFormat {
	case "json":
		err = render.WriteJSON(data, outputPath)
	default:
		err = render.WriteHTML(data, outputPath, WebDist)
	}
	if err != nil {
		return fmt.Errorf("生成报告失败: %w", err)
	}

	if !flagQuiet {
		fmt.Printf("已生成报告: %s (%d 条提交, %d 位作者)\n", outputPath, len(data.Commits), len(data.Authors))
	}

	if flagOpen {
		if err := openBrowser(outputPath); err != nil && !flagQuiet {
			fmt.Fprintf(os.Stderr, "无法自动打开浏览器: %v\n", err)
		}
	}
	return nil
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
