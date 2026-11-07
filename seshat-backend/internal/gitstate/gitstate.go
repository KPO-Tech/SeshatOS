// Package gitstate says which git branch a folder is on and whether it holds uncommitted changes, for the Environment card.
package gitstate

import (
	"context"
	"os"
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

// git runs one read-only command in folder. The card is drawn as soon as a folder is chosen, before anyone has looked at what is in it, and
// git reads the configuration of the repository it runs in: a repository that came from somewhere else can name a program there, and
// `git status` runs it (core.fsmonitor). That one is switched off, and nothing is locked for the sake of an index refresh. The clean and
// smudge filters a repository can name are still run by git for files it must compare; only a full trust prompt for a folder would close
// that, like the workspace trust of a code editor.
func git(ctx context.Context, folder string, args ...string) (string, error) {
	// The folder is the directory the program runs in, not one of its arguments: nothing the folder says can be read as an option, and the
	// arguments are all written here.
	cmd := exec.CommandContext(ctx, "git", append([]string{"-c", "core.fsmonitor=false"}, args...)...) // #nosec G204 G702 -- the program is git and its arguments are written in this package
	cmd.Dir = folder
	cmd.Env = append(os.Environ(), "GIT_OPTIONAL_LOCKS=0")
	out, err := cmd.Output()
	return strings.TrimSpace(string(out)), err
}
