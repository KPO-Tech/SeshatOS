package knowledge

import (
	"context"
	"errors"
	"sort"
	"strings"
	"sync"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/KPO-Tech/seshat/pkg/rag"
)

const (
	// DefaultSearchTopK is SearchAll's result cap when TopK is unset.
	DefaultSearchTopK = 5
	// MaxSearchTopK is the largest TopK SearchAll will honor.
	MaxSearchTopK = 20
)

// TaggedSearchResult is a rag.SearchResult annotated with the corpus it
// came from - context rag.SearchResponse doesn't carry on its own, since a
// single response is always scoped to one corpus, and that context would
// otherwise be lost once results from several corpora are merged together.
type TaggedSearchResult struct {
	rag.SearchResult
	CorpusID   string `json:"corpus_id"`
	CorpusName string `json:"corpus_name"`
}

// SearchAllParams configures SearchAll.
type SearchAllParams struct {
	Query string
	// TopK caps the merged result count (not per-corpus). Clamped to
	// [1, MaxSearchTopK], defaulting to DefaultSearchTopK when out of range.
	TopK int
	// CorpusID restricts the search to a single corpus instead of every
	// corpus the principal can access.
	CorpusID string
}

// SearchAllResult is SearchAll's return value.
type SearchAllResult struct {
	Results         []TaggedSearchResult `json:"results"`
	CorporaSearched int                  `json:"corpora_searched"`
}

// SearchAll searches every corpus the principal can access (or just
// CorpusID, if set) concurrently, merges the results, sorts them by score
// descending, and trims to TopK.
//
// Shared by internal/knowledge/tool's agent-facing knowledge_search tool and
// internal/api's raw cross-corpus search endpoint, so both surfaces rank
// results identically - the tool answers with citations drawn from exactly
// what the raw-results panel already showed the user.
func SearchAll(ctx context.Context, principal *backendauth.Principal, backend Backend, params SearchAllParams) (*SearchAllResult, error) {
	query := strings.TrimSpace(params.Query)
	if query == "" {
		return nil, errors.New("query is required")
	}

	topK := params.TopK
	if topK < 1 || topK > MaxSearchTopK {
		topK = DefaultSearchTopK
	}

	var corpora []Corpus
	if id := strings.TrimSpace(params.CorpusID); id != "" {
		c, err := backend.GetCorpus(ctx, principal, id)
		if err != nil {
			return nil, err
		}
		corpora = []Corpus{*c}
	} else {
		var err error
		corpora, err = backend.ListCorpora(ctx, principal)
		if err != nil {
			return nil, err
		}
	}
	if len(corpora) == 0 {
		return &SearchAllResult{}, nil
	}

	// Search corpora concurrently - each is an independent request against
	// the (local or remote) backend, and a principal can have many corpora.
	var (
		wg      sync.WaitGroup
		mu      sync.Mutex
		merged  []TaggedSearchResult
		lastErr error
		hits    int
	)
	for _, corpus := range corpora {
		wg.Add(1)
		go func(c Corpus) {
			defer wg.Done()
			resp, err := backend.Search(ctx, principal, SearchParams{
				CorpusID: c.ID,
				Query:    query,
				TopK:     topK,
			})
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				lastErr = err
				return
			}
			hits++
			for _, r := range resp.Results {
				merged = append(merged, TaggedSearchResult{SearchResult: r, CorpusID: c.ID, CorpusName: c.Name})
			}
		}(corpus)
	}
	wg.Wait()

	// A corpus failing to search (e.g. a transient remote error) shouldn't
	// sink the whole call as long as at least one other corpus succeeded -
	// only surface an error when every corpus failed.
	if hits == 0 && lastErr != nil {
		return nil, lastErr
	}

	sort.Slice(merged, func(i, j int) bool { return merged[i].Score > merged[j].Score })
	merged = dedupeTaggedSearchResults(merged)
	if len(merged) > topK {
		merged = merged[:topK]
	}

	return &SearchAllResult{Results: merged, CorporaSearched: len(corpora)}, nil
}

// dedupeTaggedSearchResults drops exact-duplicate hits (same chunk text
// verbatim, after trimming) from a merged cross-corpus search, keeping the
// first (highest-scoring, since merged is already sorted) occurrence. Each
// per-corpus Search call already dedupes within its own corpus, but the
// same source document can legitimately be ingested into more than one
// corpus a principal has access to (e.g. a shared policy doc attached to
// both a "Legal" and an "Onboarding" corpus) - without this, merging their
// results surfaces the same sentence twice, once per corpus.
func dedupeTaggedSearchResults(results []TaggedSearchResult) []TaggedSearchResult {
	if len(results) < 2 {
		return results
	}
	seen := make(map[string]struct{}, len(results))
	deduped := make([]TaggedSearchResult, 0, len(results))
	for _, r := range results {
		key := strings.TrimSpace(r.Text)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		deduped = append(deduped, r)
	}
	return deduped
}
