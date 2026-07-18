package cmd

import (
	"fmt"

	"github.com/ropean/git-z/internal/selfupdate"
	"github.com/spf13/cobra"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print the current version",
	Run: func(_ *cobra.Command, _ []string) {
		fmt.Println(selfupdate.Version)
	},
}
