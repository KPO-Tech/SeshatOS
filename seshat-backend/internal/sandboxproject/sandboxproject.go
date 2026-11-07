// Package sandboxproject holds what the desktop needs to offer the runtime's project
// sandbox: where the sidecar is, whether this machine can use it, and what it protects
// by default.
package sandboxproject

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	sdk "github.com/KPO-Tech/seshat-runtime/pkg/sdk"
)

// sidecarPathEnv points at a sidecar outside the app, for a local build.
const sidecarPathEnv = "SESHAT_SANDBOXD_PATH"

// protectTimeout bounds a change of the protected list. A first protection walks every
// file below a folder, which took 7 s for 50 000 files, and a browser profile can hold more.
const protectTimeout = 5 * time.Minute

// Host applies the sandbox's read refusals through the sidecar.
type Host struct {
	// Path is the sidecar, empty when there is none.
	Path string
	// Reason says why the sandbox cannot be used here, empty when it can.
	Reason string
}

// NewHost finds the sidecar next to the backend, where the app ships it.
func NewHost() *Host {
	return newHost(runtime.GOOS, os.Getenv(sidecarPathEnv), executableDir())
}

func newHost(goos, override, dir string) *Host {
	if goos != "windows" {
		return &Host{Reason: "The project sandbox is only available on Windows for now."}
	}
	path := strings.TrimSpace(override)
	if path == "" {
		path = filepath.Join(dir, "seshat-sandboxd.exe")
	}
	// #nosec G703 -- path is the helper the app ships next to itself, or the one named in the app's own configuration
	if info, err := os.Stat(path); err != nil || info.IsDir() {
		return &Host{Reason: "This build of the app does not include the sandbox."}
	}
	return &Host{Path: path}
}

func executableDir() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	return filepath.Dir(exe)
}

// Available says whether the sandbox can be used here.
func (h *Host) Available() bool { return h != nil && h.Path != "" }

// UnavailableReason says why it cannot.
func (h *Host) UnavailableReason() string {
	if h == nil {
		return "The sandbox is not set up."
	}
	return h.Reason
}

// Protect refuses paths to commands carrying capabilitySID.
func (h *Host) Protect(ctx context.Context, capabilitySID string, paths []string) error {
	ctx, cancel := context.WithTimeout(ctx, protectTimeout)
	defer cancel()
	return sdk.ApplySandboxdProtection(ctx, h.Path, capabilitySID, paths)
}

// Unprotect takes that refusal back.
func (h *Host) Unprotect(ctx context.Context, capabilitySID string, paths []string) error {
	ctx, cancel := context.WithTimeout(ctx, protectTimeout)
	defer cancel()
	return sdk.RemoveSandboxdProtection(ctx, h.Path, capabilitySID, paths)
}

// DefaultDenyRead lists what a command should not read on this machine: credentials of
// the usual tools, browser profiles, and the app's own keys. The app's folder is named
// file by file because session workspaces live below it, and a refusal on the folder
// would reach what a command creates there.
func DefaultDenyRead(home, localAppData, appData, runtimeRoot string) []string {
	var paths []string
	if home != "" {
		for _, name := range []string{
			".ssh", ".gnupg", ".aws", ".azure", ".kube", ".docker",
			filepath.Join(".config", "gh"), ".git-credentials", ".npmrc",
		} {
			paths = append(paths, filepath.Join(home, name))
		}
	}
	if localAppData != "" {
		for _, profile := range []string{
			filepath.Join("Google", "Chrome", "User Data"),
			filepath.Join("Microsoft", "Edge", "User Data"),
			filepath.Join("BraveSoftware", "Brave-Browser", "User Data"),
		} {
			paths = append(paths, filepath.Join(localAppData, profile))
		}
	}
	if appData != "" {
		paths = append(paths, filepath.Join(appData, "Mozilla", "Firefox", "Profiles"))
	}
	if runtimeRoot != "" {
		for _, name := range []string{"secret.key", "seshat.db", "seshat.db-wal", "seshat.db-shm", ".env"} {
			paths = append(paths, filepath.Join(runtimeRoot, name))
		}
	}
	return paths
}

// DefaultDenyReadHere is DefaultDenyRead for this user.
func DefaultDenyReadHere(runtimeRoot string) []string {
	home, _ := os.UserHomeDir()
	return DefaultDenyRead(home, os.Getenv("LOCALAPPDATA"), os.Getenv("APPDATA"), runtimeRoot)
}

// CleanDenyRead keeps the absolute paths, once each, in the order given.
func CleanDenyRead(paths []string) []string {
	seen := make(map[string]bool, len(paths))
	clean := make([]string, 0, len(paths))
	for _, path := range paths {
		path = strings.TrimSpace(path)
		if path == "" || !filepath.IsAbs(path) {
			continue
		}
		path = filepath.Clean(path)
		key := strings.ToLower(path)
		if seen[key] {
			continue
		}
		seen[key] = true
		clean = append(clean, path)
	}
	return clean
}

// Removed returns what is in before and no longer in after.
func Removed(before, after []string) []string {
	kept := make(map[string]bool, len(after))
	for _, path := range after {
		kept[strings.ToLower(path)] = true
	}
	var removed []string
	for _, path := range before {
		if !kept[strings.ToLower(path)] {
			removed = append(removed, path)
		}
	}
	return removed
}
