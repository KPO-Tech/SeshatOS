package skillinstall

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

// cloneLimit stops a download that never ends; a very large repository on a slow line still has half an hour.
const cloneLimit = 30 * time.Minute

// Clone downloads the latest state of a repository (no history) into dest, saying where it is as git reports it ("Receiving objects: 45%").
// A download that fails or is cancelled leaves nothing behind, so that the next attempt does not find a repository that is half there.
func Clone(ctx context.Context, url, dest string, progress Progress) error {
	ctx, cancel := context.WithTimeout(ctx, cloneLimit)
	defer cancel()
	if progress != nil {
		ctx = withLines(ctx, progress.Detail)
	}
	// git must never wait for someone to type a password: a private or mistyped address would hang the task for good.
	env := append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	out, err := runCommand(ctx, "", env, "git", "clone", "--depth=1", "--single-branch", "--progress", url, dest)
	if err == nil {
		return nil
	}
	_ = os.RemoveAll(dest)
	switch {
	case ctx.Err() != nil && errors.Is(ctx.Err(), context.DeadlineExceeded):
		return fmt.Errorf("the download took more than %d minutes and was stopped", int(cloneLimit.Minutes()))
	case ctx.Err() != nil:
		return ctx.Err()
	case errors.Is(err, exec.ErrNotFound):
		return errors.New("git is not installed on this computer: it is needed to download skills")
	}
	return fmt.Errorf("could not download the repository: %s", lastMessage(out, err))
}

// lastMessage is the line of git's output that says what went wrong: the last "fatal:" or "error:", else the last line.
func lastMessage(out string, err error) string {
	lines := strings.FieldsFunc(out, func(r rune) bool { return r == '\n' || r == '\r' })
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if strings.HasPrefix(line, "fatal:") || strings.HasPrefix(line, "error:") {
			return line
		}
	}
	if len(lines) > 0 {
		return strings.TrimSpace(lines[len(lines)-1])
	}
	return err.Error()
}
