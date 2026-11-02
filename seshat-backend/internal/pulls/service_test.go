package pulls

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestParsePullURL(t *testing.T) {
	r, ok := parsePullURL("https://github.com/KPO-Tech/SeshatOS/pull/344/files")
	if !ok || r.owner != "KPO-Tech" || r.repo != "SeshatOS" || r.number != 344 {
		t.Fatalf("got %+v ok=%v", r, ok)
	}
	for _, bad := range []string{"", "https://gitlab.com/o/r/pull/1", "https://github.com/o/r/issues/1", "https://github.com/o/r/pull/x", "not a url"} {
		if _, ok := parsePullURL(bad); ok {
			t.Errorf("%q should not parse", bad)
		}
	}
}

func TestParseRemote(t *testing.T) {
	for remote, want := range map[string]string{
		"https://github.com/KPO-Tech/SeshatOS.git": "KPO-Tech/SeshatOS",
		"https://github.com/KPO-Tech/SeshatOS":     "KPO-Tech/SeshatOS",
		"git@github.com:KPO-Tech/SeshatOS.git":     "KPO-Tech/SeshatOS",
	} {
		owner, repo, ok := parseRemote(remote)
		if !ok || owner+"/"+repo != want {
			t.Errorf("%q: got %s/%s ok=%v", remote, owner, repo, ok)
		}
	}
	for _, bad := range []string{"", "https://gitlab.com/o/r.git", "git@gitlab.com:o/r.git", "https://github.com/o"} {
		if _, _, ok := parseRemote(bad); ok {
			t.Errorf("%q should not parse", bad)
		}
	}
}

func TestChainCredentialPrefersConnector(t *testing.T) {
	token, source := ChainCredential(func(context.Context) (string, bool) { return " abc ", true })(context.Background())
	if token != "abc" || source != CredentialConnector {
		t.Fatalf("got %q from %q", token, source)
	}
}

// fakeGitHub answers the few routes the service calls.
func fakeGitHub(t *testing.T, checksStatus int) *httptest.Server {
	t.Helper()
	now := time.Now().UTC()
	pull := func(number int, state string, merged bool, updated time.Time) string {
		return fmt.Sprintf(`{"number":%d,"title":"PR %d","html_url":"https://github.com/o/r/pull/%d","state":%q,"draft":false,"merged":%t,"additions":3,"deletions":1,"updated_at":%q,"head":{"sha":"sha%d"}}`,
			number, number, number, state, merged, updated.Format(time.RFC3339), number)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/o/r/pulls/", func(w http.ResponseWriter, r *http.Request) {
		var number int
		fmt.Sscanf(strings.TrimPrefix(r.URL.Path, "/repos/o/r/pulls/"), "%d", &number)
		switch number {
		case 99:
			fmt.Fprint(w, pull(99, "closed", false, now.Add(-30*24*time.Hour)))
		default:
			fmt.Fprint(w, pull(number, "open", false, now))
		}
	})
	mux.HandleFunc("/repos/o/r/commits/", func(w http.ResponseWriter, r *http.Request) {
		if checksStatus != http.StatusOK {
			w.WriteHeader(checksStatus)
			return
		}
		if strings.Contains(r.URL.Path, "sha2/") {
			fmt.Fprint(w, `{"check_runs":[{"status":"completed","conclusion":"success"},{"status":"completed","conclusion":"failure"}]}`)
			return
		}
		fmt.Fprint(w, `{"check_runs":[{"status":"completed","conclusion":"success"}]}`)
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func newTestService(server *httptest.Server) *Service {
	service := NewService(func(context.Context) (string, string) { return "tok", CredentialConnector })
	service.base = server.URL
	return service
}

func TestTrackListsOnlyTheSessionsPulls(t *testing.T) {
	service := newTestService(fakeGitHub(t, http.StatusOK))
	result := service.Track(context.Background(), Request{URLs: []string{"https://github.com/o/r/pull/99", "https://github.com/o/r/pull/7"}})

	// The addresses the session printed, in their order; a closed one is kept because the session worked on it.
	if len(result.Pulls) != 2 || result.Pulls[0].Number != 99 || result.Pulls[1].Number != 7 {
		t.Fatalf("want the two pull requests of the session, got %+v", result.Pulls)
	}
	if result.Pulls[0].State != StateClosed {
		t.Fatalf("state: %q", result.Pulls[0].State)
	}
	if result.Credential != CredentialConnector || result.Note != "" {
		t.Fatalf("credential %q note %q", result.Credential, result.Note)
	}
}

func TestTrackShowsNothingForASessionWithoutPulls(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++ }))
	defer server.Close()
	// No address printed and a folder that is not a repository: the person's other pull requests are not listed, and GitHub is not asked.
	result := newTestService(server).Track(context.Background(), Request{WorkspacePath: t.TempDir()})
	if len(result.Pulls) != 0 || calls != 0 {
		t.Fatalf("got %d pull requests and %d calls to GitHub", len(result.Pulls), calls)
	}
}

func TestTrackKeepsAtMostVisible(t *testing.T) {
	service := newTestService(fakeGitHub(t, http.StatusOK))
	var urls []string
	for i := 1; i <= Visible+3; i++ {
		urls = append(urls, fmt.Sprintf("https://github.com/o/r/pull/%d", i))
	}
	if result := service.Track(context.Background(), Request{URLs: urls}); len(result.Pulls) != Visible {
		t.Fatalf("want %d, got %d", Visible, len(result.Pulls))
	}
}

func TestTrackChecksVerdict(t *testing.T) {
	service := newTestService(fakeGitHub(t, http.StatusOK))
	result := service.Track(context.Background(), Request{URLs: []string{"https://github.com/o/r/pull/2", "https://github.com/o/r/pull/4"}})
	if result.Pulls[0].Checks != ChecksFailing || result.Pulls[1].Checks != ChecksPassing {
		t.Fatalf("checks: %s, %s", result.Pulls[0].Checks, result.Pulls[1].Checks)
	}
}

func TestTrackTellsWhenChecksCannotBeRead(t *testing.T) {
	service := newTestService(fakeGitHub(t, http.StatusForbidden))
	result := service.Track(context.Background(), Request{URLs: []string{"https://github.com/o/r/pull/2"}})
	if result.Pulls[0].Checks != ChecksUnknown || !strings.Contains(result.Note, "Checks") {
		t.Fatalf("checks %q note %q", result.Pulls[0].Checks, result.Note)
	}
}

func TestTrackWithoutCredential(t *testing.T) {
	service := NewService(func(context.Context) (string, string) { return "", CredentialNone })
	result := service.Track(context.Background(), Request{})
	if len(result.Pulls) != 0 || result.Credential != CredentialNone || result.Note == "" {
		t.Fatalf("got %+v", result)
	}
}

func TestTrackAnswersFromCacheWithinTTL(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()
	service := newTestService(server)
	request := Request{URLs: []string{"https://github.com/o/r/pull/1"}}
	service.Track(context.Background(), request)
	service.Track(context.Background(), request)
	if calls != 1 {
		t.Fatalf("GitHub was asked %d times, want 1", calls)
	}
}

func TestTrackExplainsARefusedToken(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusUnauthorized) }))
	defer server.Close()
	result := newTestService(server).Track(context.Background(), Request{URLs: []string{"https://github.com/o/r/pull/1"}})
	if !strings.Contains(result.Note, "refused") {
		t.Fatalf("note %q", result.Note)
	}
}
