package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/documentreading"
)

func callIndra(t *testing.T, app *App, method, action, body string) *httptest.ResponseRecorder {
	t.Helper()
	path := "/api/v1/settings/document-reader/indra/" + action
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	app.handleDocumentReaderIndra(rec, req, path)
	return rec
}

func TestIndraStatusIsOffOnAFreshMachineAndShowsTheLicence(t *testing.T) {
	t.Setenv("SESHAT_RUNTIME_ROOT", t.TempDir())
	rec := callIndra(t, &App{}, http.MethodGet, "status", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Indra   documentreading.IndraStatus `json:"indra"`
		Install indraInstallState           `json:"install"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if resp.Indra.Ready || resp.Indra.Installed || resp.Indra.LicenseAccepted {
		t.Fatalf("nothing should be on: %+v", resp.Indra)
	}
	if resp.Indra.LicenseURL == "" || resp.Indra.LicenseVersion == "" || resp.Install.Status != "idle" {
		t.Fatalf("the licence and an idle install should be reported: %+v / %+v", resp.Indra, resp.Install)
	}
}

func TestIndraInstallIsRefusedWithoutTheLicenceBeingAccepted(t *testing.T) {
	t.Setenv("SESHAT_RUNTIME_ROOT", t.TempDir())
	app := &App{}
	for name, body := range map[string]string{
		"no body":              `{}`,
		"box not ticked":       `{"accept_license":false,"license_version":"` + documentreading.IndraLicenseVersion + `"}`,
		"another licence text": `{"accept_license":true,"license_version":"some-older-text"}`,
	} {
		rec := callIndra(t, app, http.MethodPost, "install", body)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s: expected 400, got %d: %s", name, rec.Code, rec.Body.String())
		}
	}
	if documentreading.GetIndraStatus().LicenseAccepted {
		t.Fatal("a refused request must not record an acceptance")
	}
	if app.indraInstallSnapshot().Status != "idle" {
		t.Fatalf("nothing should have started: %+v", app.indraInstallSnapshot())
	}
}

func TestIndraCannotBeSwitchedOnBeforeItIsInstalled(t *testing.T) {
	t.Setenv("SESHAT_RUNTIME_ROOT", t.TempDir())
	rec := callIndra(t, &App{}, http.MethodPost, "enabled", `{"enabled":true}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestIndraRoutesRejectTheWrongMethod(t *testing.T) {
	t.Setenv("SESHAT_RUNTIME_ROOT", t.TempDir())
	app := &App{}
	if rec := callIndra(t, app, http.MethodPost, "status", ""); rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST status: expected 405, got %d", rec.Code)
	}
	if rec := callIndra(t, app, http.MethodGet, "install", ""); rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET install: expected 405, got %d", rec.Code)
	}
}
