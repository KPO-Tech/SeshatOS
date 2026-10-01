package cloudwebsearch

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientUpsertOrgPolicy(t *testing.T) {
	var gotAuth string
	var gotBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/web-search-org-policy" || r.Method != http.MethodPut {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		_ = json.NewEncoder(w).Encode(OrgPolicy{AllowedDomains: []string{"example.com"}, BlockedDomains: []string{"blocked.com"}})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	policy, err := client.UpsertOrgPolicy(context.Background(), "user-token", UpsertOrgPolicyParams{
		OrganizationID: "org_1", AllowedDomains: []string{"example.com"}, BlockedDomains: []string{"blocked.com"},
	})
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if gotAuth != "Bearer user-token" {
		t.Fatalf("expected the user's session token as bearer auth, got %q", gotAuth)
	}
	if gotBody["organization_id"] != "org_1" {
		t.Fatalf("expected organization_id in the request body, got %+v", gotBody)
	}
	if len(policy.AllowedDomains) != 1 || policy.AllowedDomains[0] != "example.com" {
		t.Fatalf("unexpected policy: %+v", policy)
	}
}

func TestClientUpsertOrgPolicyPropagatesForbidden(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":{"message":"organization.manage required"}}`))
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	if _, err := client.UpsertOrgPolicy(context.Background(), "tok", UpsertOrgPolicyParams{OrganizationID: "org_1"}); err == nil {
		t.Fatal("expected a forbidden error to propagate")
	}
}
