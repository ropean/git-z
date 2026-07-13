// Package render turns a model.RepoData into the on-disk report: either a
// self-contained HTML file (default) or plain JSON.
package render

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"strings"

	"github.com/ropean/digit/internal/model"
)

// dataMarker is a placeholder literal baked into web/index.html at build
// time; WriteHTML swaps it for the real JSON payload.
const dataMarker = `"%%GIT_VIZ_DATA%%"`

// TemplatePath is where the built frontend's entry point lives inside the
// embedded filesystem passed to WriteHTML.
const TemplatePath = "web/dist/index.html"

// WriteJSON marshals data as indented JSON to outputPath.
func WriteJSON(data model.RepoData, outputPath string) error {
	b, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("render: marshal json: %w", err)
	}
	return os.WriteFile(outputPath, b, 0o644)
}

// WriteHTML reads the built single-file frontend out of distFS, injects
// data as window.__GIT_DATA__, and writes the resulting report to
// outputPath. distFS must contain TemplatePath.
func WriteHTML(data model.RepoData, outputPath string, distFS fs.FS) error {
	tpl, err := fs.ReadFile(distFS, TemplatePath)
	if err != nil {
		return fmt.Errorf("render: read embedded template: %w", err)
	}
	b, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("render: marshal json: %w", err)
	}
	html := string(tpl)
	if !strings.Contains(html, dataMarker) {
		return fmt.Errorf("render: template missing data marker %s", dataMarker)
	}
	html = strings.Replace(html, dataMarker, string(b), 1)
	return os.WriteFile(outputPath, []byte(html), 0o644)
}
