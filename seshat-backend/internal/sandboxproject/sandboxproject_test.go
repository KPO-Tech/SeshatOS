package sandboxproject

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestNewHostOffersTheSandboxOnlyWhenItCanRun(t *testing.T) {
	if host := newHost("linux", "", t.TempDir()); host.Available() || host.UnavailableReason() == "" {
		t.Fatalf("no backend outside Windows, got %+v", host)
	}
	dir := t.TempDir()
	if host := newHost("windows", "", dir); host.Available() || host.UnavailableReason() == "" {
		t.Fatalf("no sidecar in the folder, got %+v", host)
	}
	shipped := filepath.Join(dir, "seshat-sandboxd.exe")
	if err := os.WriteFile(shipped, nil, 0o755); err != nil {
		t.Fatal(err)
	}
	if host := newHost("windows", "", dir); !host.Available() || host.Path != shipped {
		t.Fatalf("the shipped sidecar was not found, got %+v", host)
	}
	if host := newHost("windows", shipped, t.TempDir()); !host.Available() || host.Path != shipped {
		t.Fatalf("the override was not used, got %+v", host)
	}
	var none *Host
	if none.Available() || none.UnavailableReason() == "" {
		t.Fatal("a missing host must say it is unavailable")
	}
}

// Workspaces live below the app's folder: a refusal on the folder would reach what a
// command creates there.
func TestDefaultDenyReadNamesTheAppsFilesAndNotItsFolder(t *testing.T) {
	root := filepath.Join("home", ".config", "seshat")
	paths := DefaultDenyRead("home", "local", "roaming", root)
	if contains(paths, root) {
		t.Fatal("the app's folder must not be refused as a whole")
	}
	for _, want := range []string{
		filepath.Join(root, "secret.key"),
		filepath.Join(root, "seshat.db"),
		filepath.Join("home", ".ssh"),
		filepath.Join("home", ".config", "gh"),
		filepath.Join("local", "Google", "Chrome", "User Data"),
		filepath.Join("roaming", "Mozilla", "Firefox", "Profiles"),
	} {
		if !contains(paths, want) {
			t.Errorf("missing %s", want)
		}
	}
	if got := DefaultDenyRead("", "", "", ""); len(got) != 0 {
		t.Fatalf("nothing known, nothing listed: %v", got)
	}
}

func TestCleanDenyReadKeepsAbsolutePathsOnce(t *testing.T) {
	abs := filepath.Join(t.TempDir(), "a")
	got := CleanDenyRead([]string{" " + abs + " ", strings.ToUpper(abs), "relative", "", abs})
	if !reflect.DeepEqual(got, []string{abs}) {
		t.Fatalf("got %v", got)
	}
}

func TestRemovedIgnoresCase(t *testing.T) {
	got := Removed([]string{`C:\A`, `C:\B`}, []string{`c:\a`})
	if !reflect.DeepEqual(got, []string{`C:\B`}) {
		t.Fatalf("got %v", got)
	}
	if got := Removed([]string{`C:\A`}, []string{`C:\A`, `C:\B`}); got != nil {
		t.Fatalf("nothing removed, got %v", got)
	}
}

func contains(paths []string, want string) bool {
	for _, path := range paths {
		if path == want {
			return true
		}
	}
	return false
}
