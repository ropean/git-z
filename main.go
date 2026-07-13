package main

import (
	"embed"
	"fmt"
	"os"

	"github.com/ropean/digit/cmd"
)

//go:embed web/dist
var webDistFS embed.FS

func main() {
	cmd.WebDist = webDistFS
	if err := cmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}
