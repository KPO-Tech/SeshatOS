package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/artifactlibs"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/artifactpreview"
)

func artifactLibsApp(t *testing.T) *App {
	t.Helper()
	dir := t.TempDir()
	file := filepath.Join(dir, "chart.js@4.6.1", "dist", "chart.umd.min.js")
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte(`/* see https://cdn.jsdelivr.net/npm/chart.js@4.6.1/LICENSE */ window.Chart = {}`), 0o644); err != nil {
		t.Fatal(err)
	}
	manifest := map[string]any{"libraries": []map[string]any{{
		"name": "chart.js", "version": "4.6.1", "main": "dist/chart.umd.min.js",
		"files": map[string]string{"dist/chart.umd.min.js": "x"},
	}}}
	raw, _ := json.Marshal(manifest)
	if err := os.WriteFile(filepath.Join(dir, "manifest.json"), raw, 0o644); err != nil {
		t.Fatal(err)
	}
	bundle, err := artifactlibs.LoadBundle(dir)
	if err != nil {
		t.Fatal(err)
	}
	return &App{artifactPreviews: artifactpreview.NewStore(), artifactLibs: artifactlibs.New(bundle, nil)}
}

func TestArtifactPreviewPointsCDNAddressesHere(t *testing.T) {
	app := artifactLibsApp(t)
	id, err := app.artifactPreviews.Put(`<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script><img src="https://example.com/x.png">`)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/artifacts/preview/"+id, nil)
	req.Host = "127.0.0.1:7777"
	rec := httptest.NewRecorder()
	app.handleArtifactPreviewGet(rec, req)

	body := rec.Body.String()
	lib := "http://127.0.0.1:7777/api/v1/artifacts/lib"
	if !strings.Contains(body, lib+"/cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js") {
		t.Fatalf("CDN address not rewritten: %s", body)
	}
	if !strings.Contains(body, "https://example.com/x.png") {
		t.Fatalf("an address of another host was rewritten: %s", body)
	}
	csp := rec.Header().Get("Content-Security-Policy")
	for _, want := range []string{"script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' " + lib + "/;", "connect-src 'none'", "form-action 'none'"} {
		if !strings.Contains(csp, want) {
			t.Errorf("CSP lacks %q: %s", want, csp)
		}
	}
	if strings.Contains(csp, "https:") || strings.Contains(csp, "*") {
		t.Errorf("CSP opens the network: %s", csp)
	}
}

func TestArtifactLibServesShippedFile(t *testing.T) {
	app := artifactLibsApp(t)
	req := httptest.NewRequest(http.MethodGet, "/artifacts/lib/cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js", nil)
	req.Host = "127.0.0.1:7777"
	rec := httptest.NewRecorder()
	app.handleArtifactLib(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, "text/javascript") {
		t.Errorf("content type %q", got)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" || !strings.Contains(rec.Header().Get("Content-Security-Policy"), "sandbox") {
		t.Errorf("headers %v", rec.Header())
	}
	if !strings.Contains(rec.Body.String(), "http://127.0.0.1:7777/api/v1/artifacts/lib/cdn.jsdelivr.net/npm/chart.js@4.6.1/LICENSE") {
		t.Errorf("addresses inside the served file not rewritten: %s", rec.Body.String())
	}
}

func TestArtifactLibRefusesOtherHosts(t *testing.T) {
	app := artifactLibsApp(t)
	for _, path := range []string{"/artifacts/lib/example.com/x.js", "/artifacts/lib/cdn.jsdelivr.net/npm/left-pad@1.3.0/index.js"} {
		rec := httptest.NewRecorder()
		app.handleArtifactLib(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s: status %d", path, rec.Code)
		}
	}
}

func TestWithPageReporterRunsFirst(t *testing.T) {
	cases := map[string]string{
		`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><script>x()</script></head></html>`: `<head>` + artifactPageStyle + artifactPageReporter + `<meta`,
		`<html><body><script>x()</script></body></html>`:                                                `<html>` + artifactPageStyle + artifactPageReporter + `<body>`,
		`<!doctype html><body>hi</body>`:                                                                `<!doctype html>` + artifactPageStyle + artifactPageReporter,
		`<canvas id=c></canvas><script>x()</script>`:                                                    artifactPageStyle + artifactPageReporter + `<canvas`,
		`<HEADER>not the head</HEADER><script>x()</script>`:                                             artifactPageStyle + artifactPageReporter + `<HEADER>`,
	}
	for in, want := range cases {
		if got := withPageReporter(in); !strings.Contains(got, want) {
			t.Errorf("withPageReporter(%q) = %q", in, got)
		}
	}
}
