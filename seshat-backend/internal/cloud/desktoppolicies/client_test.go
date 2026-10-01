package clouddesktoppolicies

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientListCatalog(t *testing.T) {
	var gotAuth string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/desktop-policies/catalog" || r.Method != http.MethodGet {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"desktop_policies": []DesktopPolicy{{Code: "allow_local_models", DefaultValue: true}},
		})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	catalog, err := client.ListCatalog(context.Background(), "user-token")
	if err != nil {
		t.Fatalf("list catalog: %v", err)
	}
	if gotAuth != "Bearer user-token" {
		t.Fatalf("expected the user's session token as bearer auth, got %q", gotAuth)
	}
	if len(catalog) != 1 || catalog[0].Code != "allow_local_models" {
		t.Fatalf("unexpected catalog: %+v", catalog)
	}
}

func TestClientListBindings(t *testing.T) {
	var gotQuery string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/desktop-policy-bindings" || r.Method != http.MethodGet {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		gotQuery = r.URL.Query().Get("organization_id")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"desktop_policy_bindings": []DesktopPolicyBinding{{ID: "dpb_1", PolicyCode: "allow_local_models", SubjectType: "org"}},
		})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	bindings, err := client.ListBindings(context.Background(), "tok", "org_1")
	if err != nil {
		t.Fatalf("list bindings: %v", err)
	}
	if gotQuery != "org_1" {
		t.Fatalf("expected organization_id to be forwarded, got %q", gotQuery)
	}
	if len(bindings) != 1 || bindings[0].ID != "dpb_1" {
		t.Fatalf("unexpected bindings: %+v", bindings)
	}
}

func TestClientSetBindingIncludesOrganizationID(t *testing.T) {
	var gotBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/desktop-policy-bindings" || r.Method != http.MethodPost {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		_ = json.NewEncoder(w).Encode(DesktopPolicyBinding{ID: "dpb_new", PolicyCode: gotBody["policy_code"].(string)})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	binding, err := client.SetBinding(context.Background(), "tok", SetBindingParams{
		OrganizationID: "org_1", PolicyCode: "allow_local_models", SubjectType: "org", Value: false,
	})
	if err != nil {
		t.Fatalf("set binding: %v", err)
	}
	if binding.ID != "dpb_new" {
		t.Fatalf("unexpected binding: %+v", binding)
	}
	if gotBody["organization_id"] != "org_1" {
		t.Fatalf("expected organization_id in the request body, got %+v", gotBody)
	}
}

func TestClientDeleteBinding(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/desktop-policy-bindings/dpb_1" || r.Method != http.MethodDelete {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	if err := client.DeleteBinding(context.Background(), "tok", "dpb_1"); err != nil {
		t.Fatalf("delete: %v", err)
	}
}

func TestClientListBindingsPropagatesForbidden(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":{"message":"desktop_policies.manage required"}}`))
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	if _, err := client.ListBindings(context.Background(), "tok", "org_1"); err == nil {
		t.Fatal("expected a forbidden error to propagate")
	}
}
