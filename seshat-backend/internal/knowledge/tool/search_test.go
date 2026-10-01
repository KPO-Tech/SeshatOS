package tool

import (
	"context"
	"strings"
	"testing"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
	"github.com/KPO-Tech/seshat/pkg/rag"
	"github.com/KPO-Tech/seshat/pkg/tools"
)

// fakeBackend is a minimal knowledge.Backend stub - the merge/sort/trim
// behavior itself is exercised directly against knowledge.SearchAll (see
// internal/knowledge/search_all_test.go); these tests only cover what's
// specific to the tool wrapper: principal resolution and result formatting.
type fakeBackend struct {
	knowledge.Backend

	corpora []knowledge.Corpus
	results map[string]*rag.SearchResponse
}

func (f *fakeBackend) ListCorpora(_ context.Context, _ *backendauth.Principal) ([]knowledge.Corpus, error) {
	return f.corpora, nil
}

func (f *fakeBackend) GetCorpus(_ context.Context, _ *backendauth.Principal, corpusID string) (*knowledge.Corpus, error) {
	for _, c := range f.corpora {
		if c.ID == corpusID {
			return &c, nil
		}
	}
	return nil, nil
}

func (f *fakeBackend) Search(_ context.Context, _ *backendauth.Principal, params knowledge.SearchParams) (*rag.SearchResponse, error) {
	if resp, ok := f.results[params.CorpusID]; ok {
		return resp, nil
	}
	return &rag.SearchResponse{CorpusID: params.CorpusID}, nil
}

func principalCtx() context.Context {
	return backendauth.WithContext(context.Background(), &backendauth.Principal{
		User: backendauth.User{ID: "user-1"},
	})
}

func TestSearchTool_Call_NoPrincipalInContext(t *testing.T) {
	tool := NewSearchTool(&fakeBackend{})
	result, err := tool.Call(context.Background(), tools.CallInput{
		Parsed: map[string]any{"query": "invoices"},
	}, nil)
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	if result.Error == nil {
		t.Fatalf("expected an error result when no principal is in context, got %+v", result)
	}
}

func TestSearchTool_Call_EmptyQueryIsRejected(t *testing.T) {
	tool := NewSearchTool(&fakeBackend{})
	result, err := tool.Call(principalCtx(), tools.CallInput{
		Parsed: map[string]any{"query": "   "},
	}, nil)
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	if result.Error == nil {
		t.Fatalf("expected an error result for a blank query, got %+v", result)
	}
}

func TestSearchTool_Call_NoCorporaAvailable(t *testing.T) {
	tool := NewSearchTool(&fakeBackend{corpora: nil})
	result, err := tool.Call(principalCtx(), tools.CallInput{
		Parsed: map[string]any{"query": "invoices"},
	}, nil)
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	if result.Error != nil {
		t.Fatalf("expected a plain informational text result, got error: %v", result.Error)
	}
}

func TestSearchTool_Call_FormatsResultsWithCorpusAndFileTags(t *testing.T) {
	backend := &fakeBackend{
		corpora: []knowledge.Corpus{{ID: "c1", Name: "Corpus One"}},
		results: map[string]*rag.SearchResponse{
			"c1": {CorpusID: "c1", Results: []rag.SearchResult{
				{Key: "c1-a", Text: "hit text", Score: 0.8, Metadata: map[string]string{"filename": "readme.md"}},
			}},
		},
	}
	tool := NewSearchTool(backend)

	result, err := tool.Call(principalCtx(), tools.CallInput{
		Parsed: map[string]any{"query": "invoices"},
	}, nil)
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	if result.Error != nil {
		t.Fatalf("unexpected error result: %v", result.Error)
	}
	results, ok := result.Data.([]knowledge.TaggedSearchResult)
	if !ok || len(results) != 1 {
		t.Fatalf("expected 1 tagged result, got %+v (%T)", result.Data, result.Data)
	}
	if results[0].CorpusName != "Corpus One" {
		t.Errorf("expected corpus name propagated, got %+v", results[0])
	}
	wantContains := []string{"corpus=Corpus One", "file=readme.md", "hit text"}
	for _, want := range wantContains {
		if !strings.Contains(result.Content, want) {
			t.Errorf("expected formatted content to contain %q, got:\n%s", want, result.Content)
		}
	}
}

var _ tools.Tool = (*SearchTool)(nil)
