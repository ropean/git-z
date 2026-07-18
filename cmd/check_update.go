package cmd

import (
	"fmt"
	"os"

	"github.com/ropean/git-z/internal/selfupdate"
	"github.com/spf13/cobra"
)

var checkUpdateCmd = &cobra.Command{
	Use:   "check-update",
	Short: "Check if a newer version is available",
	RunE: func(_ *cobra.Command, _ []string) error {
		fmt.Fprintf(os.Stderr, "Current version: %s\n", selfupdate.Version)

		rel, err := selfupdate.LatestRelease()
		if err != nil {
			return fmt.Errorf("check failed: %w", err)
		}

		if selfupdate.IsNewer(rel.TagName) {
			fmt.Fprintf(os.Stderr, "New version available: %s\n", rel.TagName)
			fmt.Fprintf(os.Stderr, "Run `gitz upgrade` to update\n")
			fmt.Fprintf(os.Stderr, "Release: %s\n", rel.HTMLURL)
		} else {
			fmt.Fprintln(os.Stderr, "Already up to date")
		}
		return nil
	},
}
