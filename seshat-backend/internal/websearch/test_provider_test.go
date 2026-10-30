package websearch

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

// fakeSearXNG answers a search with one result and remembers the credentials it was given.
type fakeSearXNG struct {
	*httptest.Server
	mu    sync.Mutex
	users []string
	pass  []string
}

func newFakeSearXNG(t *testing.T) *fakeSearXNG {
	t.Helper()
	f := &fakeSearXNG{}
	f.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, password, _ := r.BasicAuth()
		f.mu.Lock()
		f.users = append(f.users, user)
		f.pass = append(f.pass, password)
		f.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"results":[{"title":"t","url":"http://example.com","content":"c"}]}`))
	}))
	t.Cleanup(f.Close)
	return f
}

func (f *fakeSearXNG) last() (string, string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.users) == 0 {
		return "", ""
	}
	return f.users[len(f.users)-1], f.pass[len(f.pass)-1]
}

func str(s string) *string { return &s }

func TestTestProviderTriesWhatWasTypedBeforeItIsSaved(t *testing.T) {
	s, p := newResearchService(t)
	server := newFakeSearXNG(t)

	// Nothing is saved for this provider: the test has only what the person typed.
	result, err := s.TestProvider(context.Background(), p, "searxng", ProviderTestOverrides{BaseURL: server.URL, AuthUsername: str("typed-user"), APIKey: str("typed-password")})
	if err != nil {
		t.Fatal(err)
	}
	if !result.OK {
		t.Fatalf("expected the typed settings to work, got %+v", result)
	}
	if user, password := server.last(); user != "typed-user" || password != "typed-password" {
		t.Fatalf("the typed credentials were not the ones used: %q / %q", user, password)
	}
}

func TestTestProviderUsesTheSavedSettingsWhenNothingIsTyped(t *testing.T) {
	s, p := newResearchService(t)
	server := newFakeSearXNG(t)
	saved := UpsertProviderParams{Enabled: true, APIKey: str("saved-password"), AuthUsername: str("saved-user"), BaseURL: server.URL}
	if _, err := s.UpsertProvider(context.Background(), p, "searxng", saved); err != nil {
		t.Fatal(err)
	}

	// The old client sent an empty body: it must keep working.
	if result, err := s.TestProvider(context.Background(), p, "searxng", ProviderTestOverrides{}); err != nil || !result.OK {
		t.Fatalf("expected the saved settings to work, got %+v, %v", result, err)
	}
	if user, password := server.last(); user != "saved-user" || password != "saved-password" {
		t.Fatalf("the saved credentials were not the ones used: %q / %q", user, password)
	}
}

func TestTestProviderPrefersWhatWasTypedToWhatIsSaved(t *testing.T) {
	s, p := newResearchService(t)
	server := newFakeSearXNG(t)
	saved := UpsertProviderParams{Enabled: true, APIKey: str("old-password"), AuthUsername: str("old-user"), BaseURL: server.URL}
	if _, err := s.UpsertProvider(context.Background(), p, "searxng", saved); err != nil {
		t.Fatal(err)
	}

	// Only the password is typed: the saved user name is kept, the typed password replaces the saved one.
	if result, err := s.TestProvider(context.Background(), p, "searxng", ProviderTestOverrides{APIKey: str("new-password")}); err != nil || !result.OK {
		t.Fatalf("expected the test to work, got %+v, %v", result, err)
	}
	if user, password := server.last(); user != "old-user" || password != "new-password" {
		t.Fatalf("expected old-user / new-password, got %q / %q", user, password)
	}

	// An empty typed key means "not typed": it does not erase the saved one.
	if _, err := s.TestProvider(context.Background(), p, "searxng", ProviderTestOverrides{APIKey: str("")}); err != nil {
		t.Fatal(err)
	}
	if _, password := server.last(); password != "old-password" {
		t.Fatalf("an empty typed key must leave the saved key in use, got %q", password)
	}
}

func TestTestProviderStoresNothing(t *testing.T) {
	s, p := newResearchService(t)
	server := newFakeSearXNG(t)
	if _, err := s.TestProvider(context.Background(), p, "searxng", ProviderTestOverrides{BaseURL: server.URL, APIKey: str("typed")}); err != nil {
		t.Fatal(err)
	}
	// A test that is not followed by a save leaves no key behind.
	if _, err := s.providerConfigs.GetByUserAndProvider(context.Background(), p.User.ID, "searxng"); err == nil {
		t.Fatal("testing a provider must not save its settings")
	}
}
