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
	".go":         "Go",
	".ts":         "TypeScript",
	".tsx":        "TypeScript",
	".js":         "JavaScript",
	".jsx":        "JavaScript",
	".mjs":        "JavaScript",
	".cjs":        "JavaScript",
	".css":        "CSS",
	".scss":       "SCSS",
	".sass":       "Sass",
	".less":       "Less",
	".html":       "HTML",
	".htm":        "HTML",
	".vue":        "Vue",
	".svelte":     "Svelte",
	".md":         "Markdown",
	".mdx":        "Markdown",
	".rst":        "reStructuredText",
	".adoc":       "AsciiDoc",
	".tex":        "TeX",
	".json":       "JSON",
	".yml":        "YAML",
	".yaml":       "YAML",
	".toml":       "TOML",
	".ini":        "INI",
	".cfg":        "INI",
	".properties": "Properties",
	".csv":        "CSV",
	".xml":        "XML",
	".graphql":    "GraphQL",
	".gql":        "GraphQL",
	".proto":      "Protocol Buffers",
	".tf":         "HCL",
	".hcl":        "HCL",
	".py":         "Python",
	".rb":         "Ruby",
	".java":       "Java",
	".kt":         "Kotlin",
	".kts":        "Kotlin",
	".groovy":     "Groovy",
	".gradle":     "Groovy",
	".scala":      "Scala",
	".c":          "C",
	".h":          "C",
	".cpp":        "C++",
	".cc":         "C++",
	".cxx":        "C++",
	".hpp":        "C++",
	".hxx":        "C++",
	".cs":         "C#",
	".rs":         "Rust",
	".php":        "PHP",
	".sh":         "Shell",
	".bash":       "Shell",
	".zsh":        "Shell",
	".fish":       "Shell",
	".ps1":        "PowerShell",
	".psm1":       "PowerShell",
	".bat":        "Batchfile",
	".cmd":        "Batchfile",
	".sql":        "SQL",
	".swift":      "Swift",
	".m":          "Objective-C",
	".mm":         "Objective-C++",
	".dart":       "Dart",
	".lua":        "Lua",
	".pl":         "Perl",
	".pm":         "Perl",
	".r":          "R",
	".jl":         "Julia",
	".hs":         "Haskell",
	".ex":         "Elixir",
	".exs":        "Elixir",
	".erl":        "Erlang",
	".clj":        "Clojure",
	".cljs":       "Clojure",
	".fs":         "F#",
	".fsx":        "F#",
	".ml":         "OCaml",
	".mli":        "OCaml",
	".nim":        "Nim",
	".zig":        "Zig",
	".cr":         "Crystal",
	".elm":        "Elm",
	".sol":        "Solidity",
	".vb":         "Visual Basic",
	".pas":        "Pascal",
	".f90":        "Fortran",
	".f95":        "Fortran",
	".for":        "Fortran",
	".asm":        "Assembly",
	".s":          "Assembly",
	".vhd":        "VHDL",
	".vhdl":       "VHDL",
	".v":          "Verilog",
	".matlab":     "MATLAB",
	".ipynb":      "Jupyter Notebook",
	".coffee":     "CoffeeScript",
	".pug":        "Pug",
	".hbs":        "Handlebars",
	".twig":       "Twig",
	".vim":        "Vim Script",
	".el":         "Emacs Lisp",
	".diff":       "Diff",
	".patch":      "Diff",
	".cmake":      "CMake",
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

var filenameLanguages = map[string]string{
	"dockerfile":     "Dockerfile",
	"makefile":       "Makefile",
	"gnumakefile":    "Makefile",
	"cmakelists.txt": "CMake",
	"rakefile":       "Ruby",
	"gemfile":        "Ruby",
	"jenkinsfile":    "Groovy",
}

func languageFor(path string) string {
	base := strings.ToLower(filepath.Base(path))
	if lang, ok := filenameLanguages[base]; ok {
		return lang
	}
	ext := strings.ToLower(filepath.Ext(path))
	if lang, ok := extensionLanguages[ext]; ok {
		return lang
	}
	return "Other"
}
