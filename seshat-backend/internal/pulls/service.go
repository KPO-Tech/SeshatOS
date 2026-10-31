package pulls

import (
	"context"
	"errors"
	"sort"
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
}

type cached struct {
	at     time.Time
	result Result
}

func NewService(credential Credential) *Service {
	return &Service{credential: credential, now: time.Now, cache: map[string]cached{}}
}

// Track answers with the pull requests of the session first, then the person's own, at most Visible of them. Closed and merged ones
// older than StaleAfter are left out. Nothing is stored beyond a short in-memory cache.
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

	candidates := s.sessionRefs(ctx, gh, req, &problem)
	seen := map[string]bool{}
	for _, c := range candidates {
		seen[refKey(c)] = true
	}
	mine, err := gh.myPulls(ctx)
	if err != nil {
		problem = firstError(problem, err)
	}
	var own []ref
	for _, item := range mine {
		owner, repo, ok := repoOfAPIURL(item.RepositoryURL)
		if !ok {
			continue
		}
		if item.State == "closed" && s.now().Sub(item.UpdatedAt) > StaleAfter {
			continue
		}
		r := ref{owner: owner, repo: repo, number: item.Number, updatedAt: item.UpdatedAt}
		if !seen[refKey(r)] {
			own = append(own, r)
		}
	}
	sort.SliceStable(own, func(i, j int) bool { return own[i].updatedAt.After(own[j].updatedAt) })
	candidates = append(candidates, own...)
	if len(candidates) > Visible {
		candidates = candidates[:Visible]
	}

	// Each pull request is fetched on its own, side by side, and the list keeps the order of the candidates.
	type fetched struct {
		pull         Pull
		err          error
		checksDenied bool
	}
	fetchedPulls := make([]fetched, len(candidates))
	var wg sync.WaitGroup
	for i, c := range candidates {
		wg.Add(1)
		go func() {
			defer wg.Done()
			p, err := gh.pull(ctx, c.owner, c.repo, c.number)
			if err != nil {
				fetchedPulls[i].err = err
				return
			}
			verdict, err := gh.checks(ctx, c.owner, c.repo, p.Head.SHA)
			fetchedPulls[i] = fetched{checksDenied: err != nil, pull: Pull{
				Owner: c.owner, Repo: c.repo, Number: p.Number, Title: p.Title, URL: p.HTMLURL, State: stateOf(p),
				Additions: p.Additions, Deletions: p.Deletions, Checks: verdict, UpdatedAt: p.UpdatedAt, FromSession: c.session,
			}}
		}()
	}
	wg.Wait()

	checksDenied := false
	for _, f := range fetchedPulls {
		if f.err != nil {
			problem = firstError(problem, f.err)
			continue
		}
		checksDenied = checksDenied || f.checksDenied
		result.Pulls = append(result.Pulls, f.pull)
	}
	result.Note = noteFor(problem, checksDenied, len(result.Pulls))
	return result
}

// sessionRefs are the pull requests of the session: the addresses its tools printed, then the ones of the branch its folder is on.
func (s *Service) sessionRefs(ctx context.Context, gh *client, req Request, problem *error) []ref {
	var refs []ref
	seen := map[string]bool{}
	add := func(r ref) {
		if k := refKey(r); !seen[k] && len(refs) < Visible {
			seen[k] = true
			refs = append(refs, r)
		}
	}
	for _, raw := range req.URLs {
		if r, ok := parsePullURL(raw); ok {
			add(r)
		}
	}
	if owner, repo, branch, ok := repoOfFolder(ctx, req.WorkspacePath); ok {
		list, err := gh.pullsOfBranch(ctx, owner, repo, branch)
		if err != nil {
			*problem = firstError(*problem, err)
		}
		for _, p := range list {
			add(ref{owner: owner, repo: repo, number: p.Number, session: true})
		}
	}
	return refs
}

func refKey(r ref) string { return strings.ToLower(r.owner + "/" + r.repo + "#" + itoa(r.number)) }

func cacheKey(req Request, source string) string {
	return source + "|" + req.WorkspacePath + "|" + strings.Join(req.URLs, ",")
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
