package folderplan

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"testing"
	"time"

	"github.com/KPO-Tech/seshat-runtime/pkg/collectionplan"
)

func write(t *testing.T, root, rel, content string) {
	t.Helper()
	p := filepath.Join(root, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func sortedPaths(entries []collectionplan.Entry) []string {
	var out []string
	for _, e := range entries {
		out = append(out, e.Path)
	}
	sort.Strings(out)
	return out
}

func TestScanListsTheFilesWithoutTheirContentAndEntersNoHiddenFolder(t *testing.T) {
	root := t.TempDir()
	write(t, root, "Contracts/a.pdf", "x")
	write(t, root, "Contracts/2024/b.pdf", "yy")
	write(t, root, ".git/objects/one", "z")
	write(t, root, ".git/objects/two", "z")
	write(t, root, "readme.txt", "hello")

	entries, err := Scan(context.Background(), root, 0)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{".git", "Contracts/2024/b.pdf", "Contracts/a.pdf", "readme.txt"}
	if got := sortedPaths(entries); !reflect.DeepEqual(got, want) {
		t.Errorf("entries = %v, want %v (the hidden folder is one entry, its files are not listed)", got, want)
	}
	for _, e := range entries {
		if e.Hash != "" {
			t.Errorf("%s has a hash: a scan reads no file", e.Path)
		}
	}
}

func TestScanStopsPastTheLimit(t *testing.T) {
	root := t.TempDir()
	for _, n := range []string{"a", "b", "c", "d"} {
		write(t, root, n+".txt", "x")
	}
	_, err := Scan(context.Background(), root, 3)
	if !errors.Is(err, ErrTooBig) {
		t.Errorf("err = %v, want ErrTooBig", err)
	}
}

func TestScanStopsWhenTheContextEnds(t *testing.T) {
	root := t.TempDir()
	write(t, root, "a.txt", "x")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := Scan(ctx, root, 0); !errors.Is(err, context.Canceled) {
		t.Errorf("err = %v, want context.Canceled", err)
	}
}

func TestCheckRootRefusesWhatIsNotAFolderToAnalyse(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "file.txt", "x")
	driveRoot := string(filepath.Separator)
	if runtime.GOOS == "windows" {
		driveRoot = filepath.VolumeName(dir) + `\`
	}
	cases := map[string]string{
		"empty":       "",
		"relative":    filepath.Join("some", "folder"),
		"drive root":  driveRoot,
		"missing":     filepath.Join(dir, "nope"),
		"a file":      filepath.Join(dir, "file.txt"),
		"blank space": "   ",
	}
	for name, p := range cases {
		if _, err := CheckRoot(p); !errors.Is(err, ErrNotAFolder) {
			t.Errorf("%s (%q): err = %v, want ErrNotAFolder", name, p, err)
		}
	}
	if got, err := CheckRoot(dir + string(filepath.Separator) + "." + string(filepath.Separator)); err != nil || got != filepath.Clean(dir) {
		t.Errorf("a folder with a trailing dot segment: %q, %v", got, err)
	}
}

func TestAnalyzeProposesTheCollectionsOfAFolder(t *testing.T) {
	root := t.TempDir()
	for i := 0; i < 6; i++ {
		write(t, root, "Contracts/c"+string(rune('a'+i))+".pdf", "x")
		write(t, root, "Invoices/i"+string(rune('a'+i))+".pdf", "x")
	}
	write(t, root, "Invoices/movie.mp4", "x")
	gotRoot, listed, plan, err := Analyze(context.Background(), root, collectionplan.Options{})
	if err != nil {
		t.Fatal(err)
	}
	if gotRoot != filepath.Clean(root) || listed != 13 {
		t.Errorf("root %q listed %d, want %q and 13", gotRoot, listed, filepath.Clean(root))
	}
	if len(plan.Collections) != 2 || plan.Collections[0].Name != "Contracts" || len(plan.Collections[1].Files) != 6 {
		t.Errorf("collections = %+v", plan.Collections)
	}
	if len(plan.Excluded) != 1 || plan.Excluded[0].Path != "Invoices/movie.mp4" {
		t.Errorf("excluded = %+v", plan.Excluded)
	}
}

func TestAnAnalysisIsKeptForItsOwnerOnly(t *testing.T) {
	s := NewStore(time.Hour, 5)
	a := s.Add("user-1", "/archive", 3, collectionplan.Plan{})
	if got, ok := s.Get("user-1", a.ID); !ok || got.Root != "/archive" {
		t.Errorf("the owner should get it back: %v %v", got, ok)
	}
	if _, ok := s.Get("user-2", a.ID); ok {
		t.Error("another person must not get it")
	}
	if _, ok := s.Get("user-1", "unknown"); ok {
		t.Error("an unknown id is not found")
	}
}

func TestAnAnalysisExpires(t *testing.T) {
	s := NewStore(time.Hour, 5)
	now := time.Now()
	s.now = func() time.Time { return now }
	a := s.Add("user-1", "/archive", 0, collectionplan.Plan{})
	s.now = func() time.Time { return now.Add(61 * time.Minute) }
	if _, ok := s.Get("user-1", a.ID); ok {
		t.Error("an analysis older than the ttl must be gone")
	}
}

func TestTheOldestAnalysisOfAPersonGoesFirst(t *testing.T) {
	s := NewStore(time.Hour, 2)
	now := time.Now()
	var ids []string
	for i := 0; i < 3; i++ {
		s.now = func() time.Time { return now.Add(time.Duration(i) * time.Minute) }
		ids = append(ids, s.Add("user-1", "/a", 0, collectionplan.Plan{}).ID)
	}
	other := s.Add("user-2", "/b", 0, collectionplan.Plan{})
	if _, ok := s.Get("user-1", ids[0]); ok {
		t.Error("the oldest of three should be gone when two are kept")
	}
	if _, ok := s.Get("user-1", ids[2]); !ok {
		t.Error("the newest should be kept")
	}
	if _, ok := s.Get("user-2", other.ID); !ok {
		t.Error("another person's analysis is not counted")
	}
}
