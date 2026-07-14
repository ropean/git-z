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
	".xslt":       "XSLT",
	".xsl":        "XSLT",
}

// ignoredExtensions are binary assets and generated/lock artifacts that
// GitHub's own language bar excludes from the byte-size denominator
// entirely — counting them would drown a repo's actual source under
// "Other" (e.g. a single seed-data image or sqlite fixture outweighing all
// the TypeScript in a project).
var ignoredExtensions = map[string]bool{
	// Images
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".ico": true,
	".svg": true, ".webp": true, ".bmp": true, ".tiff": true, ".tif": true,
	".avif": true, ".heic": true, ".cur": true,
	// Fonts
	".woff": true, ".woff2": true, ".ttf": true, ".eot": true, ".otf": true,
	// Audio/video
	".mp3": true, ".mp4": true, ".avi": true, ".mov": true, ".wav": true,
	".ogg": true, ".webm": true, ".flac": true, ".m4a": true, ".swf": true,
	// Archives
	".zip": true, ".tar": true, ".gz": true, ".tgz": true, ".rar": true,
	".7z": true, ".bz2": true, ".xz": true,
	// Binaries / data blobs
	".exe": true, ".dll": true, ".so": true, ".dylib": true, ".bin": true,
	".dat": true, ".sqlite": true, ".sqlite3": true, ".db": true, ".pdb": true,
	// Documents
	".pdf": true, ".doc": true, ".docx": true, ".xls": true, ".xlsx": true,
	".ppt": true, ".pptx": true,
	// Generated/lock artifacts
	".lock": true, ".map": true,
}

// ignoredFilenames are exact (lowercased) basenames that are config/lock
// noise rather than source, including lockfiles whose extension alone
// (.json, .yaml) would otherwise misattribute them to that language.
var ignoredFilenames = map[string]bool{
	"package-lock.json": true, "npm-shrinkwrap.json": true, "pnpm-lock.yaml": true,
	"yarn.lock": true, "cargo.lock": true, "gemfile.lock": true, "composer.lock": true,
	".gitignore": true, ".gitattributes": true, ".dockerignore": true, ".npmrc": true,
	".editorconfig": true, ".prettierignore": true, ".eslintignore": true, ".gitkeep": true,
	".ds_store": true,
}

func isIgnoredPath(base string) bool {
	if ignoredFilenames[base] {
		return true
	}
	if strings.HasPrefix(base, ".env") {
		return true
	}
	return ignoredExtensions[strings.ToLower(filepath.Ext(base))]
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
		base := strings.ToLower(filepath.Base(s.Path))
		if isIgnoredPath(base) {
			continue
		}
		lang := languageFor(base)
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

func languageFor(base string) string {
	if lang, ok := filenameLanguages[base]; ok {
		return lang
	}
	if strings.HasPrefix(base, "dockerfile.") {
		return "Dockerfile"
	}
	ext := strings.ToLower(filepath.Ext(base))
	if lang, ok := extensionLanguages[ext]; ok {
		return lang
	}
	return "Other"
}
