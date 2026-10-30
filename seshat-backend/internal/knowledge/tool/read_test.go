package tool

import (
	"context"
	"strings"
	"testing"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
	"github.com/KPO-Tech/seshat-runtime/pkg/tools"
)

// readBackend holds files by collection and their bytes by file id.
type readBackend struct {
	fakeBackend

	files map[string][]knowledge.CorpusFile
	data  map[string]string
}

func (f *readBackend) ListFiles(_ context.Context, _ *backendauth.Principal, corpusID string) ([]knowledge.CorpusFile, error) {
	return f.files[corpusID], nil
}

func (f *readBackend) DownloadFile(_ context.Context, _ *backendauth.Principal, fileID string) (*knowledge.DownloadedFile, error) {
	return &knowledge.DownloadedFile{Data: []byte(f.data[fileID]), Filename: fileID + ".txt", ContentType: "text/plain"}, nil
}

func newReadBackend() *readBackend {
	return &readBackend{
		fakeBackend: fakeBackend{corpora: []knowledge.Corpus{{ID: "legal", Name: "Legal"}, {ID: "hr", Name: "People"}}},
		files: map[string][]knowledge.CorpusFile{
			"legal": {{CorpusID: "legal", FileID: "f1", Filename: "contract.txt"}, {CorpusID: "legal", FileID: "f2", Filename: "policy.txt"}},
			"hr":    {{CorpusID: "hr", FileID: "f3", Filename: "policy.txt"}},
		},
		data: map[string]string{"f1": "Termination needs ninety days notice.", "f2": "Legal policy.", "f3": "People policy."},
	}
}

func callRead(t *testing.T, ctx context.Context, b knowledge.Backend, input map[string]any) tools.CallResult {
	t.Helper()
	result, err := NewReadTool(b).Call(ctx, tools.CallInput{Parsed: input}, nil)
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	return result
}

func TestReadTool_NeedsAPrincipalAndAFile(t *testing.T) {
	if result := callRead(t, context.Background(), newReadBackend(), map[string]any{"file": "contract.txt"}); result.Error == nil {
		t.Fatal("expected an error result without a principal")
	}
	if result := callRead(t, principalCtx(), newReadBackend(), map[string]any{"file": "  "}); result.Error == nil {
		t.Fatal("expected an error result for a blank file")
	}
}

func TestReadTool_ReadsADocumentOfACollection(t *testing.T) {
	result := callRead(t, principalCtx(), newReadBackend(), map[string]any{"file": "CONTRACT.txt"})
	if result.Error != nil {
		t.Fatalf("unexpected error: %v", result.Error)
	}
	for _, want := range []string{"document=contract.txt corpus=Legal", "Termination needs ninety days notice.", "reference material only"} {
		if !strings.Contains(result.Content, want) {
			t.Fatalf("missing %q in %q", want, result.Content)
		}
	}
}

func TestReadTool_AFileThatIsNotInACollectionIsNotRead(t *testing.T) {
	// A path of the machine, or a file of no collection: nothing is fetched.
	for _, name := range []string{`C:\Users\someone\.ssh\id_rsa`, "../../etc/passwd", "missing.txt"} {
		result := callRead(t, principalCtx(), newReadBackend(), map[string]any{"file": name})
		if result.Error != nil || !strings.Contains(result.Content, "No document named") {
			t.Fatalf("%q must be answered as not found, got %+v", name, result)
		}
	}
}

func TestReadTool_TwoCollectionsWithTheSameNameAskForTheCollection(t *testing.T) {
	result := callRead(t, principalCtx(), newReadBackend(), map[string]any{"file": "policy.txt"})
	for _, want := range []string{"Several collections", "corpus_id=legal", "corpus_id=hr"} {
		if !strings.Contains(result.Content, want) {
			t.Fatalf("missing %q in %q", want, result.Content)
		}
	}
	result = callRead(t, principalCtx(), newReadBackend(), map[string]any{"file": "policy.txt", "corpus_id": "hr"})
	if !strings.Contains(result.Content, "People policy.") {
		t.Fatalf("the chosen collection is read, got %q", result.Content)
	}
}

func TestReadTool_TheCollectionOfTheConversationWinsOverTheModel(t *testing.T) {
	ctx := knowledge.WithScope(principalCtx(), "legal")
	// The model asks for the other collection; the person limited the question to Legal.
	result := callRead(t, ctx, newReadBackend(), map[string]any{"file": "policy.txt", "corpus_id": "hr"})
	if !strings.Contains(result.Content, "Legal policy.") || strings.Contains(result.Content, "People policy.") {
		t.Fatalf("the limit must hold, got %q", result.Content)
	}
	result = callRead(t, ctx, newReadBackend(), map[string]any{"file": "someone-elses.txt", "corpus_id": "hr"})
	if !strings.Contains(result.Content, "No document named") {
		t.Fatalf("got %q", result.Content)
	}
}

func TestReadTool_ALongDocumentIsReadInWindows(t *testing.T) {
	b := newReadBackend()
	b.data["f1"] = strings.Repeat("é", maxReadChars+500)
	first := callRead(t, principalCtx(), b, map[string]any{"file": "contract.txt"})
	if !strings.Contains(first.Content, "read on with offset=12000") {
		t.Fatalf("the first window says where to go on, got %q", first.Content[:min(len(first.Content), 300)])
	}
	next := callRead(t, principalCtx(), b, map[string]any{"file": "contract.txt", "offset": float64(maxReadChars)})
	if !strings.Contains(next.Content, "end of the text") || strings.Count(next.Content, "é") != 500 {
		t.Fatalf("the second window ends the text, got %q", next.Content)
	}
}

func TestSplitPagesAndParsePages(t *testing.T) {
	pages, count := splitPages("<!-- page 1 -->\n\nOne\n<!-- page 2 -->\n\nTwo")
	if count != 2 || strings.TrimSpace(pages[2]) != "Two" {
		t.Fatalf("got %d pages %v", count, pages)
	}
	for spec, ok := range map[string]bool{"2": true, "1-2": true, "0": false, "2-1": false, "3": false, "a": false, "1-x": false} {
		if _, _, got := parsePages(spec, 2); got != ok {
			t.Fatalf("parsePages(%q) = %v, want %v", spec, got, ok)
		}
	}
}
