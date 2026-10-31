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
	if !ok || r.owner != "KPO-Tech" || r.repo != "SeshatOS" || r.number != 344 || !r.session {
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
	mux.HandleFunc("/search/issues", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		var items []string
		for i := 1; i <= 8; i++ {
			state, updated := "open", now.Add(-time.Duration(i)*time.Hour)
			if i == 3 {
				state, updated = "closed", now.Add(-30*24*time.Hour)
			}
			items = append(items, fmt.Sprintf(`{"number":%d,"state":%q,"updated_at":%q,"repository_url":"https://api.github.com/repos/o/r"}`, i, state, updated.Format(time.RFC3339)))
		}
		fmt.Fprintf(w, `{"items":[%s]}`, strings.Join(items, ","))
	})
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

func TestTrackShowsFiveSessionFirstAndDropsStaleClosed(t *testing.T) {
	service := newTestService(fakeGitHub(t, http.StatusOK))
	result := service.Track(context.Background(), Request{URLs: []string{"https://github.com/o/r/pull/99", "https://github.com/o/r/pull/7"}})

	if len(result.Pulls) != Visible {
		t.Fatalf("want %d pull requests, got %d", Visible, len(result.Pulls))
	}
	// The session's addresses come first, a closed one among them is kept because the session asked for it.
	if result.Pulls[0].Number != 99 || !result.Pulls[0].FromSession || result.Pulls[1].Number != 7 {
		t.Fatalf("session pulls should lead: %+v", result.Pulls[:2])
	}
	if result.Pulls[0].State != StateClosed {
		t.Fatalf("state: %q", result.Pulls[0].State)
	}
	if result.Pulls[2].Number != 1 || result.Pulls[2].FromSession || result.Pulls[4].Number != 4 {
		t.Fatalf("own pulls follow, most recent first: %+v", result.Pulls[2])
	}
	if result.Credential != CredentialConnector || result.Note != "" {
		t.Fatalf("credential %q note %q", result.Credential, result.Note)
	}
}

func TestTrackDropsOldMergedOwnPull(t *testing.T) {
	service := newTestService(fakeGitHub(t, http.StatusOK))
	// Pull request 3 was closed 30 days ago: among the person's own, it falls out and the next one takes its place.
	result := service.Track(context.Background(), Request{})
	for _, p := range result.Pulls {
		if p.Number == 3 {
			t.Fatalf("an old merged pull request should not be listed: %+v", p)
		}
	}
	if len(result.Pulls) != Visible {
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
		fmt.Fprint(w, `{"items":[]}`)
	}))
	defer server.Close()
	service := newTestService(server)
	service.Track(context.Background(), Request{})
	service.Track(context.Background(), Request{})
	if calls != 1 {
		t.Fatalf("GitHub was asked %d times, want 1", calls)
	}
}

func TestTrackExplainsARefusedToken(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusUnauthorized) }))
	defer server.Close()
	result := newTestService(server).Track(context.Background(), Request{})
	if !strings.Contains(result.Note, "refused") {
		t.Fatalf("note %q", result.Note)
	}
}
