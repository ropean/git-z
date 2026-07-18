package cmd

import (
	"fmt"
	"os"

	"github.com/ropean/git-z/internal/selfupdate"
	"github.com/spf13/cobra"
)

var upgradeCmd = &cobra.Command{
	Use:   "upgrade",
	Short: "Upgrade to a newer version",
	Long:  "Download and replace the current binary. Defaults to the latest release; use --version to pin a tag.",
	RunE: func(cmd *cobra.Command, _ []string) error {
		target, _ := cmd.Flags().GetString("version")

		if target == "" || target == "latest" {
			rel, err := selfupdate.LatestRelease()
			if err != nil {
				return fmt.Errorf("resolve latest version: %w", err)
			}
			target = rel.TagName

			if !selfupdate.IsNewer(target) {
				fmt.Fprintln(os.Stderr, "Already up to date")
				return nil
			}
		}

		fmt.Fprintf(os.Stderr, "Upgrading %s → %s ...\n", selfupdate.Version, target)

		tmp, err := selfupdate.DownloadAsset(target)
		if err != nil {
			return fmt.Errorf("download: %w", err)
		}
		defer os.Remove(tmp)

		if err := selfupdate.ReplaceBinary(tmp); err != nil {
			return fmt.Errorf("replace binary: %w", err)
		}

		fmt.Fprintf(os.Stderr, "Upgraded to %s\n", target)
		return nil
	},
}

func init() {
	upgradeCmd.Flags().String("version", "latest", "Target version tag (e.g. v1.0.0)")
}
