// Package model defines the data structures shared by the gitlog, render
// and web layers.
package model

import "time"

// FileChange is a single file's line-level change within a commit.
type FileChange struct {
	Path       string `json:"path"`
	Insertions int    `json:"insertions"`
	Deletions  int    `json:"deletions"`
	Binary     bool   `json:"binary"`
}

// Commit is one parsed `git log` entry.
type Commit struct {
	Hash         string       `json:"hash"`
	ParentHashes []string     `json:"parents"`
	AuthorName   string       `json:"authorName"`
	AuthorEmail  string       `json:"authorEmail"`
	Date         time.Time    `json:"date"`
	Branch       string       `json:"branch,omitempty"`
	Subject      string       `json:"subject"`
	Files        []FileChange `json:"files"`
	Insertions   int          `json:"insertions"`
	Deletions    int          `json:"deletions"`
	RawDiff      string       `json:"rawDiff,omitempty"`
}

// AuthorStat is per-author aggregated activity, computed after filtering.
type AuthorStat struct {
	Name        string    `json:"name"`
	Email       string    `json:"email"`
	Commits     int       `json:"commits"`
	Insertions  int       `json:"insertions"`
	Deletions   int       `json:"deletions"`
	FirstCommit time.Time `json:"firstCommit"`
	LastCommit  time.Time `json:"lastCommit"`
}

// FileStat is per-file aggregated churn, computed after filtering.
type FileStat struct {
	Path       string `json:"path"`
	Commits    int    `json:"commits"`
	Insertions int    `json:"insertions"`
	Deletions  int    `json:"deletions"`
}

// Filters records the CLI options that were applied, for display in the report.
type Filters struct {
	Since       string   `json:"since,omitempty"`
	Until       string   `json:"until,omitempty"`
	Authors     []string `json:"authors,omitempty"`
	Branch      string   `json:"branch,omitempty"`
	AllBranches bool     `json:"allBranches,omitempty"`
	Exclude     []string `json:"exclude,omitempty"`
	Include     []string `json:"include,omitempty"`
	MaxCommits  int      `json:"maxCommits,omitempty"`
	DiffContent bool     `json:"diffContent,omitempty"`
}

// RepoData is the full payload embedded into the report (HTML or JSON).
type RepoData struct {
	GeneratedAt time.Time    `json:"generatedAt"`
	RepoPath    string       `json:"repoPath"`
	Branches    []string     `json:"branches"`
	Tags        []string     `json:"tags"`
	Commits     []Commit     `json:"commits"`
	Authors     []AuthorStat `json:"authors"`
	Files       []FileStat   `json:"files"`
	Truncated   bool         `json:"truncated"`
	Filters     Filters      `json:"filters"`
}
