package skillinstall

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func gitRepoWithASkill(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	dir := t.TempDir()
	run := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@t", "GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@t")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	run("init", "-q")
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte("# a skill"), 0o644); err != nil {
		t.Fatal(err)
	}
	run("add", ".")
	run("commit", "-q", "-m", "first")
	return dir
}

type cloneRecorder struct{ lines []string }

func (r *cloneRecorder) Step(int, int, string) {}
func (r *cloneRecorder) Detail(text string)    { r.lines = append(r.lines, text) }

func TestCloneDownloadsTheRepositoryAndSaysWhatGitPrints(t *testing.T) {
	source := gitRepoWithASkill(t)
	dest := filepath.Join(t.TempDir(), "repo")
	progress := &cloneRecorder{}
	if err := Clone(context.Background(), source, dest, progress); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dest, "SKILL.md")); err != nil {
		t.Fatalf("the files were not downloaded: %v", err)
	}
	if len(progress.lines) == 0 {
		t.Fatal("nothing was reported while downloading")
	}
}

func TestCloneOfAnAddressThatDoesNotExistLeavesNothingAndSaysWhy(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	dest := filepath.Join(t.TempDir(), "repo")
	err := Clone(context.Background(), filepath.Join(t.TempDir(), "nothing-here"), dest, nil)
	if err == nil || !strings.Contains(err.Error(), "could not download") {
		t.Fatalf("expected a download error, got %v", err)
	}
	if _, statErr := os.Stat(dest); !os.IsNotExist(statErr) {
		t.Fatal("a failed download left a folder behind")
	}
}

func TestCloneThatIsCancelledLeavesNothing(t *testing.T) {
	source := gitRepoWithASkill(t)
	dest := filepath.Join(t.TempDir(), "repo")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := Clone(ctx, source, dest, nil); err == nil {
		t.Fatal("a cancelled download reported success")
	}
	if _, err := os.Stat(dest); !os.IsNotExist(err) {
		t.Fatal("a cancelled download left a folder behind")
	}
}

func TestCloneIntoMovesTheRepositoryOnlyWhenItIsWhole(t *testing.T) {
	source := gitRepoWithASkill(t)
	root := t.TempDir()
	staging := filepath.Join(root, "skill-clones", "repo")
	dest := filepath.Join(root, "skills", "repos", "repo")
	if err := CloneInto(context.Background(), source, staging, dest, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dest, "SKILL.md")); err != nil {
		t.Fatalf("the repository is not in place: %v", err)
	}
	if _, err := os.Stat(staging); !os.IsNotExist(err) {
		t.Fatal("the staging folder was left behind")
	}
}

func TestCloneIntoThatFailsLeavesNothingInPlaceNorInStaging(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	root := t.TempDir()
	staging := filepath.Join(root, "skill-clones", "repo")
	dest := filepath.Join(root, "skills", "repos", "repo")
	// A half download of an earlier attempt is replaced, not trusted.
	if err := os.MkdirAll(filepath.Join(staging, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := CloneInto(context.Background(), filepath.Join(root, "nothing-here"), staging, dest, nil); err == nil {
		t.Fatal("a download that failed reported success")
	}
	for _, path := range []string{staging, dest} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("%s was left behind", path)
		}
	}
}

func TestAnAddressStartingWithADashIsNotTakenForAnOption(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	dest := filepath.Join(t.TempDir(), "repo")
	err := Clone(context.Background(), "--upload-pack=touch /tmp/pwned", dest, nil)
	if err == nil || !strings.Contains(err.Error(), "could not download") {
		t.Fatalf("expected a plain download error, got %v", err)
	}
}

// A repository with two commits, the first one tagged, as the owner of a skill repository changes it over time.
func gitRepoWithTwoCommits(t *testing.T) (dir, first, second string) {
	t.Helper()
	dir = gitRepoWithASkill(t)
	run := func(args ...string) string {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@t", "GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@t")
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
		return strings.TrimSpace(string(out))
	}
	first = run("rev-parse", "HEAD")
	run("tag", "v1")
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte("# a skill, changed by its owner"), 0o644); err != nil {
		t.Fatal(err)
	}
	run("commit", "-q", "-am", "second")
	second = run("rev-parse", "HEAD")
	return dir, first, second
}

func readSkill(t *testing.T, dir string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(dir, "SKILL.md"))
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestCloneAtACommitGivesThatCommitAndNotTheLatest(t *testing.T) {
	source, first, _ := gitRepoWithTwoCommits(t)
	dest := filepath.Join(t.TempDir(), "repo")
	if err := CloneAt(context.Background(), source, first, dest, nil); err != nil {
		t.Fatal(err)
	}
	if got := readSkill(t, dest); got != "# a skill" {
		t.Fatalf("the files must be those of the commit that was asked for, got %q", got)
	}
}

func TestCloneAtATagGivesTheCommitOfTheTag(t *testing.T) {
	source, _, _ := gitRepoWithTwoCommits(t)
	dest := filepath.Join(t.TempDir(), "repo")
	if err := CloneAt(context.Background(), source, "v1", dest, nil); err != nil {
		t.Fatal(err)
	}
	if got := readSkill(t, dest); got != "# a skill" {
		t.Fatalf("got %q", got)
	}
}

func TestCloneAtWithoutARefGivesTheLatest(t *testing.T) {
	source, _, _ := gitRepoWithTwoCommits(t)
	dest := filepath.Join(t.TempDir(), "repo")
	if err := CloneAt(context.Background(), source, "", dest, nil); err != nil {
		t.Fatal(err)
	}
	if got := readSkill(t, dest); !strings.Contains(got, "changed by its owner") {
		t.Fatalf("got %q", got)
	}
}

func TestARefThatGitCouldReadAsAnOptionIsRefused(t *testing.T) {
	for _, ref := range []string{"--upload-pack=touch /tmp/x", "-x", "a b", "v1;rm", strings.Repeat("a", 101)} {
		dest := filepath.Join(t.TempDir(), "repo")
		if err := CloneAt(context.Background(), "https://example.invalid/r", ref, dest, nil); err == nil || !strings.Contains(err.Error(), "not a commit") {
			t.Fatalf("%q must be refused before git is run, got %v", ref, err)
		}
		if _, err := os.Stat(dest); err == nil {
			t.Fatalf("%q: nothing may be created for a ref that is refused", ref)
		}
	}
	for _, ref := range []string{"", "v1", "v1.2.3", "release/2026-11", strings.Repeat("a", 40)} {
		if !ValidRef(ref) {
			t.Fatalf("%q is a ref", ref)
		}
	}
	if IsCommit("v1") || !IsCommit(strings.Repeat("a", 40)) || IsCommit(strings.Repeat("a", 39)) {
		t.Fatal("only 40 hexadecimal digits make a commit")
	}
}

func TestPinMovesAnInstalledRepositoryToTheCatalogRefAndOnlyWhenItIsNotThereYet(t *testing.T) {
	source, first, second := gitRepoWithTwoCommits(t)
	dest := filepath.Join(t.TempDir(), "repo")
	if err := CloneAt(context.Background(), source, first, dest, nil); err != nil {
		t.Fatal(err)
	}
	moved, err := Pin(context.Background(), dest, first)
	if err != nil || moved {
		t.Fatalf("a repository already on its commit is not touched: moved=%v err=%v", moved, err)
	}
	moved, err = Pin(context.Background(), dest, second)
	if err != nil || !moved {
		t.Fatalf("a new commit in the catalog moves the repository: moved=%v err=%v", moved, err)
	}
	if got := readSkill(t, dest); !strings.Contains(got, "changed by its owner") {
		t.Fatalf("the files must be those of the new commit, got %q", got)
	}
	if moved, err = Pin(context.Background(), dest, second); err != nil || moved {
		t.Fatalf("pinned again to the same commit: moved=%v err=%v", moved, err)
	}
}

func TestPinLeavesAFolderWithoutHistoryAlone(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	moved, err := Pin(context.Background(), t.TempDir(), strings.Repeat("b", 40))
	if err != nil || moved {
		t.Fatalf("a repository downloaded as an archive has nothing to move: moved=%v err=%v", moved, err)
	}
}

func TestTheArchiveOfARefIsTheZipOfThatRef(t *testing.T) {
	got, ok := archiveURLAt("https://github.com/o/r", strings.Repeat("c", 40))
	if !ok || got != "https://github.com/o/r/archive/"+strings.Repeat("c", 40)+".zip" {
		t.Fatalf("got %q %v", got, ok)
	}
	if got, ok := archiveURLAt("https://github.com/o/r", ""); !ok || !strings.HasSuffix(got, "/archive/HEAD.zip") {
		t.Fatalf("without a ref it is the default branch, got %q", got)
	}
	if _, ok := archiveURLAt("https://github.com/o/r", "--bad"); ok {
		t.Fatal("a ref that is refused gives no address")
	}
}
