// Package aggregate applies path include/exclude filters to parsed commits
// and rolls them up into per-author and per-file statistics.
package aggregate

import (
	"sort"
	"time"

	"github.com/bmatcuk/doublestar/v4"

	"github.com/ropean/git-z/internal/model"
)

// PathFilter narrows a commit's file list down to matching paths.
type PathFilter struct {
	Include []string
	Exclude []string
}

// Apply returns a copy of c with Files (and the derived Insertions/Deletions
// totals) restricted to paths that pass the include/exclude glob patterns.
// A commit that ends up with zero files after filtering is still returned;
// callers that only want touched commits should check len(Files).
func (f PathFilter) Apply(c model.Commit) model.Commit {
	if len(f.Include) == 0 && len(f.Exclude) == 0 {
		return c
	}
	filtered := make([]model.FileChange, 0, len(c.Files))
	ins, del := 0, 0
	for _, fc := range c.Files {
		if !f.matches(fc.Path) {
			continue
		}
		filtered = append(filtered, fc)
		ins += fc.Insertions
		del += fc.Deletions
	}
	c.Files = filtered
	c.Insertions = ins
	c.Deletions = del
	return c
}

func (f PathFilter) matches(path string) bool {
	if len(f.Include) > 0 && !anyGlobMatch(f.Include, path) {
		return false
	}
	if anyGlobMatch(f.Exclude, path) {
		return false
	}
	return true
}

func anyGlobMatch(patterns []string, path string) bool {
	for _, p := range patterns {
		if ok, err := doublestar.Match(p, path); err == nil && ok {
			return true
		}
	}
	return false
}

// BuildRepoData assembles the final report payload: it derives AuthorStat
// and FileStat rollups from the (already filtered) commit list.
func BuildRepoData(repoPath string, commits []model.Commit, branches, tags []string, filters model.Filters, truncated bool) model.RepoData {
	authors := map[string]*model.AuthorStat{}
	files := map[string]*model.FileStat{}

	for _, c := range commits {
		key := c.AuthorName + "\x00" + c.AuthorEmail
		a, ok := authors[key]
		if !ok {
			a = &model.AuthorStat{Name: c.AuthorName, Email: c.AuthorEmail, FirstCommit: c.Date, LastCommit: c.Date}
			authors[key] = a
		}
		a.Commits++
		a.Insertions += c.Insertions
		a.Deletions += c.Deletions
		if c.Date.Before(a.FirstCommit) {
			a.FirstCommit = c.Date
		}
		if c.Date.After(a.LastCommit) {
			a.LastCommit = c.Date
		}

		for _, fc := range c.Files {
			fstat, ok := files[fc.Path]
			if !ok {
				fstat = &model.FileStat{Path: fc.Path}
				files[fc.Path] = fstat
			}
			fstat.Commits++
			fstat.Insertions += fc.Insertions
			fstat.Deletions += fc.Deletions
		}
	}

	authorList := make([]model.AuthorStat, 0, len(authors))
	for _, a := range authors {
		authorList = append(authorList, *a)
	}
	sort.Slice(authorList, func(i, j int) bool { return authorList[i].Commits > authorList[j].Commits })

	fileList := make([]model.FileStat, 0, len(files))
	for _, f := range files {
		fileList = append(fileList, *f)
	}
	sort.Slice(fileList, func(i, j int) bool {
		return fileList[i].Insertions+fileList[i].Deletions > fileList[j].Insertions+fileList[j].Deletions
	})

	return model.RepoData{
		GeneratedAt: time.Now(),
		RepoPath:    repoPath,
		Branches:    branches,
		Tags:        tags,
		Commits:     commits,
		Authors:     authorList,
		Files:       fileList,
		Truncated:   truncated,
		Filters:     filters,
	}
}
