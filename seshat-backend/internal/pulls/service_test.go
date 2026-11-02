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

func TestChainCredentialPrefersConnector(t *testing.T) {
	token, source := ChainCredential(func(context.Context) (string, bool) { return " abc ", true })(context.Background())
	if token != "abc" || source != CredentialConnector {
		t.Fatalf("got %q from %q", token, source)
	}
}

// fakeGitHub answers the few routes the service calls.
// createdBase is the instant the fake pull requests are created from: pull request n was created n hours before it.
var createdBase = time.Date(2026, 11, 2, 12, 0, 0, 0, time.UTC)

func createdAt(number int) time.Time { return createdBase.Add(-time.Duration(number) * time.Hour) }

// trusted is a request whose addresses come without a window, as from a runtime that does not time its calls.
func trusted(urls ...string) Request {
	var req Request
	for _, u := range urls {
		req.Candidates = append(req.Candidates, Candidate{URL: u})
	}
	return req
}

// during is a candidate printed by a call that ran from `from` for `length`.
func during(url string, from time.Time, length time.Duration) Candidate {
	to := from.Add(length)
	return Candidate{URL: url, StartedAt: &from, EndedAt: &to}
}

func fakeGitHub(t *testing.T, checksStatus int) *httptest.Server {
	t.Helper()
	now := time.Now().UTC()
	pull := func(number int, state string, merged bool, updated time.Time) string {
		return fmt.Sprintf(`{"number":%d,"title":"PR %d","html_url":"https://github.com/o/r/pull/%d","state":%q,"draft":false,"merged":%t,"mergeable_state":"clean","additions":3,"deletions":1,"created_at":%q,"updated_at":%q,"head":{"sha":"sha%d"}}`,
			number, number, number, state, merged, createdAt(number).Format(time.RFC3339), updated.Format(time.RFC3339), number)
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
	result := service.Track(context.Background(), trusted("https://github.com/o/r/pull/99", "https://github.com/o/r/pull/7"))

	// The addresses the session printed, in their order; a closed one is kept because the session worked on it.
	if len(result.Pulls) != 2 || result.Pulls[0].Number != 99 || result.Pulls[1].Number != 7 {
		t.Fatalf("want the two pull requests of the session, got %+v", result.Pulls)
	}
	if result.Pulls[0].State != StateClosed {
		t.Fatalf("state: %q", result.Pulls[0].State)
	}
	if result.Pulls[1].MergeableState != "clean" {
		t.Fatalf("mergeable state: %q", result.Pulls[1].MergeableState)
	}
	if result.Credential != CredentialConnector || result.Note != "" {
		t.Fatalf("credential %q note %q", result.Credential, result.Note)
	}
}

func TestTrackShowsNothingForASessionWithoutPulls(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++ }))
	defer server.Close()
	// The agent opened no pull request: the person's own are not listed, and GitHub is not asked.
	result := newTestService(server).Track(context.Background(), Request{})
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
	if result := service.Track(context.Background(), trusted(urls...)); len(result.Pulls) != Visible {
		t.Fatalf("want %d, got %d", Visible, len(result.Pulls))
	}
}

func TestTrackChecksVerdict(t *testing.T) {
	service := newTestService(fakeGitHub(t, http.StatusOK))
	result := service.Track(context.Background(), trusted("https://github.com/o/r/pull/2", "https://github.com/o/r/pull/4"))
	if result.Pulls[0].Checks != ChecksFailing || result.Pulls[1].Checks != ChecksPassing {
		t.Fatalf("checks: %s, %s", result.Pulls[0].Checks, result.Pulls[1].Checks)
	}
}

func TestTrackTellsWhenChecksCannotBeRead(t *testing.T) {
	service := newTestService(fakeGitHub(t, http.StatusForbidden))
	result := service.Track(context.Background(), trusted("https://github.com/o/r/pull/2"))
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
	request := trusted("https://github.com/o/r/pull/1")
	service.Track(context.Background(), request)
	service.Track(context.Background(), request)
	if calls != 1 {
		t.Fatalf("GitHub was asked %d times, want 1", calls)
	}
}

func TestTrackExplainsARefusedToken(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusUnauthorized) }))
	defer server.Close()
	result := newTestService(server).Track(context.Background(), trusted("https://github.com/o/r/pull/1"))
	if !strings.Contains(result.Note, "refused") {
		t.Fatalf("note %q", result.Note)
	}
}

func TestTrackKeepsAPullCreatedDuringTheCallThatPrintedIt(t *testing.T) {
	service := newTestService(fakeGitHub(t, http.StatusOK))
	url := "https://github.com/o/r/pull/5"
	// Created five hours before the base: a call running then opened it.
	result := service.Track(context.Background(), Request{Candidates: []Candidate{during(url, createdAt(5).Add(-10*time.Second), 20*time.Second)}})
	if len(result.Pulls) != 1 || result.Pulls[0].Number != 5 {
		t.Fatalf("want the pull request the call opened, got %+v", result.Pulls)
	}
}

func TestTrackLeavesOutAPullTheCallOnlyRead(t *testing.T) {
	service := newTestService(fakeGitHub(t, http.StatusOK))
	// A gh pr list an hour after: it printed the address, but the pull request already existed.
	result := service.Track(context.Background(), Request{Candidates: []Candidate{during("https://github.com/o/r/pull/5", createdAt(4), 5*time.Second)}})
	if len(result.Pulls) != 0 {
		t.Fatalf("a pull request the agent only read was listed: %+v", result.Pulls)
	}
}

func TestTrackKeepsAPullWhenOneOfItsCallsOpenedIt(t *testing.T) {
	service := newTestService(fakeGitHub(t, http.StatusOK))
	url := "https://github.com/o/r/pull/5"
	// Viewed later (most recent first), created by an earlier call.
	result := service.Track(context.Background(), Request{Candidates: []Candidate{
		during(url, createdAt(3), 5*time.Second),
		during(url, createdAt(5).Add(-5*time.Second), 10*time.Second),
	}})
	if len(result.Pulls) != 1 {
		t.Fatalf("want the pull request once, got %+v", result.Pulls)
	}
}

func TestTrackAllowsTheClockSkewAroundTheCall(t *testing.T) {
	service := newTestService(fakeGitHub(t, http.StatusOK))
	// GitHub's clock is a minute behind: created_at falls just before the call started.
	result := service.Track(context.Background(), Request{Candidates: []Candidate{during("https://github.com/o/r/pull/5", createdAt(5).Add(time.Minute), 5*time.Second)}})
	if len(result.Pulls) != 1 {
		t.Fatalf("a minute of skew should not hide the pull request, got %+v", result.Pulls)
	}
}

func TestTrackDoesNotReadAgainAPullItLeftOut(t *testing.T) {
	reads := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/pulls/") {
			reads++
		}
		fmt.Fprintf(w, `{"number":5,"title":"PR 5","html_url":"https://github.com/o/r/pull/5","state":"open","created_at":%q,"head":{"sha":"s"}}`, createdAt(5).Format(time.RFC3339))
	}))
	defer server.Close()
	service := newTestService(server)
	url := "https://github.com/o/r/pull/5"
	service.Track(context.Background(), Request{Candidates: []Candidate{during(url, createdAt(4), time.Second)}})
	// Another call printed it later: a new request, but when it was created is known and nothing needs reading.
	service.Track(context.Background(), Request{Candidates: []Candidate{during(url, createdAt(3), time.Second)}})
	if reads != 1 {
		t.Fatalf("the pull request was read %d times, want 1", reads)
	}
}
