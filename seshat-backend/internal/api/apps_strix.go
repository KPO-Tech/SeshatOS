package api

import (
	"context"
	"net/http"
	"os/exec"
	"strings"
	"time"
)

// prereqCheckTimeout bounds each external command this status check shells
// out to (docker, strix) — a hung/misbehaving binary must not hang the
// request indefinitely.
const prereqCheckTimeout = 3 * time.Second

// StrixStatus is the readiness signal a future dedicated seshat-ui app (see
// the "planned" Pentest entry in pages/apps/index.tsx) consumes instead of
// the generic skill-repos catalog — this is specific to the strix app: is
// its skill installed, and are its own runtime prerequisites (Docker, the
// strix CLI) actually met right now on this device.
type StrixStatus struct {
	SkillInstalled bool   `json:"skill_installed"`
	DockerReady    bool   `json:"docker_ready"`
	CLIInstalled   bool   `json:"cli_installed"`
	CLIVersion     string `json:"cli_version,omitempty"`
	Ready          bool   `json:"ready"`
}

// GET /api/v1/apps/strix/status
func (a *App) handleAppsStrixStatus(w http.ResponseWriter, r *http.Request) {
	_, skillInstalled := installedRepoNames()[strixFeaturedRepoName]

	status := StrixStatus{
		SkillInstalled: skillInstalled,
		DockerReady:    commandOK(r.Context(), "docker", "info"),
	}
	if version, ok := commandOutput(r.Context(), "strix", "--version"); ok {
		status.CLIInstalled = true
		status.CLIVersion = version
	}
	status.Ready = status.SkillInstalled && status.DockerReady && status.CLIInstalled

	writeJSON(w, http.StatusOK, status)
}

const strixFeaturedRepoName = "strix"

func commandOK(ctx context.Context, name string, args ...string) bool {
	ctx, cancel := context.WithTimeout(ctx, prereqCheckTimeout)
	defer cancel()
	return exec.CommandContext(ctx, name, args...).Run() == nil
}

func commandOutput(ctx context.Context, name string, args ...string) (string, bool) {
	ctx, cancel := context.WithTimeout(ctx, prereqCheckTimeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, name, args...).Output()
	if err != nil {
		return "", false
	}
	return strings.TrimSpace(string(out)), true
}
