// Package gitstate says which git branch a folder is on and whether it holds uncommitted changes, for the Environment card.
package gitstate

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

const timeout = 5 * time.Second

// State is what the card shows. A folder that is not a git checkout answers Repo false and nothing else.
type State struct {
	Repo bool `json:"repo"`
	// Branch is the branch name, or the short commit when the head is detached.
	Branch   string `json:"branch,omitempty"`
	Detached bool   `json:"detached,omitempty"`
	// Dirty is true when files are modified, staged or untracked.
	Dirty bool `json:"dirty,omitempty"`
}

// Inspect reads the state of the checkout that holds folder. It only reads.
func Inspect(ctx context.Context, folder string) State {
	if strings.TrimSpace(folder) == "" {
		return State{}
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	branch, err := git(ctx, folder, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		// A checkout with no commit yet has no HEAD to resolve: its branch is still named.
		name, nameErr := git(ctx, folder, "symbolic-ref", "--short", "HEAD")
		if nameErr != nil {
			return State{}
		}
		return State{Repo: true, Branch: name, Dirty: dirty(ctx, folder)}
	}
	state := State{Repo: true, Branch: branch, Dirty: dirty(ctx, folder)}
	if branch == "HEAD" {
		state.Detached = true
		state.Branch, _ = git(ctx, folder, "rev-parse", "--short", "HEAD")
	}
	return state
}

func dirty(ctx context.Context, folder string) bool {
	out, err := git(ctx, folder, "status", "--porcelain")
	return err == nil && out != ""
}

func git(ctx context.Context, folder string, args ...string) (string, error) {
	out, err := exec.CommandContext(ctx, "git", append([]string{"-C", folder}, args...)...).Output()
	return strings.TrimSpace(string(out)), err
}
