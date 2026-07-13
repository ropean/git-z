// Package aggregate: language distribution, estimated by tracked-file byte
// size at the analyzed ref (the same method GitHub's language bar uses),
// rather than parsing and counting lines of every file.
package aggregate

import (
	"path/filepath"
	"sort"
	"strings"

	"github.com/ropean/digit/internal/gitlog"
	"github.com/ropean/digit/internal/model"
)

var extensionLanguages = map[string]string{
	".go":    "Go",
	".ts":    "TypeScript",
	".tsx":   "TypeScript",
	".js":    "JavaScript",
	".jsx":   "JavaScript",
	".mjs":   "JavaScript",
	".cjs":   "JavaScript",
	".css":   "CSS",
	".scss":  "SCSS",
	".less":  "Less",
	".html":  "HTML",
	".htm":   "HTML",
	".md":    "Markdown",
	".mdx":   "Markdown",
	".json":  "JSON",
	".yml":   "YAML",
	".yaml":  "YAML",
	".toml":  "TOML",
	".py":    "Python",
	".rb":    "Ruby",
	".java":  "Java",
	".kt":    "Kotlin",
	".kts":   "Kotlin",
	".c":     "C",
	".h":     "C",
	".cpp":   "C++",
	".cc":    "C++",
	".hpp":   "C++",
	".cs":    "C#",
	".rs":    "Rust",
	".php":   "PHP",
	".sh":    "Shell",
	".bash":  "Shell",
	".sql":   "SQL",
	".swift": "Swift",
	".m":     "Objective-C",
	".vue":   "Vue",
	".xml":   "XML",
	".proto": "Protocol Buffers",
}

// maxLanguages caps the returned distribution to the largest N languages
// plus a synthetic "Other" bucket for the long tail, mirroring how
// GitHub's language bar avoids listing dozens of one-off extensions.
const maxLanguages = 12

// ComputeLanguages buckets tracked-file byte sizes by detected language,
// sorted by total size descending.
func ComputeLanguages(sizes []gitlog.TreeSize) []model.LanguageStat {
	totals := map[string]*model.LanguageStat{}
	for _, s := range sizes {
		lang := languageFor(s.Path)
		st, ok := totals[lang]
		if !ok {
			st = &model.LanguageStat{Language: lang}
			totals[lang] = st
		}
		st.Bytes += s.Bytes
		st.Files++
	}

	list := make([]model.LanguageStat, 0, len(totals))
	for _, st := range totals {
		list = append(list, *st)
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].Bytes != list[j].Bytes {
			return list[i].Bytes > list[j].Bytes
		}
		return list[i].Language < list[j].Language
	})

	if len(list) <= maxLanguages {
		return list
	}
	head := append([]model.LanguageStat{}, list[:maxLanguages-1]...)
	other := model.LanguageStat{Language: "Other"}
	for _, st := range list[maxLanguages-1:] {
		other.Bytes += st.Bytes
		other.Files += st.Files
	}
	return append(head, other)
}

func languageFor(path string) string {
	base := strings.ToLower(filepath.Base(path))
	if base == "dockerfile" {
		return "Dockerfile"
	}
	ext := strings.ToLower(filepath.Ext(path))
	if lang, ok := extensionLanguages[ext]; ok {
		return lang
	}
	return "Other"
}
