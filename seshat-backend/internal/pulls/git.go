package pulls

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

// repoOfFolder gives the GitHub repository and the branch a folder is on. A folder that is not a git checkout, has no GitHub
// origin or is on a detached head answers false: the session then has no pull request of its own to find.
func repoOfFolder(ctx context.Context, folder string) (owner, repo, branch string, ok bool) {
	if strings.TrimSpace(folder) == "" {
		return "", "", "", false
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	remote, err := gitOutput(ctx, folder, "config", "--get", "remote.origin.url")
	if err != nil {
		return "", "", "", false
	}
	owner, repo, ok = parseRemote(remote)
	if !ok {
		return "", "", "", false
	}
	branch, err = gitOutput(ctx, folder, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil || branch == "" || branch == "HEAD" {
		return "", "", "", false
	}
	return owner, repo, branch, true
}

func gitOutput(ctx context.Context, folder string, args ...string) (string, error) {
	out, err := exec.CommandContext(ctx, "git", append([]string{"-C", folder}, args...)...).Output()
	return strings.TrimSpace(string(out)), err
}
