package cloudsettings

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientListOrgProviderSettings(t *testing.T) {
	var gotAuth, gotQuery string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/provider-settings" || r.Method != http.MethodGet {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		gotQuery = r.URL.Query().Get("organization_id")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"provider_settings": []OrgProviderSetting{{ID: "prov_1", Provider: "openai", DefaultModel: "gpt-5"}},
			"count":             1,
		})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	settings, err := client.ListOrgProviderSettings(context.Background(), "user-token", "org_1")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if gotAuth != "Bearer user-token" {
		t.Fatalf("expected the user's session token as bearer auth, got %q", gotAuth)
	}
	if gotQuery != "org_1" {
		t.Fatalf("expected organization_id to be forwarded, got %q", gotQuery)
	}
	if len(settings) != 1 || settings[0].ID != "prov_1" {
		t.Fatalf("unexpected settings: %+v", settings)
	}
}

func TestClientCreateOrgProviderSettingIncludesOrganizationID(t *testing.T) {
	var gotBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/provider-settings" || r.Method != http.MethodPost {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(OrgProviderSetting{ID: "prov_new", Provider: gotBody["provider"].(string)})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	setting, err := client.CreateOrgProviderSetting(context.Background(), "tok", CreateOrgProviderSettingParams{
		OrganizationID: "org_1", Provider: "anthropic", DefaultModel: "claude-sonnet-5", APIKey: "sk-secret",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if setting.ID != "prov_new" {
		t.Fatalf("unexpected setting: %+v", setting)
	}
	if gotBody["organization_id"] != "org_1" {
		t.Fatalf("expected organization_id in the request body, got %+v", gotBody)
	}
	if gotBody["api_key"] != "sk-secret" {
		t.Fatalf("expected api_key to be forwarded, got %+v", gotBody)
	}
}

func TestClientUpdateOrgProviderSetting(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/provider-settings/prov_1" || r.Method != http.MethodPut {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(OrgProviderSetting{ID: "prov_1", DefaultModel: "gpt-5.1"})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	setting, err := client.UpdateOrgProviderSetting(context.Background(), "tok", "prov_1", UpdateOrgProviderSettingParams{DefaultModel: "gpt-5.1"})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if setting.DefaultModel != "gpt-5.1" {
		t.Fatalf("unexpected setting: %+v", setting)
	}
}

func TestClientDeleteOrgProviderSetting(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/provider-settings/prov_1" || r.Method != http.MethodDelete {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	if err := client.DeleteOrgProviderSetting(context.Background(), "tok", "prov_1"); err != nil {
		t.Fatalf("delete: %v", err)
	}
}

func TestClientSetOrgProviderSettingDefaultPicksCorrectAction(t *testing.T) {
	var gotPaths []string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPaths = append(gotPaths, r.URL.Path)
		_ = json.NewEncoder(w).Encode(OrgProviderSetting{ID: "prov_1"})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	if _, err := client.SetOrgProviderSettingDefault(context.Background(), "tok", "prov_1", true); err != nil {
		t.Fatalf("set default: %v", err)
	}
	if _, err := client.SetOrgProviderSettingDefault(context.Background(), "tok", "prov_1", false); err != nil {
		t.Fatalf("unset default: %v", err)
	}
	if len(gotPaths) != 2 || gotPaths[0] != "/api/v1/provider-settings/prov_1/set-default" || gotPaths[1] != "/api/v1/provider-settings/prov_1/unset-default" {
		t.Fatalf("unexpected request paths: %v", gotPaths)
	}
}

func TestClientListOrgProviderSettingsPropagatesForbidden(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":{"message":"provider_settings.manage required"}}`))
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	if _, err := client.ListOrgProviderSettings(context.Background(), "tok", "org_1"); err == nil {
		t.Fatal("expected a forbidden error to propagate")
	}
}
