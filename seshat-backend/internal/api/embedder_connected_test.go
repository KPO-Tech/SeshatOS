package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// These tests prove the fix for a real duplication bug: /settings/embedder
// used to always read/write this device's own local db.EmbedderConfigStore,
// even when connected to an organization server - silently ignoring
// seshat-server's real per-organization EmbedderSetting that
// seshat-console's EmbedderSettingsPage.tsx edits. handleEmbedderConfig now
// branches on connected mode, matching how /corpora already behaves.

func TestEmbedderConfigConnectedProxiesToOrgSetting(t *testing.T) {
	fx := newSecurityTestFixture(t)

	var gotAuth, gotQuery string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/embedder-settings" || r.Method != http.MethodGet {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		gotQuery = r.URL.Query().Get("organization_id")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id": "embset_1", "organization_id": gotQuery, "provider": "openai", "model": "text-embedding-3-small", "base_url": "https://api.openai.com/v1",
		})
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/embedder", nil)
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.Code, resp.Body.String())
	}
	if gotAuth == "" || gotAuth == "Bearer " {
		t.Fatal("expected the caller's session token to be forwarded as bearer auth")
	}
	if gotQuery == "" {
		t.Fatal("expected organization_id to be forwarded")
	}
	var out embedderConfigResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Provider != "openai" || out.Model != "text-embedding-3-small" || !out.IsConfigured {
		t.Fatalf("unexpected response: %+v", out)
	}
}

func TestEmbedderConfigConnectedReturnsDefaultWhenOrgHasNoSetting(t *testing.T) {
	fx := newSecurityTestFixture(t)

	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/embedder", nil)
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200 (not-configured-yet is not an error), got %d: %s", resp.Code, resp.Body.String())
	}
	var out embedderConfigResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.IsConfigured {
		t.Fatalf("expected is_configured=false when the org has no setting yet, got %+v", out)
	}
}

func TestEmbedderConfigConnectedSavesOrgSetting(t *testing.T) {
	fx := newSecurityTestFixture(t)

	var gotBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/embedder-settings" || r.Method != http.MethodPut {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id": "embset_1", "organization_id": gotBody["organization_id"], "provider": gotBody["provider"], "model": gotBody["model"], "base_url": gotBody["base_url"],
		})
	}))
	defer fakeServer.Close()
	fx.app.connectedServerURL = fakeServer.URL

	body, _ := json.Marshal(map[string]any{
		"provider": "ollama", "model": "nomic-embed-text", "base_url": "http://localhost:11434",
	})
	req := httptest.NewRequest(http.MethodPut, "/api/v1/settings/embedder", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.Code, resp.Body.String())
	}
	if gotBody["organization_id"] == nil || gotBody["organization_id"] == "" {
		t.Fatalf("expected organization_id to be injected server-side, got %+v", gotBody)
	}
	if gotBody["provider"] != "ollama" || gotBody["model"] != "nomic-embed-text" {
		t.Fatalf("unexpected forwarded body: %+v", gotBody)
	}
}

func TestEmbedderConfigStandaloneStaysLocal(t *testing.T) {
	fx := newSecurityTestFixture(t)
	// connectedServerURL is empty by default - fx.app.embedderStore is also
	// nil in this fixture, so standalone GET should report the store being
	// unavailable rather than silently reaching for a server it has none of.

	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/embedder", nil)
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)

	if resp.Code == http.StatusOK {
		t.Fatalf("expected standalone mode without a wired embedderStore to fail cleanly, got 200: %s", resp.Body.String())
	}
}
