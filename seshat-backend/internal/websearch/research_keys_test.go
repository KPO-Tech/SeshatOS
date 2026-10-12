package websearch

import (
	"context"
	"path/filepath"
	"testing"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

func newResearchService(t *testing.T) (*Service, *backendauth.Principal) {
	t.Helper()
	ctx := context.Background()
	database, err := db.Open(ctx, db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { database.Close() })
	identities, err := db.NewIdentityStore(database)
	if err != nil {
		t.Fatalf("identity store: %v", err)
	}
	hash, err := db.HashPassword("test-password-secure")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	user, err := identities.CreateUser(ctx, db.CreateUserParams{Email: "research@example.com", DisplayName: "R", PasswordHash: hash, Status: db.UserStatusActive})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	configs, err := db.NewSearchProviderConfigStore(database)
	if err != nil {
		t.Fatalf("provider config store: %v", err)
	}
	return NewService(nil, nil, configs, nil, nil, nil), &backendauth.Principal{User: backendauth.User{ID: user.ID}}
}

func configure(t *testing.T, s *Service, p *backendauth.Principal, provider string, enabled bool, clientID, key string) {
	t.Helper()
	params := UpsertProviderParams{Enabled: enabled}
	if key != "" {
		params.APIKey = &key
	}
	if clientID != "" {
		params.AuthUsername = &clientID
	}
	if _, err := s.UpsertProvider(context.Background(), p, provider, params); err != nil {
		t.Fatalf("configure %s: %v", provider, err)
	}
}

func TestResearchKeysAreTheOnesThePersonConfiguredInTheNamesTheEngineTakes(t *testing.T) {
	s, p := newResearchService(t)
	configure(t, s, p, "reddit", true, "app-id", "app-secret")
	configure(t, s, p, "youtube", true, "", "yt-key")
	configure(t, s, p, "google_places", false, "", "gp-key") // switched off
	configure(t, s, p, "trustpilot", true, "", "")           // enabled but has no key
	configure(t, s, p, "tavily", true, "", "tv-key")         // a web search provider is not a research key

	keys := s.ResearchKeys(context.Background(), p)

	want := map[string]string{"reddit_client_id": "app-id", "reddit_client_secret": "app-secret", "youtube_api_key": "yt-key"}
	if len(keys) != len(want) {
		t.Fatalf("expected %v, got %v", want, keys)
	}
	for name, value := range want {
		if keys[name] != value {
			t.Errorf("%s = %q, want %q", name, keys[name], value)
		}
	}
}

func TestRedditWithoutItsClientIDGivesNoKeyAtAll(t *testing.T) {
	s, p := newResearchService(t)
	configure(t, s, p, "reddit", true, "", "app-secret")

	if keys := s.ResearchKeys(context.Background(), p); len(keys) != 0 {
		t.Fatalf("half of Reddit's credentials is none, got %v", keys)
	}
}

func TestNoOneElsesKeysAreReturned(t *testing.T) {
	s, p := newResearchService(t)
	configure(t, s, p, "youtube", true, "", "yt-key")

	stranger := &backendauth.Principal{User: backendauth.User{ID: "someone-else"}}
	if keys := s.ResearchKeys(context.Background(), stranger); len(keys) != 0 {
		t.Fatalf("keys are per person, got %v", keys)
	}
	if keys := s.ResearchKeys(context.Background(), nil); len(keys) != 0 {
		t.Fatalf("no principal, no keys, got %v", keys)
	}
}

func TestAResearchSourceNeverAnswersAWebSearch(t *testing.T) {
	s, p := newResearchService(t)
	configure(t, s, p, "youtube", true, "", "yt-key")
	configure(t, s, p, "tavily", true, "", "tv-key")

	providers, err := s.resolveProviders(context.Background(), p, &Settings{}, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(providers) != 1 || providers[0].Provider != "tavily" {
		t.Fatalf("only the web search provider may be asked to search, got %+v", providers)
	}
}

func TestTheProviderListSaysWhichEntriesAreResearchSources(t *testing.T) {
	s, p := newResearchService(t)

	list, err := s.ListProviders(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	kinds := map[string]string{}
	for _, status := range list {
		kinds[status.Provider] = status.Kind
	}
	for _, name := range []string{"reddit", "youtube", "google_places", "trustpilot"} {
		if kinds[name] != KindResearch {
			t.Errorf("%s must be listed as a research source, got %q", name, kinds[name])
		}
	}
	if kinds["tavily"] != "" {
		t.Errorf("tavily is a web search provider, got kind %q", kinds["tavily"])
	}
}
