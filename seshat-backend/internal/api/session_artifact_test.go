package api

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveSessionArtifactStaysInsideTheSessionFolders(t *testing.T) {
	workspace := t.TempDir()
	project := t.TempDir()
	outside := filepath.Join(t.TempDir(), "secret.txt")
	for path, content := range map[string]string{
		filepath.Join(workspace, "out", "clip.mp4"): "video",
		filepath.Join(project, "report.pdf"):        "pdf",
		outside:                                     "secret",
	} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	roots := []string{project, workspace}

	if _, err := resolveSessionArtifact(roots, "out/clip.mp4"); err != nil {
		t.Fatalf("a file of the workspace is served: %v", err)
	}
	if _, err := resolveSessionArtifact(roots, "report.pdf"); err != nil {
		t.Fatalf("a file of the project folder is served: %v", err)
	}
	if _, err := resolveSessionArtifact(roots, filepath.Join(workspace, "out", "clip.mp4")); err != nil {
		t.Fatalf("an absolute path inside a folder is served: %v", err)
	}

	for name, requested := range map[string]string{
		"parent":   "../" + filepath.Base(filepath.Dir(outside)) + "/secret.txt",
		"absolute": outside,
		"empty":    "",
		"folder":   "out",
		"missing":  "nothing.mp4",
	} {
		if got, err := resolveSessionArtifact(roots, requested); err == nil {
			t.Errorf("%s: %q must be refused, got %s", name, requested, got)
		}
	}
}

func TestResolveSessionArtifactRefusesALinkOutOfTheFolder(t *testing.T) {
	workspace := t.TempDir()
	secret := filepath.Join(t.TempDir(), "secret.txt")
	if err := os.WriteFile(secret, []byte("secret"), 0o644); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(workspace, "innocent.txt")
	if err := os.Symlink(secret, link); err != nil {
		t.Skipf("symbolic links are not available here: %v", err)
	}
	if got, err := resolveSessionArtifact([]string{workspace}, "innocent.txt"); err == nil {
		t.Fatalf("a link to a file outside the folder must be refused, got %s", got)
	}
}
