package cloudteams

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientListOrgTeams(t *testing.T) {
	var gotAuth, gotQuery string
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/groups" || r.Method != http.MethodGet {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		gotQuery = r.URL.Query().Get("organization_id")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"groups": []OrgTeam{{ID: "grp_1", Name: "Engineering", Slug: "engineering"}},
			"count":  1,
		})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	teams, err := client.ListOrgTeams(context.Background(), "user-token", "org_1")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if gotAuth != "Bearer user-token" {
		t.Fatalf("expected the user's session token as bearer auth, got %q", gotAuth)
	}
	if gotQuery != "org_1" {
		t.Fatalf("expected organization_id to be forwarded, got %q", gotQuery)
	}
	if len(teams) != 1 || teams[0].ID != "grp_1" {
		t.Fatalf("unexpected teams: %+v", teams)
	}
}

func TestClientCreateOrgTeamIncludesOrganizationID(t *testing.T) {
	var gotBody map[string]any
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/groups" || r.Method != http.MethodPost {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(OrgTeam{ID: "grp_new", Name: gotBody["name"].(string)})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	team, err := client.CreateOrgTeam(context.Background(), "tok", CreateOrgTeamParams{
		OrganizationID: "org_1", Name: "Design", Slug: "design", MemberUserIDs: []string{"usr_1"},
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if team.ID != "grp_new" {
		t.Fatalf("unexpected team: %+v", team)
	}
	if gotBody["organization_id"] != "org_1" {
		t.Fatalf("expected organization_id in the request body, got %+v", gotBody)
	}
}

func TestClientUpdateOrgTeam(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/groups/grp_1" || r.Method != http.MethodPut {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(OrgTeam{ID: "grp_1", Name: "Renamed"})
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	team, err := client.UpdateOrgTeam(context.Background(), "tok", "grp_1", UpdateOrgTeamParams{Name: "Renamed"})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if team.Name != "Renamed" {
		t.Fatalf("unexpected team: %+v", team)
	}
}

func TestClientDeleteOrgTeam(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/groups/grp_1" || r.Method != http.MethodDelete {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	if err := client.DeleteOrgTeam(context.Background(), "tok", "grp_1"); err != nil {
		t.Fatalf("delete: %v", err)
	}
}

func TestClientListOrgTeamsPropagatesForbidden(t *testing.T) {
	fakeServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":{"message":"groups.manage required"}}`))
	}))
	defer fakeServer.Close()

	client := NewClient(fakeServer.URL)
	if _, err := client.ListOrgTeams(context.Background(), "tok", "org_1"); err == nil {
		t.Fatal("expected a forbidden error to propagate")
	}
}
