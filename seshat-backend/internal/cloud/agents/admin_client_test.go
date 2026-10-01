package cloudagents

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientCreatePresetIncludesOrganizationID(t *testing.T) {
	var gotAuth string
	var gotBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/agent-presets" || r.Method != http.MethodPost {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(AgentPreset{ID: "agentpreset_new", Slug: gotBody["slug"].(string)})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	preset, err := client.CreatePreset(context.Background(), "user-token", CreatePresetParams{
		OrganizationID: "org_1", Slug: "data-scientist", Name: "Data Scientist", SystemPrompt: "You analyze data.",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if gotAuth != "Bearer user-token" {
		t.Fatalf("expected the user's session token as bearer auth, got %q", gotAuth)
	}
	if preset.ID != "agentpreset_new" {
		t.Fatalf("unexpected preset: %+v", preset)
	}
	if gotBody["organization_id"] != "org_1" {
		t.Fatalf("expected organization_id in the request body, got %+v", gotBody)
	}
}

func TestClientUpdatePreset(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/agent-presets/agentpreset_1" || r.Method != http.MethodPut {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(AgentPreset{ID: "agentpreset_1", Name: "Renamed"})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	name := "Renamed"
	preset, err := client.UpdatePreset(context.Background(), "tok", "agentpreset_1", UpdatePresetParams{Name: &name})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if preset.Name != "Renamed" {
		t.Fatalf("unexpected preset: %+v", preset)
	}
}

func TestClientDeletePreset(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/agent-presets/agentpreset_1" || r.Method != http.MethodDelete {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	if err := client.DeletePreset(context.Background(), "tok", "agentpreset_1"); err != nil {
		t.Fatalf("delete: %v", err)
	}
}

func TestClientCreatePresetPropagatesForbidden(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":{"message":"agents_registry.manage required"}}`))
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	if _, err := client.CreatePreset(context.Background(), "tok", CreatePresetParams{OrganizationID: "org_1", Slug: "x"}); err == nil {
		t.Fatal("expected a forbidden error to propagate")
	}
}
