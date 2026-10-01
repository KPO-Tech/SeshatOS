package cloudknowledge

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientGetOrgEmbedderSetting(t *testing.T) {
	var gotAuth, gotQuery string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/embedder-settings" || r.Method != http.MethodGet {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		gotQuery = r.URL.Query().Get("organization_id")
		_ = json.NewEncoder(w).Encode(OrgEmbedderSetting{ID: "embset_1", Provider: "openai", Model: "text-embedding-3-small"})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	setting, err := client.GetOrgEmbedderSetting(context.Background(), "user-token", "org_1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if gotAuth != "Bearer user-token" {
		t.Fatalf("expected the user's session token as bearer auth, got %q", gotAuth)
	}
	if gotQuery != "org_1" {
		t.Fatalf("expected organization_id to be forwarded, got %q", gotQuery)
	}
	if setting == nil || setting.ID != "embset_1" {
		t.Fatalf("unexpected setting: %+v", setting)
	}
}

func TestClientGetOrgEmbedderSettingReturnsNilOnNotFound(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":{"message":"no embedder configured for this organization"}}`))
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	setting, err := client.GetOrgEmbedderSetting(context.Background(), "tok", "org_1")
	if err != nil {
		t.Fatalf("expected a 404 to be treated as 'not configured yet', not an error: %v", err)
	}
	if setting != nil {
		t.Fatalf("expected nil setting when the org has none configured, got %+v", setting)
	}
}

func TestClientSetOrgEmbedderSettingIncludesOrganizationID(t *testing.T) {
	var gotBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/embedder-settings" || r.Method != http.MethodPut {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		_ = json.NewEncoder(w).Encode(OrgEmbedderSetting{ID: "embset_new", Provider: gotBody["provider"].(string)})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	setting, err := client.SetOrgEmbedderSetting(context.Background(), "tok", SetOrgEmbedderSettingParams{
		OrganizationID: "org_1", Provider: "ollama", Model: "nomic-embed-text", BaseURL: "http://localhost:11434",
	})
	if err != nil {
		t.Fatalf("set: %v", err)
	}
	if setting.ID != "embset_new" {
		t.Fatalf("unexpected setting: %+v", setting)
	}
	if gotBody["organization_id"] != "org_1" {
		t.Fatalf("expected organization_id in the request body, got %+v", gotBody)
	}
}

func TestClientGetOrgEmbedderSettingPropagatesForbidden(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":{"message":"knowledge.read required"}}`))
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	if _, err := client.GetOrgEmbedderSetting(context.Background(), "tok", "org_1"); err == nil {
		t.Fatal("expected a forbidden error to propagate")
	}
}
