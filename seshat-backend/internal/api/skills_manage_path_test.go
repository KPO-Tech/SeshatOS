package api

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestResolveInsideSkillRoot(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, "skill")
	if err := os.MkdirAll(filepath.Join(root, "scripts"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "scripts", "run.sh"), []byte("echo hi"), 0o644); err != nil {
		t.Fatal(err)
	}
	secret := filepath.Join(base, "secret.txt")
	if err := os.WriteFile(secret, []byte("private"), 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := resolveInsideSkillRoot(root, "scripts/run.sh")
	if err != nil {
		t.Fatalf("a file of the skill must resolve: %v", err)
	}
	if filepath.Base(got) != "run.sh" {
		t.Fatalf("unexpected path %q", got)
	}

	if _, err := resolveInsideSkillRoot(root, "../secret.txt"); !errors.Is(err, errOutsideSkillRoot) {
		t.Fatalf("a path that climbs out must be refused as outside, got %v", err)
	}
	if _, err := resolveInsideSkillRoot(root, "../missing.txt"); !errors.Is(err, errOutsideSkillRoot) {
		t.Fatalf("a path that climbs out is outside even when its target is missing, got %v", err)
	}
	if _, err := resolveInsideSkillRoot(root, "scripts/missing.sh"); err == nil || errors.Is(err, errOutsideSkillRoot) {
		t.Fatalf("a missing file of the skill is a plain error, got %v", err)
	}

	// Creating a link needs a privilege on some systems; the rest of the test does not.
	if err := os.Symlink(secret, filepath.Join(root, "link.txt")); err != nil {
		t.Skipf("cannot create a symbolic link here: %v", err)
	}
	if _, err := resolveInsideSkillRoot(root, "link.txt"); !errors.Is(err, errOutsideSkillRoot) {
		t.Fatalf("a link that leads out of the folder must be refused, got %v", err)
	}
}
