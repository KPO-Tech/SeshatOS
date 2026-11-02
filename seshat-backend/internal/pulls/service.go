package pulls

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"
)

const cacheTTL = 30 * time.Second

// Service builds the list of pull requests the card shows.
type Service struct {
	credential Credential
	base       string // GitHub API base, set by tests
	now        func() time.Time

	mu    sync.Mutex
	cache map[string]cached
	// created remembers when each pull request was created: it never changes, so one the agent did not open is not read again.
	created map[string]time.Time
}

type cached struct {
	at     time.Time
	result Result
}

func NewService(credential Credential) *Service {
	return &Service{credential: credential, now: time.Now, cache: map[string]cached{}, created: map[string]time.Time{}}
}

// Track answers with the pull requests the agent of the session opened, at most Visible of them: among the addresses its calls printed,
// the ones GitHub says were created during the call that printed them. The person's own are never listed: the card follows what the
// agent did. Nothing is stored beyond in-memory caches.
func (s *Service) Track(ctx context.Context, req Request) Result {
	token, source := s.credential(ctx)
	if token == "" {
		return Result{Pulls: []Pull{}, Credential: CredentialNone, Note: "Connect GitHub to follow your pull requests."}
	}
	key := cacheKey(req, source)
	s.mu.Lock()
	if hit, ok := s.cache[key]; ok && s.now().Sub(hit.at) < cacheTTL {
		s.mu.Unlock()
		return hit.result
	}
	s.mu.Unlock()

	gh := newClient(token)
	if s.base != "" {
		gh.base = s.base
	}
	result := s.build(ctx, gh, req, source)

	s.mu.Lock()
	s.cache[key] = cached{at: s.now(), result: result}
	s.mu.Unlock()
	return result
}

func (s *Service) build(ctx context.Context, gh *client, req Request, source string) Result {
	result := Result{Pulls: []Pull{}, Credential: source}
	var problem error

	// A pull request whose creation is already known and falls outside every window was only read by the agent: it is not asked again.
	var candidates []ref
	for _, c := range sessionRefs(req) {
		s.mu.Lock()
		created, known := s.created[refKey(c)]
		s.mu.Unlock()
		if known && !c.openedBy(created) {
			continue
		}
		candidates = append(candidates, c)
	}

	// Each pull request is read on its own, side by side, and the list keeps the order of the candidates (the most recent call first).
	type fetched struct {
		ref  ref
		pull apiPull
		err  error
	}
	read := make([]fetched, len(candidates))
	var wg sync.WaitGroup
	for i, c := range candidates {
		wg.Add(1)
		go func() {
			defer wg.Done()
			p, err := gh.pull(ctx, c.owner, c.repo, c.number)
			read[i] = fetched{ref: c, pull: p, err: err}
		}()
	}
	wg.Wait()

	var kept []fetched
	for _, f := range read {
		if f.err != nil {
			problem = firstError(problem, f.err)
			continue
		}
		s.mu.Lock()
		s.created[refKey(f.ref)] = f.pull.CreatedAt
		s.mu.Unlock()
		if f.ref.openedBy(f.pull.CreatedAt) && len(kept) < Visible {
			kept = append(kept, f)
		}
	}

	// The checks are read only for the pull requests that stay.
	pulls := make([]Pull, len(kept))
	denied := make([]bool, len(kept))
	for i, f := range kept {
		wg.Add(1)
		go func() {
			defer wg.Done()
			verdict, err := gh.checks(ctx, f.ref.owner, f.ref.repo, f.pull.Head.SHA)
			denied[i] = err != nil
			p := f.pull
			pulls[i] = Pull{
				Owner: f.ref.owner, Repo: f.ref.repo, Number: p.Number, Title: p.Title, URL: p.HTMLURL, State: stateOf(p),
				Additions: p.Additions, Deletions: p.Deletions, Checks: verdict, MergeableState: p.MergeableState, UpdatedAt: p.UpdatedAt,
			}
		}()
	}
	wg.Wait()

	checksDenied := false
	for i := range pulls {
		checksDenied = checksDenied || denied[i]
	}
	result.Pulls = pulls
	result.Note = noteFor(problem, checksDenied, len(result.Pulls))
	return result
}

// sessionRefs are the candidates of the request, one per pull request, each with the windows of every call that printed it.
func sessionRefs(req Request) []ref {
	var refs []ref
	index := map[string]int{}
	for _, c := range req.Candidates {
		r, ok := parsePullURL(c.URL)
		if !ok {
			continue
		}
		k := refKey(r)
		i, seen := index[k]
		if !seen {
			if len(refs) >= MaxCandidates {
				continue
			}
			i = len(refs)
			index[k] = i
			refs = append(refs, r)
		}
		if c.StartedAt == nil || c.EndedAt == nil {
			refs[i].trusted = true
		} else {
			refs[i].windows = append(refs[i].windows, window{from: *c.StartedAt, to: *c.EndedAt})
		}
	}
	return refs
}

func refKey(r ref) string { return strings.ToLower(r.owner + "/" + r.repo + "#" + itoa(r.number)) }

func cacheKey(req Request, source string) string {
	var b strings.Builder
	b.WriteString(source)
	for _, c := range req.Candidates {
		b.WriteString("|" + c.URL)
		if c.StartedAt != nil && c.EndedAt != nil {
			b.WriteString("@" + c.StartedAt.UTC().Format(time.RFC3339Nano) + "/" + c.EndedAt.UTC().Format(time.RFC3339Nano))
		}
	}
	return b.String()
}

func firstError(current, next error) error {
	if current != nil {
		return current
	}
	return next
}

func noteFor(problem error, checksDenied bool, shown int) string {
	switch {
	case errors.Is(problem, errUnauthorized):
		return "GitHub refused the token. Connect GitHub again."
	case problem != nil && shown == 0:
		return "GitHub could not be reached or the token cannot read pull requests."
	case checksDenied:
		return "The token cannot read checks. Allow Checks (read) to see the CI state."
	}
	return ""
}
