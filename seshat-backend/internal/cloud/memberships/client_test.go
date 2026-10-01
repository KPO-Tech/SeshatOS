package cloudmemberships

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientListOrgMemberships(t *testing.T) {
	var gotAuth, gotQuery string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/memberships" || r.Method != http.MethodGet {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		gotQuery = r.URL.Query().Get("organization_id")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"memberships": []OrgMembership{{ID: "mem_1", UserID: "usr_1", Role: "member"}},
			"count":       1,
		})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	memberships, err := client.ListOrgMemberships(context.Background(), "user-token", "org_1")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if gotAuth != "Bearer user-token" {
		t.Fatalf("expected the user's session token as bearer auth, got %q", gotAuth)
	}
	if gotQuery != "org_1" {
		t.Fatalf("expected organization_id to be forwarded, got %q", gotQuery)
	}
	if len(memberships) != 1 || memberships[0].ID != "mem_1" {
		t.Fatalf("unexpected memberships: %+v", memberships)
	}
}

func TestClientCreateOrgMemberDirectIncludesOrganizationID(t *testing.T) {
	var gotBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/memberships/direct" || r.Method != http.MethodPost {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(OrgMembership{ID: "mem_new", Role: gotBody["role"].(string)})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	membership, err := client.CreateOrgMemberDirect(context.Background(), "tok", CreateOrgMemberDirectParams{
		OrganizationID: "org_1", Email: "new@example.com", DisplayName: "New Person", Role: "member",
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if membership.ID != "mem_new" {
		t.Fatalf("unexpected membership: %+v", membership)
	}
	if gotBody["organization_id"] != "org_1" {
		t.Fatalf("expected organization_id in the request body, got %+v", gotBody)
	}
	if _, hasPassword := gotBody["password"]; hasPassword {
		t.Fatal("expected no password field to be sent - the new member sets their own via email")
	}
}

func TestClientUpdateOrgMembershipRole(t *testing.T) {
	var gotBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/memberships/mem_1" || r.Method != http.MethodPut {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		_ = json.NewEncoder(w).Encode(OrgMembership{ID: "mem_1", Role: gotBody["role"].(string)})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	membership, err := client.UpdateOrgMembershipRole(context.Background(), "tok", "mem_1", "manager")
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if membership.Role != "manager" {
		t.Fatalf("unexpected membership: %+v", membership)
	}
}

func TestClientDeleteOrgMembership(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/memberships/mem_1" || r.Method != http.MethodDelete {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	if err := client.DeleteOrgMembership(context.Background(), "tok", "mem_1"); err != nil {
		t.Fatalf("delete: %v", err)
	}
}

func TestClientListOrgRoles(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/roles" || r.Method != http.MethodGet {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"roles": []OrgRole{{Code: "member", Name: "Member", System: true}, {Code: "data_scientist", Name: "Data Scientist"}},
		})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	roles, err := client.ListOrgRoles(context.Background(), "tok", "org_1")
	if err != nil {
		t.Fatalf("list roles: %v", err)
	}
	if len(roles) != 2 || roles[1].Code != "data_scientist" {
		t.Fatalf("unexpected roles: %+v", roles)
	}
}

func TestClientListOrgMembershipsPropagatesForbidden(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":{"message":"members.manage required"}}`))
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	if _, err := client.ListOrgMemberships(context.Background(), "tok", "org_1"); err == nil {
		t.Fatal("expected a forbidden error to propagate")
	}
}
