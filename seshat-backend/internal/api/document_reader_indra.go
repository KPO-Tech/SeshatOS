package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/documentreading"
)

// Indra OCR is an optional reader of scanned pages that a person installs from Settings, after accepting the licence of its weights.
// See documentreading/indra.go.

type indraInstallState struct {
	Status      string `json:"status"` // idle, running, completed or failed
	Step        string `json:"step,omitempty"`
	StepIndex   int    `json:"step_index,omitempty"`
	StepCount   int    `json:"step_count,omitempty"`
	Error       string `json:"error,omitempty"`
	StartedAt   int64  `json:"started_at,omitempty"`
	CompletedAt int64  `json:"completed_at,omitempty"`
}

func (a *App) indraInstallSnapshot() indraInstallState {
	a.indraInstallMu.Lock()
	defer a.indraInstallMu.Unlock()
	if a.indraInstall == nil {
		return indraInstallState{Status: "idle"}
	}
	return *a.indraInstall
}

func (a *App) indraStatusResponse() map[string]any {
	return map[string]any{
		"indra":   documentreading.GetIndraStatus(),
		"install": a.indraInstallSnapshot(),
	}
}

func (a *App) handleDocumentReaderIndra(w http.ResponseWriter, r *http.Request, tail string) {
	action := tail[strings.LastIndex(tail, "/")+1:]
	if action == "status" {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(w, http.StatusOK, a.indraStatusResponse())
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	switch action {
	case "install":
		var body struct {
			// AcceptLicense is true when the person ticked the box that says they read and accept the licence of the weights.
			AcceptLicense  bool   `json:"accept_license"`
			LicenseVersion string `json:"license_version"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		if !body.AcceptLicense || body.LicenseVersion != documentreading.IndraLicenseVersion {
			writeBackendError(w, bkerr.InvalidInput("the Indra OCR licence must be accepted before it is installed", nil))
			return
		}
		if err := documentreading.AcceptIndraLicense(); err != nil {
			writeBackendError(w, bkerr.Internal("failed to record the licence acceptance", err))
			return
		}
		started := a.startIndraInstall()
		status := http.StatusOK
		if started {
			status = http.StatusAccepted
		}
		writeJSON(w, status, a.indraStatusResponse())
	case "enabled":
		var body struct {
			Enabled bool `json:"enabled"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		if err := documentreading.SetIndraEnabled(body.Enabled); err != nil {
			if errors.Is(err, documentreading.ErrIndraNotInstalled) || errors.Is(err, documentreading.ErrIndraLicenseNotAccepted) {
				writeBackendError(w, bkerr.InvalidInput(err.Error(), err))
				return
			}
			writeBackendError(w, bkerr.Internal("failed to switch Indra OCR", err))
			return
		}
		writeJSON(w, http.StatusOK, a.indraStatusResponse())
	case "remove":
		if a.indraInstallSnapshot().Status == "running" {
			writeBackendError(w, bkerr.InvalidInput("Indra OCR is being installed; wait for it to finish", nil))
			return
		}
		if err := documentreading.RemoveIndra(); err != nil {
			writeBackendError(w, bkerr.Internal("failed to remove Indra OCR", err))
			return
		}
		a.indraInstallMu.Lock()
		a.indraInstall = nil
		a.indraInstallMu.Unlock()
		writeJSON(w, http.StatusOK, a.indraStatusResponse())
	default:
		http.NotFound(w, r)
	}
}

// startIndraInstall begins the installation in the background and reports whether it began: false when one is already running.
func (a *App) startIndraInstall() bool {
	a.indraInstallMu.Lock()
	if a.indraInstall != nil && a.indraInstall.Status == "running" {
		a.indraInstallMu.Unlock()
		return false
	}
	a.indraInstall = &indraInstallState{Status: "running", StartedAt: time.Now().Unix()}
	a.indraInstallMu.Unlock()

	go func() {
		err := documentreading.InstallIndra(context.Background(), func(progress documentreading.IndraInstallProgress) {
			a.indraInstallMu.Lock()
			defer a.indraInstallMu.Unlock()
			a.indraInstall.Step, a.indraInstall.StepIndex, a.indraInstall.StepCount = progress.Step, progress.StepIndex, progress.StepCount
		})
		a.indraInstallMu.Lock()
		defer a.indraInstallMu.Unlock()
		a.indraInstall.CompletedAt = time.Now().Unix()
		if err != nil {
			a.indraInstall.Status, a.indraInstall.Error = "failed", err.Error()
			return
		}
		a.indraInstall.Status, a.indraInstall.Error = "completed", ""
	}()
	return true
}
