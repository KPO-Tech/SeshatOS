package knowledge

import (
	"context"
	"errors"
	"testing"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/seshat/pkg/rag"
)

// fakeBackend is a minimal Backend stub for exercising SearchAll without a
// real store - only ListCorpora/GetCorpus/Search are used, so everything
// else panics if called.
type fakeBackend struct {
	Backend

	corpora    []Corpus
	listErr    error
	results    map[string]*rag.SearchResponse // corpusID -> response
	searchErrs map[string]error               // corpusID -> error
}

func (f *fakeBackend) ListCorpora(_ context.Context, _ *backendauth.Principal) ([]Corpus, error) {
	if f.listErr != nil {
		return nil, f.listErr
	}
	return f.corpora, nil
}

func (f *fakeBackend) GetCorpus(_ context.Context, _ *backendauth.Principal, corpusID string) (*Corpus, error) {
	for _, c := range f.corpora {
		if c.ID == corpusID {
			return &c, nil
		}
	}
	return nil, errors.New("corpus not found")
}

func (f *fakeBackend) Search(_ context.Context, _ *backendauth.Principal, params SearchParams) (*rag.SearchResponse, error) {
	if err, ok := f.searchErrs[params.CorpusID]; ok {
		return nil, err
	}
	if resp, ok := f.results[params.CorpusID]; ok {
		return resp, nil
	}
	return &rag.SearchResponse{CorpusID: params.CorpusID}, nil
}

func TestSearchAll_MergesSortsAndTrimsAcrossCorpora(t *testing.T) {
	backend := &fakeBackend{
		corpora: []Corpus{
			{ID: "c1", Name: "Corpus One"},
			{ID: "c2", Name: "Corpus Two"},
		},
		results: map[string]*rag.SearchResponse{
			"c1": {CorpusID: "c1", Results: []rag.SearchResult{
				{Key: "c1-a", Text: "low score", Score: 0.2},
				{Key: "c1-b", Text: "high score", Score: 0.9},
			}},
			"c2": {CorpusID: "c2", Results: []rag.SearchResult{
				{Key: "c2-a", Text: "mid score", Score: 0.5},
			}},
		},
	}

	res, err := SearchAll(context.Background(), nil, backend, SearchAllParams{Query: "invoices", TopK: 2})
	if err != nil {
		t.Fatalf("SearchAll: %v", err)
	}
	if len(res.Results) != 2 {
		t.Fatalf("expected top_k=2 results, got %d", len(res.Results))
	}
	if res.Results[0].Key != "c1-b" || res.Results[0].CorpusID != "c1" {
		t.Errorf("expected highest-score result first (c1-b), got %+v", res.Results[0])
	}
	if res.Results[1].Key != "c2-a" {
		t.Errorf("expected second-highest result (c2-a) second, got %+v", res.Results[1])
	}
	if res.CorporaSearched != 2 {
		t.Errorf("expected CorporaSearched=2, got %d", res.CorporaSearched)
	}
}

// TestSearchAll_DedupesIdenticalTextAcrossCorpora is the regression test
// for the cross-corpus dedup gap: the same source document can legitimately
// be ingested into more than one corpus a principal has access to, and
// merging their results used to surface the same chunk text twice, once
// per corpus, instead of once at its highest score.
func TestSearchAll_DedupesIdenticalTextAcrossCorpora(t *testing.T) {
	backend := &fakeBackend{
		corpora: []Corpus{
			{ID: "c1", Name: "Legal"},
			{ID: "c2", Name: "Onboarding"},
		},
		results: map[string]*rag.SearchResponse{
			"c1": {CorpusID: "c1", Results: []rag.SearchResult{
				{Key: "c1-a", Text: "shared policy text", Score: 0.9},
			}},
			"c2": {CorpusID: "c2", Results: []rag.SearchResult{
				{Key: "c2-a", Text: "shared policy text", Score: 0.6},
				{Key: "c2-b", Text: "onboarding-only text", Score: 0.4},
			}},
		},
	}

	res, err := SearchAll(context.Background(), nil, backend, SearchAllParams{Query: "policy", TopK: 10})
	if err != nil {
		t.Fatalf("SearchAll: %v", err)
	}
	if len(res.Results) != 2 {
		t.Fatalf("expected the duplicate to be dropped (2 distinct results), got %d: %+v", len(res.Results), res.Results)
	}
	if res.Results[0].Key != "c1-a" {
		t.Errorf("expected the higher-scoring copy (c1-a) to survive, got %+v", res.Results[0])
	}
	if res.Results[1].Key != "c2-b" {
		t.Errorf("expected the distinct result (c2-b) to survive, got %+v", res.Results[1])
	}
}

func TestSearchAll_ScopedToSingleCorpus(t *testing.T) {
	backend := &fakeBackend{
		corpora: []Corpus{
			{ID: "c1", Name: "Corpus One"},
			{ID: "c2", Name: "Corpus Two"},
		},
		results: map[string]*rag.SearchResponse{
			"c1": {CorpusID: "c1", Results: []rag.SearchResult{{Key: "c1-a", Text: "hit", Score: 0.7}}},
			"c2": {CorpusID: "c2", Results: []rag.SearchResult{{Key: "c2-a", Text: "should not appear", Score: 0.99}}},
		},
	}

	res, err := SearchAll(context.Background(), nil, backend, SearchAllParams{Query: "invoices", CorpusID: "c1"})
	if err != nil {
		t.Fatalf("SearchAll: %v", err)
	}
	if len(res.Results) != 1 || res.Results[0].Key != "c1-a" {
		t.Fatalf("expected only c1's result, got %+v", res.Results)
	}
}

func TestSearchAll_OneCorpusFailingDoesNotSinkTheWholeCall(t *testing.T) {
	backend := &fakeBackend{
		corpora: []Corpus{
			{ID: "c1", Name: "Corpus One"},
			{ID: "c2", Name: "Corpus Two"},
		},
		results: map[string]*rag.SearchResponse{
			"c1": {CorpusID: "c1", Results: []rag.SearchResult{{Key: "c1-a", Text: "hit", Score: 0.7}}},
		},
		searchErrs: map[string]error{"c2": errors.New("boom")},
	}

	res, err := SearchAll(context.Background(), nil, backend, SearchAllParams{Query: "invoices"})
	if err != nil {
		t.Fatalf("SearchAll: %v", err)
	}
	if len(res.Results) != 1 || res.Results[0].Key != "c1-a" {
		t.Fatalf("expected the surviving corpus's result, got %+v", res.Results)
	}
}

func TestSearchAll_AllCorporaFailingReturnsError(t *testing.T) {
	backend := &fakeBackend{
		corpora:    []Corpus{{ID: "c1", Name: "Corpus One"}},
		searchErrs: map[string]error{"c1": errors.New("boom")},
	}

	if _, err := SearchAll(context.Background(), nil, backend, SearchAllParams{Query: "invoices"}); err == nil {
		t.Fatal("expected an error when every corpus search fails")
	}
}

func TestSearchAll_EmptyQueryIsRejected(t *testing.T) {
	if _, err := SearchAll(context.Background(), nil, &fakeBackend{}, SearchAllParams{Query: "   "}); err == nil {
		t.Fatal("expected an error for a blank query")
	}
}

func TestSearchAll_NoCorporaAvailable(t *testing.T) {
	res, err := SearchAll(context.Background(), nil, &fakeBackend{corpora: nil}, SearchAllParams{Query: "invoices"})
	if err != nil {
		t.Fatalf("SearchAll: %v", err)
	}
	if len(res.Results) != 0 || res.CorporaSearched != 0 {
		t.Fatalf("expected an empty result, got %+v", res)
	}
}
