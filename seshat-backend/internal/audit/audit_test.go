package audit

import (
	"context"
	"path/filepath"
	"testing"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

func newTestService(t *testing.T) *Service {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "audit-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	store, err := db.NewAuditLogStore(database)
	if err != nil {
		t.Fatal(err)
	}
	return NewService(store)
}

func member(id string) *backendauth.Principal {
	return &backendauth.Principal{User: backendauth.User{ID: id}, Roles: []string{"member"}}
}

func admin(id string) *backendauth.Principal {
	return &backendauth.Principal{User: backendauth.User{ID: id}, Roles: []string{"Admin"}}
}

func seed(t *testing.T, service *Service) {
	t.Helper()
	ctx := context.Background()
	service.Log(ctx, LogParams{ActorUserID: "alice", Action: ActionFileUpload, ResourceType: "file", ResourceID: "f1", IPAddress: "127.0.0.1"})
	service.Log(ctx, LogParams{ActorUserID: "bob", Action: ActionFileDelete, ResourceType: "file", ResourceID: "f2", Status: StatusDenied})
	service.Log(ctx, LogParams{ActorUserID: "alice", Action: ActionAuthLogin, Metadata: map[string]any{"source": "local"}})
}

// What a person did is not for another member to read: the filter of the request is ignored for anyone who is not an administrator, who is
// always held to their own entries.
func TestAMemberOnlySeesTheirOwnEntriesWhateverActorTheyAskFor(t *testing.T) {
	service := newTestService(t)
	seed(t, service)

	for _, asked := range []string{"", "alice", "bob"} {
		entries, err := service.List(context.Background(), member("alice"), ListParams{ActorUserID: asked})
		if err != nil {
			t.Fatal(err)
		}
		if len(entries) != 2 {
			t.Fatalf("asking for actor %q, alice must see her 2 entries, got %d", asked, len(entries))
		}
		for _, entry := range entries {
			if entry.ActorUserID != "alice" {
				t.Fatalf("asking for actor %q, a member saw an entry of %q", asked, entry.ActorUserID)
			}
		}
	}
}

func TestAnAdministratorSeesEveryoneAndCanFilter(t *testing.T) {
	service := newTestService(t)
	seed(t, service)

	all, err := service.List(context.Background(), admin("root"), ListParams{})
	if err != nil || len(all) != 3 {
		t.Fatalf("an administrator sees the 3 entries, got %d (%v)", len(all), err)
	}
	bobs, err := service.List(context.Background(), admin("root"), ListParams{ActorUserID: "bob"})
	if err != nil || len(bobs) != 1 || bobs[0].Status != StatusDenied {
		t.Fatalf("an administrator can ask for one actor, got %+v (%v)", bobs, err)
	}
	logins, err := service.List(context.Background(), admin("root"), ListParams{Action: ActionAuthLogin})
	if err != nil || len(logins) != 1 || logins[0].Metadata["source"] != "local" {
		t.Fatalf("an administrator can ask for one action, and the metadata comes back, got %+v (%v)", logins, err)
	}
}

func TestAnEventWithNoStatusIsASuccess(t *testing.T) {
	service := newTestService(t)
	service.Log(context.Background(), LogParams{ActorUserID: "alice", Action: ActionCorpusCreate})
	entries, err := service.List(context.Background(), member("alice"), ListParams{})
	if err != nil || len(entries) != 1 || entries[0].Status != StatusSuccess {
		t.Fatalf("got %+v (%v)", entries, err)
	}
}

func TestListNeedsASignedInPersonAndAStore(t *testing.T) {
	service := newTestService(t)
	if _, err := service.List(context.Background(), nil, ListParams{}); bkerr.KindOf(err) != bkerr.ErrorKindUnauthorized {
		t.Errorf("no principal: want unauthorized, got %v", err)
	}
	for name, empty := range map[string]*Service{"a service with no store": NewService(nil), "a nil service": nil} {
		if _, err := empty.List(context.Background(), admin("root"), ListParams{}); bkerr.KindOf(err) != bkerr.ErrorKindUnavailable {
			t.Errorf("%s: want unavailable, got %v", name, err)
		}
	}
}

// Writing the audit trail must never break what is being audited: a service with no store, or no service at all, does nothing and does not panic.
func TestLoggingNeverBreaksTheCaller(t *testing.T) {
	var nilService *Service
	nilService.Log(context.Background(), LogParams{Action: ActionAuthLogin})
	NewService(nil).Log(context.Background(), LogParams{Action: ActionAuthLogin})
}
