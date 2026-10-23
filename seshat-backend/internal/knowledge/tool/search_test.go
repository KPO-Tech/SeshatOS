package tool

import (
	"context"
	"strings"
	"testing"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
	"github.com/KPO-Tech/seshat-runtime/pkg/rag"
	"github.com/KPO-Tech/seshat-runtime/pkg/tools"
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

func TestSearchTool_Call_GivesEachExcerptARefAndItsPages(t *testing.T) {
	backend := &fakeBackend{
		corpora: []knowledge.Corpus{{ID: "c1", Name: "Legal"}},
		results: map[string]*rag.SearchResponse{
			"c1": {CorpusID: "c1", Results: []rag.SearchResult{
				{Key: "c1-a", Text: "sixty days", Score: 0.9, Metadata: map[string]string{"filename": "template.docx", "page_numbers": "[12]", "heading_path": "Termination"}},
				{Key: "c1-b", Text: "thirty days", Score: 0.7, Metadata: map[string]string{"filename": "framework.pdf"}},
			}},
		},
	}
	result, err := NewSearchTool(backend).Call(principalCtx(), tools.CallInput{Parsed: map[string]any{"query": "notice"}}, nil)
	if err != nil || result.Error != nil {
		t.Fatalf("Call: %v %v", err, result.Error)
	}
	first := "ref=" + Ref("c1", "c1-a")
	second := "ref=" + Ref("c1", "c1-b")
	for _, want := range []string{first, second, "pages=12", `section="Termination"`} {
		if !strings.Contains(result.Content, want) {
			t.Errorf("expected %q in:\n%s", want, result.Content)
		}
	}
	if strings.Count(result.Content, "pages=") != 1 {
		t.Errorf("an excerpt without pages must not show any:\n%s", result.Content)
	}
}

func TestRef(t *testing.T) {
	if Ref("c1", "k") != Ref("c1", "k") {
		t.Fatal("a ref must be the same every time")
	}
	if Ref("c1", "k") == Ref("c2", "k") || Ref("c1", "k") == Ref("c1", "j") {
		t.Fatal("two excerpts must not share a ref")
	}
	if got := Ref("c1", "k"); len(got) != 7 || got[0] != 'k' {
		t.Fatalf("a ref is k and six hexadecimal digits, got %q", got)
	}
}

var _ tools.Tool = (*SearchTool)(nil)
