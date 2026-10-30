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

func (f *fakeBackend) ListFiles(_ context.Context, _ *backendauth.Principal, _ string) ([]knowledge.CorpusFile, error) {
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

func TestSearchTool_Call_ASearchLimitedToACollectionStaysInIt(t *testing.T) {
	backend := &fakeBackend{
		corpora: []knowledge.Corpus{{ID: "legal", Name: "Legal"}, {ID: "people", Name: "People"}},
		results: map[string]*rag.SearchResponse{
			"legal":  {CorpusID: "legal", Results: []rag.SearchResult{{Key: "l1", Text: "sixty days", Score: 0.9}}},
			"people": {CorpusID: "people", Results: []rag.SearchResult{{Key: "p1", Text: "three days a week", Score: 0.95}}},
		},
	}
	ctx := knowledge.WithScope(principalCtx(), "legal")

	// The model asks for the other collection, and for all of them: the person's choice wins.
	for _, input := range []map[string]any{
		{"query": "days", "corpus_id": "people"},
		{"query": "days"},
	} {
		result, err := NewSearchTool(backend).Call(ctx, tools.CallInput{Parsed: input}, nil)
		if err != nil || result.Error != nil {
			t.Fatalf("Call: %v %v", err, result.Error)
		}
		if !strings.Contains(result.Content, "sixty days") || strings.Contains(result.Content, "three days a week") {
			t.Errorf("a search limited to Legal must return only Legal excerpts, got:\n%s", result.Content)
		}
	}
}

func TestSearchTool_Call_NothingFoundInTheChosenCollectionIsNotNothingInTheOrganization(t *testing.T) {
	backend := &fakeBackend{corpora: []knowledge.Corpus{{ID: "legal", Name: "Legal"}}}
	result, err := NewSearchTool(backend).Call(knowledge.WithScope(principalCtx(), "legal"), tools.CallInput{Parsed: map[string]any{"query": "holidays"}}, nil)
	if err != nil || result.Error != nil {
		t.Fatalf("Call: %v %v", err, result.Error)
	}
	for _, want := range []string{"collection the person chose", "do not conclude"} {
		if !strings.Contains(result.Content, want) {
			t.Errorf("expected %q in:\n%s", want, result.Content)
		}
	}
}

func TestRef(t *testing.T) {
	first, again := Ref("c1", "k"), Ref("c1", "k")
	if first != again {
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

func TestSearchTool_Call_SaysWhichFileEachExcerptComesFrom(t *testing.T) {
	backend := &fakeBackend{
		corpora: []knowledge.Corpus{{ID: "c1", Name: "Legal"}},
		results: map[string]*rag.SearchResponse{
			"c1": {CorpusID: "c1", Results: []rag.SearchResult{
				{Key: "rag/c1/file-9#chunk-3", Text: "sixty days", Score: 0.9},
				{Key: "odd-key", Text: "thirty days", Score: 0.7},
			}},
		},
	}
	result, err := NewSearchTool(backend).Call(principalCtx(), tools.CallInput{Parsed: map[string]any{"query": "notice"}}, nil)
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	sources, ok := result.Metadata.Additional["passages"].([]passageSource)
	if !ok || len(sources) != 2 {
		t.Fatalf("expected 2 passage sources in the metadata, got %+v", result.Metadata.Additional["passages"])
	}
	if want := (passageSource{Ref: Ref("c1", "rag/c1/file-9#chunk-3"), CorpusID: "c1", FileID: "file-9"}); sources[0] != want {
		t.Errorf("first source = %+v, want %+v", sources[0], want)
	}
	if sources[1].FileID != "" || sources[1].CorpusID != "c1" {
		t.Errorf("a key of another shape names no file but keeps its collection, got %+v", sources[1])
	}
	if strings.Contains(result.Content, "file-9") {
		t.Errorf("the file id is for the interface, not for the model, but the text has it:\n%s", result.Content)
	}
}

func TestSearchTool_Call_NamesTheDocumentWhenTheChunkKeptNoName(t *testing.T) {
	backend := &readBackend{
		fakeBackend: fakeBackend{
			corpora: []knowledge.Corpus{{ID: "c1", Name: "Operations and Procurement"}},
			results: map[string]*rag.SearchResponse{
				"c1": {CorpusID: "c1", Results: []rag.SearchResult{
					{Key: "rag/c1/f9#chunk-3", Text: "gloves", Score: 0.9, Metadata: map[string]string{"page_numbers": "[24]"}},
					{Key: "rag/c1/unknown#chunk-0", Text: "other", Score: 0.5},
				}},
			},
		},
		files: map[string][]knowledge.CorpusFile{"c1": {{CorpusID: "c1", FileID: "f9", Filename: "OSHA-3151-ppe.pdf"}}},
	}
	result, err := NewSearchTool(backend).Call(principalCtx(), tools.CallInput{Parsed: map[string]any{"query": "gloves"}}, nil)
	if err != nil || result.Error != nil {
		t.Fatalf("Call: %v %v", err, result.Error)
	}
	if !strings.Contains(result.Content, "corpus=Operations and Procurement file=OSHA-3151-ppe.pdf pages=24") {
		t.Errorf("the excerpt should carry the name of its document, got:\n%s", result.Content)
	}
	if strings.Count(result.Content, "file=") != 1 {
		t.Errorf("a file that cannot be found must not get a name, got:\n%s", result.Content)
	}
}
