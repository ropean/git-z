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

// LanguageStat is the byte-size share of one detected language across the
// tracked tree at the analyzed ref (same method GitHub's language bar uses).
type LanguageStat struct {
	Language string `json:"language"`
	Bytes    int64  `json:"bytes"`
	Files    int    `json:"files"`
}

// BranchStat is per-branch metadata used for branch-health reporting.
type BranchStat struct {
	Name             string    `json:"name"`
	LastCommitDate   time.Time `json:"lastCommitDate"`
	LastCommitHash   string    `json:"lastCommitHash"`
	AheadOfDefault   int       `json:"aheadOfDefault"`
	BehindDefault    int       `json:"behindDefault"`
	AheadBehindKnown bool      `json:"aheadBehindKnown"`
	Merged           bool      `json:"merged"`
	IsRemote         bool      `json:"isRemote"`
	IsDefault        bool      `json:"isDefault"`
}

// TagStat is per-tag metadata used for release-cadence reporting.
type TagStat struct {
	Name      string    `json:"name"`
	Date      time.Time `json:"date"`
	Hash      string    `json:"hash"`
	Annotated bool      `json:"annotated"`
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
	GeneratedAt  time.Time      `json:"generatedAt"`
	RepoPath     string         `json:"repoPath"`
	RemoteURL    string         `json:"remoteUrl,omitempty"`
	CurrentLines int            `json:"currentLines,omitempty"`
	License      string         `json:"license,omitempty"`
	Branches     []string       `json:"branches"`
	Tags         []string       `json:"tags"`
	Commits      []Commit       `json:"commits"`
	Authors      []AuthorStat   `json:"authors"`
	Files        []FileStat     `json:"files"`
	Languages    []LanguageStat `json:"languages,omitempty"`
	BranchStats  []BranchStat   `json:"branchStats,omitempty"`
	TagStats     []TagStat      `json:"tagStats,omitempty"`
	Tree         []string       `json:"tree"`
	Truncated    bool           `json:"truncated"`
	Filters      Filters        `json:"filters"`
}
