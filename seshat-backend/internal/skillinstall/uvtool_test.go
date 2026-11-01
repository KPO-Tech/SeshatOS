package skillinstall

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/KPO-Tech/seshat-runtime/pkg/runtimepath"
)

const fakeUV = "this stands for the uv program"

func zipOf(t *testing.T, name, content string) []byte {
	t.Helper()
	var buf bytes.Buffer
	writer := zip.NewWriter(&buf)
	for _, entry := range []string{"readme.txt", name, "uvx.exe"} {
		file, err := writer.Create(entry)
		if err != nil {
			t.Fatal(err)
		}
		text := "other"
		if entry == name {
			text = content
		}
		if _, err := file.Write([]byte(text)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func tarGzOf(t *testing.T, name, content string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zipped := gzip.NewWriter(&buf)
	writer := tar.NewWriter(zipped)
	for _, entry := range []struct{ path, text string }{{"uv-x86_64/README", "other"}, {"uv-x86_64/" + name, content}, {"uv-x86_64/uvx", "other"}} {
		if err := writer.WriteHeader(&tar.Header{Name: entry.path, Mode: 0o755, Size: int64(len(entry.text)), Typeflag: tar.TypeReg}); err != nil {
			t.Fatal(err)
		}
		if _, err := writer.Write([]byte(entry.text)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := zipped.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// serveUV serves a file as the release page would, and points the downloads at it with the checksum it should have (or another one).
func serveUV(t *testing.T, file string, body []byte, pinned string, status int) {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/"+uvVersion+"/"+file) {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(status)
		_, _ = w.Write(body)
	}))
	t.Cleanup(server.Close)
	key := runtime.GOOS + "/" + runtime.GOARCH
	oldAssets, oldBase := uvAssets, uvDownloadBase
	uvAssets = map[string]uvAsset{key: {file: file, sha256: pinned}}
	uvDownloadBase = server.URL + "/"
	t.Cleanup(func() { uvAssets, uvDownloadBase = oldAssets, oldBase })
}

func sumOf(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func TestUVIsDownloadedCheckedAndExtractedFromAZip(t *testing.T) {
	body := zipOf(t, uvExecutableName(), fakeUV)
	serveUV(t, "uv-test.zip", body, sumOf(body), http.StatusOK)
	dest := filepath.Join(t.TempDir(), "tools", uvExecutableName())

	if err := downloadUV(context.Background(), uvAssets[runtime.GOOS+"/"+runtime.GOARCH], dest); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(dest)
	if err != nil || string(got) != fakeUV {
		t.Fatalf("only the uv program is kept, got %q (%v)", got, err)
	}
	if entries, _ := os.ReadDir(filepath.Dir(dest)); len(entries) != 1 {
		t.Fatalf("nothing else is left beside it: %v", entries)
	}
}

func TestUVIsExtractedFromATarball(t *testing.T) {
	body := tarGzOf(t, uvExecutableName(), fakeUV)
	serveUV(t, "uv-test.tar.gz", body, sumOf(body), http.StatusOK)
	dest := filepath.Join(t.TempDir(), uvExecutableName())

	if err := downloadUV(context.Background(), uvAssets[runtime.GOOS+"/"+runtime.GOARCH], dest); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(dest); string(got) != fakeUV {
		t.Fatalf("got %q", got)
	}
}

func TestUVThatDoesNotMatchItsChecksumIsRefused(t *testing.T) {
	body := zipOf(t, uvExecutableName(), fakeUV)
	serveUV(t, "uv-test.zip", body, sumOf([]byte("another file")), http.StatusOK)
	dest := filepath.Join(t.TempDir(), uvExecutableName())

	err := downloadUV(context.Background(), uvAssets[runtime.GOOS+"/"+runtime.GOARCH], dest)
	if err == nil || !strings.Contains(err.Error(), "checksum") {
		t.Fatalf("a file that is not the pinned one is refused, got %v", err)
	}
	if _, statErr := os.Stat(dest); statErr == nil {
		t.Fatal("and nothing is put in place")
	}
}

func TestEnsureUVFallsBackToPipWhenTheDownloadFails(t *testing.T) {
	t.Setenv(runtimepath.EnvRuntimeRoot, t.TempDir())
	t.Setenv(EnvUV, "")
	oldFind := findUV
	findUV = func() (string, bool) { return "", false }
	t.Cleanup(func() { findUV = oldFind })
	serveUV(t, "uv-test.zip", nil, sumOf(nil), http.StatusInternalServerError)

	progress := &recordedProgress{}
	if uv, ok := ensureUV(context.Background(), progress); ok {
		t.Fatalf("a failed download gives no uv, got %q", uv)
	}
	if !strings.Contains(strings.Join(progress.details, " "), "pip is used instead") {
		t.Fatalf("the person is told pip does the work: %v", progress.details)
	}
}

func TestEnsureUVDoesNotDownloadWhenItIsTurnedOff(t *testing.T) {
	t.Setenv(runtimepath.EnvRuntimeRoot, t.TempDir())
	t.Setenv(EnvUV, "off")
	if uvCanBeDownloaded() {
		t.Fatal("off means no download")
	}
	if _, ok := ensureUV(context.Background(), nil); ok {
		t.Fatal("and no uv")
	}
}

func TestThePlanSaysUVWillBeDownloadedOnlyWhenItWill(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "skills", "a", "SKILL.md"), "---\nname: a\n---\n")
	write(t, filepath.Join(root, "requirements.txt"), "requests\n")

	pretendMachine(t, "", nil)
	t.Setenv(EnvUV, "")
	if plan := Detect(root, Spec{}); len(plan.Notes) != 1 || !strings.Contains(plan.Notes[0], "uv") {
		t.Fatalf("the download is announced, got %v", plan.Notes)
	}
	t.Setenv(EnvUV, "off")
	if plan := Detect(root, Spec{}); len(plan.Notes) != 0 {
		t.Fatalf("nothing is announced when uv is turned off, got %v", plan.Notes)
	}
	pretendMachine(t, "uvbin", nil)
	t.Setenv(EnvUV, "")
	if plan := Detect(root, Spec{}); len(plan.Notes) != 0 {
		t.Fatalf("nothing is announced when the machine has uv, got %v", plan.Notes)
	}
}
