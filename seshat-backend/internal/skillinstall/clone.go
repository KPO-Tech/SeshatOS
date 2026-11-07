package skillinstall

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// cloneLimit stops a download that never ends; a very large repository on a slow line still has half an hour.
const cloneLimit = 30 * time.Minute

// A ref names what is downloaded: a commit (40 hexadecimal digits, which nobody can move), or a tag or a branch (which the owner of the
// repository can move). A name never starts with a dash, which git would read as an option.
var (
	commitRef = regexp.MustCompile(`^[0-9a-f]{40}$`)
	nameRef   = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$`)
)

// ValidRef reports whether a ref can be given to git: empty (the default branch), a commit, or a tag or branch name.
func ValidRef(ref string) bool {
	return ref == "" || commitRef.MatchString(ref) || nameRef.MatchString(ref)
}

// IsCommit reports whether a ref is a whole commit, the only kind that cannot be moved after it was read.
func IsCommit(ref string) bool { return commitRef.MatchString(ref) }

// Clone downloads the latest state of a repository (no history) into dest, saying where it is as git reports it ("Receiving objects: 45%").
// On a computer without git, a GitHub repository is downloaded as the zip of its default branch instead (see archive.go).
// A download that fails or is cancelled leaves nothing behind, so that the next attempt does not find a repository that is half there.
func Clone(ctx context.Context, url, dest string, progress Progress) error {
	return CloneAt(ctx, url, "", dest, progress)
}

// CloneAt is Clone for a given ref: the commit, tag or branch the catalog chose, instead of whatever the default branch is today.
func CloneAt(ctx context.Context, url, ref, dest string, progress Progress) error {
	if !ValidRef(ref) {
		return fmt.Errorf("%q is not a commit, a tag or a branch name", ref)
	}
	ctx, cancel := context.WithTimeout(ctx, cloneLimit)
	defer cancel()
	if !gitAvailable() {
		zipURL, ok := archiveURLAt(url, ref)
		if !ok {
			return errors.New("git is not installed on this computer: without it, only repositories on GitHub can be downloaded")
		}
		err := downloadArchive(ctx, url, zipURL, dest, progress)
		if err == nil {
			return nil
		}
		_ = os.RemoveAll(dest)
		return downloadFailure(ctx, err.Error())
	}
	if progress != nil {
		ctx = withLines(ctx, progress.Detail)
	}
	// git must never wait for someone to type a password: a private or mistyped address would hang the task for good.
	env := append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	var out string
	var err error
	switch {
	case ref == "":
		out, err = runCommand(ctx, "", env, "git", "clone", "--depth=1", "--single-branch", "--progress", "--", url, dest)
	case IsCommit(ref):
		out, err = cloneCommit(ctx, env, url, ref, dest)
	default:
		out, err = runCommand(ctx, "", env, "git", "clone", "--depth=1", "--single-branch", "--branch", ref, "--progress", "--", url, dest)
	}
	if err == nil {
		return nil
	}
	_ = os.RemoveAll(dest)
	if errors.Is(err, exec.ErrNotFound) && ctx.Err() == nil {
		return errors.New("git is not installed on this computer: it is needed to download skills")
	}
	return downloadFailure(ctx, lastMessage(out, err))
}

// cloneCommit downloads one commit and nothing else: git clone cannot take a commit, so the repository is made empty, the commit is fetched
// by its number and checked out. The remote is kept, so that the address it came from can still be read.
func cloneCommit(ctx context.Context, env []string, url, sha, dest string) (string, error) {
	var all strings.Builder
	for _, args := range [][]string{
		{"init", "-q", "--", dest},
		{"-C", dest, "remote", "add", "--", "origin", url},
		{"-C", dest, "fetch", "--depth=1", "--progress", "origin", sha},
		{"-C", dest, "checkout", "-q", "--detach", "FETCH_HEAD"},
	} {
		out, err := runCommand(ctx, "", env, "git", args...)
		all.WriteString(out)
		if err != nil {
			return all.String(), err
		}
	}
	return all.String(), nil
}

// Pin puts an installed repository on the ref the catalog chose, downloading it only when the repository is not on it already, and says
// whether it moved. A repository that was downloaded as an archive (no git on the computer) has no history to move: it is left as it is.
// What the person changed in the files of a catalog repository is not kept: the catalog says what these files are.
func Pin(ctx context.Context, repoRoot, ref string) (bool, error) {
	if ref == "" || !ValidRef(ref) {
		return false, fmt.Errorf("%q is not a commit, a tag or a branch name", ref)
	}
	if !gitAvailable() {
		return false, nil
	}
	if info, err := os.Stat(filepath.Join(repoRoot, ".git")); err != nil || info == nil {
		return false, nil
	}
	ctx, cancel := context.WithTimeout(ctx, cloneLimit)
	defer cancel()
	env := append(os.Environ(), "GIT_TERMINAL_PROMPT=0")
	if IsCommit(ref) {
		head, err := runCommand(ctx, repoRoot, env, "git", "rev-parse", "HEAD")
		if err == nil && strings.TrimSpace(head) == ref {
			return false, nil
		}
	}
	if out, err := runCommand(ctx, repoRoot, env, "git", "fetch", "--depth=1", "origin", ref); err != nil {
		return false, fmt.Errorf("could not fetch %s: %s", ref, lastMessage(out, err))
	}
	if out, err := runCommand(ctx, repoRoot, env, "git", "checkout", "-q", "--force", "--detach", "FETCH_HEAD"); err != nil {
		return false, fmt.Errorf("could not move to %s: %s", ref, lastMessage(out, err))
	}
	return true, nil
}

// downloadFailure says why a download stopped: the time limit, a cancel, or what the download itself reported.
func downloadFailure(ctx context.Context, message string) error {
	switch {
	case ctx.Err() != nil && errors.Is(ctx.Err(), context.DeadlineExceeded):
		return fmt.Errorf("the download took more than %d minutes and was stopped", int(cloneLimit.Minutes()))
	case ctx.Err() != nil:
		return ctx.Err()
	}
	return fmt.Errorf("could not download the repository: %s", message)
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

// CloneInto downloads a repository into a staging folder and moves it to dest only when the download is whole. The staging folder is outside
// the folder the skills are read from, so that a download cut short (the app was closed, the machine went to sleep) never leaves a half
// repository where the skills are listed as installed; the next attempt starts again from nothing.
func CloneInto(ctx context.Context, url, staging, dest string, progress Progress) error {
	return CloneIntoAt(ctx, url, "", staging, dest, progress)
}

// CloneIntoAt is CloneInto for a given ref.
func CloneIntoAt(ctx context.Context, url, ref, staging, dest string, progress Progress) error {
	_ = os.RemoveAll(staging)
	if err := CloneAt(ctx, url, ref, staging, progress); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		_ = os.RemoveAll(staging)
		return fmt.Errorf("could not prepare the folder of the skills: %w", err)
	}
	if err := os.Rename(staging, dest); err != nil {
		_ = os.RemoveAll(staging)
		return fmt.Errorf("could not move the repository into place: %w", err)
	}
	return nil
}
