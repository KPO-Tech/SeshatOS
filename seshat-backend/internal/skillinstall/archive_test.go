package skillinstall

import (
	"archive/zip"
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type zipEntry struct {
	name    string
	body    string
	symlink bool
}

func repoZip(t *testing.T, entries ...zipEntry) []byte {
	t.Helper()
	var buf bytes.Buffer
	writer := zip.NewWriter(&buf)
	for _, entry := range entries {
		header := &zip.FileHeader{Name: entry.name, Method: zip.Deflate}
		switch {
		case entry.symlink:
			header.SetMode(os.ModeSymlink | 0o777)
		case strings.HasSuffix(entry.name, "/"):
			header.SetMode(os.ModeDir | 0o755)
		default:
			header.SetMode(0o644)
		}
		w, err := writer.CreateHeader(header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(entry.body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestArchiveURLOnlyForAGitHubRepository(t *testing.T) {
	cases := map[string]string{
		"https://github.com/romainsimon/paperasse":      "https://github.com/romainsimon/paperasse/archive/HEAD.zip",
		"https://github.com/romainsimon/paperasse.git/": "https://github.com/romainsimon/paperasse/archive/HEAD.zip",
		"https://GitHub.com/obra/superpowers":           "https://github.com/obra/superpowers/archive/HEAD.zip",
		"https://gitlab.com/group/project":              "",
		"http://github.com/obra/superpowers":            "",
		"https://github.com/obra":                       "",
		"https://github.com/obra/superpowers/tree/main": "",
		"https://github.com/../superpowers":             "",
	}
	for in, want := range cases {
		got, ok := archiveURL(in)
		if ok != (want != "") || got != want {
			t.Errorf("archiveURL(%q) = %q, %v; want %q", in, got, ok, want)
		}
	}
}

func TestDownloadArchiveUnpacksTheRepositoryWithoutItsWrapperFolder(t *testing.T) {
	body := repoZip(t,
		zipEntry{name: "paperasse-abc123/"},
		zipEntry{name: "paperasse-abc123/compta/SKILL.md", body: "# compta"},
		zipEntry{name: "paperasse-abc123/README.md", body: "readme"},
		zipEntry{name: "paperasse-abc123/link", body: "../../outside", symlink: true},
	)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write(body) }))
	defer server.Close()

	dest := filepath.Join(t.TempDir(), "paperasse")
	recorder := &cloneRecorder{}
	if err := downloadArchive(context.Background(), "https://github.com/romainsimon/paperasse", server.URL, dest, recorder); err != nil {
		t.Fatal(err)
	}
	if data, err := os.ReadFile(filepath.Join(dest, "compta", "SKILL.md")); err != nil || string(data) != "# compta" {
		t.Fatalf("SKILL.md = %q, %v", data, err)
	}
	if _, err := os.Lstat(filepath.Join(dest, "link")); !os.IsNotExist(err) {
		t.Fatalf("a link was unpacked: %v", err)
	}
	if !IsDownloaded(dest) {
		t.Fatal("a downloaded archive is not seen as a whole repository")
	}
	if got := DownloadedFrom(dest); got != "https://github.com/romainsimon/paperasse" {
		t.Fatalf("DownloadedFrom = %q", got)
	}
	if len(recorder.lines) == 0 {
		t.Fatal("the download said nothing of its progress")
	}
}

func TestUnpackArchiveRefusesAPathOutsideTheRepository(t *testing.T) {
	archive := filepath.Join(t.TempDir(), "evil.zip")
	if err := os.WriteFile(archive, repoZip(t, zipEntry{name: "repo-1/../../escaped.txt", body: "x"}), 0o644); err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(t.TempDir(), "repo")
	if err := unpackArchive(archive, dest); err == nil {
		t.Fatal("an entry leaving the repository was accepted")
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(dest), "escaped.txt")); !os.IsNotExist(err) {
		t.Fatal("a file was written outside the repository")
	}
}

func TestDownloadArchiveSaysWhenTheRepositoryIsMissing(t *testing.T) {
	server := httptest.NewServer(http.NotFoundHandler())
	defer server.Close()
	err := downloadArchive(context.Background(), "https://github.com/a/b", server.URL, filepath.Join(t.TempDir(), "b"), nil)
	if err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("err = %v", err)
	}
}

func TestCloneWithoutGitNamesTheLimitForAnotherHost(t *testing.T) {
	saved := gitAvailable
	gitAvailable = func() bool { return false }
	defer func() { gitAvailable = saved }()

	dest := filepath.Join(t.TempDir(), "project")
	err := Clone(context.Background(), "https://gitlab.com/group/project", dest, nil)
	if err == nil || !strings.Contains(err.Error(), "only repositories on GitHub") {
		t.Fatalf("err = %v", err)
	}
	if _, statErr := os.Stat(dest); !os.IsNotExist(statErr) {
		t.Fatal("a failed download left a folder behind")
	}
}
