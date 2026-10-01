package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/knowledge"
	"github.com/KPO-Tech/seshat/pkg/rag"
)

// stubKnowledgeBackend implements knowledge.Backend with only DownloadFile
// doing real work - a minimal double for the one code path this test
// exercises (internal/api/files.go's local-miss fallback), not a full fake
// of the connected-mode client.
type stubKnowledgeBackend struct {
	downloadedFileID string
	downloaded       *knowledge.DownloadedFile
}

func (s *stubKnowledgeBackend) DownloadFile(_ context.Context, _ *backendauth.Principal, fileID string) (*knowledge.DownloadedFile, error) {
	if fileID != s.downloadedFileID {
		return nil, bkerr.NotFound("file not found", nil)
	}
	return s.downloaded, nil
}

func (s *stubKnowledgeBackend) CreateCorpus(context.Context, *backendauth.Principal, knowledge.CreateCorpusParams) (*knowledge.Corpus, error) {
	return nil, errors.New("not implemented in stub")
}
func (s *stubKnowledgeBackend) GetCorpus(context.Context, *backendauth.Principal, string) (*knowledge.Corpus, error) {
	return nil, errors.New("not implemented in stub")
}
func (s *stubKnowledgeBackend) ListCorpora(context.Context, *backendauth.Principal) ([]knowledge.Corpus, error) {
	return nil, errors.New("not implemented in stub")
}
func (s *stubKnowledgeBackend) UpdateCorpus(context.Context, *backendauth.Principal, string, knowledge.UpdateCorpusParams) (*knowledge.Corpus, error) {
	return nil, errors.New("not implemented in stub")
}
func (s *stubKnowledgeBackend) DeleteCorpus(context.Context, *backendauth.Principal, string) error {
	return errors.New("not implemented in stub")
}
func (s *stubKnowledgeBackend) AttachFile(context.Context, *backendauth.Principal, string, string) (*knowledge.CorpusFile, error) {
	return nil, errors.New("not implemented in stub")
}
func (s *stubKnowledgeBackend) ListFiles(context.Context, *backendauth.Principal, string) ([]knowledge.CorpusFile, error) {
	return nil, errors.New("not implemented in stub")
}
func (s *stubKnowledgeBackend) DetachFile(context.Context, *backendauth.Principal, string, string) error {
	return errors.New("not implemented in stub")
}
func (s *stubKnowledgeBackend) EnqueueIngest(context.Context, *backendauth.Principal, knowledge.IngestParams) (*knowledge.IngestionJob, error) {
	return nil, errors.New("not implemented in stub")
}
func (s *stubKnowledgeBackend) ListIngestionJobs(context.Context, *backendauth.Principal, string) ([]knowledge.IngestionJob, error) {
	return nil, errors.New("not implemented in stub")
}
func (s *stubKnowledgeBackend) GetIngestionJob(context.Context, *backendauth.Principal, string, string) (*knowledge.IngestionJob, error) {
	return nil, errors.New("not implemented in stub")
}
func (s *stubKnowledgeBackend) RetryIngestionJob(context.Context, *backendauth.Principal, string, string) (*knowledge.IngestionJob, error) {
	return nil, errors.New("not implemented in stub")
}
func (s *stubKnowledgeBackend) Search(context.Context, *backendauth.Principal, knowledge.SearchParams) (*rag.SearchResponse, error) {
	return nil, errors.New("not implemented in stub")
}

var _ knowledge.Backend = (*stubKnowledgeBackend)(nil)

// TestFileContentFallsBackToKnowledgeOnLocalMiss is the regression guard for
// the "connected mode" content 404 bug: a corpus file's id has no record in
// the local Files store at all (it's seshat-server's own CorpusFile id, a
// different id space - see cloudknowledge.RemoteService's doc comment), so
// GET /files/{id}/content must fall through to Knowledge.DownloadFile
// instead of failing outright on the local miss.
func TestFileContentFallsBackToKnowledgeOnLocalMiss(t *testing.T) {
	app, _, _ := newFileTestApp(t)
	router := CreateRouter(APIConfig{}, app)
	adminToken := loginAs(t, router, "admin@files.test", "adminpass")

	app.backend.Knowledge = &stubKnowledgeBackend{
		downloadedFileID: "corpusfile_only_known_remotely",
		downloaded: &knowledge.DownloadedFile{
			Data:        []byte("remote pdf bytes"),
			Filename:    "book_fr.pdf",
			ContentType: "application/pdf",
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/files/corpusfile_only_known_remotely/content", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 via the Knowledge fallback, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "remote pdf bytes" {
		t.Fatalf("unexpected body: %q", rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/pdf" {
		t.Fatalf("expected Content-Type application/pdf, got %q", ct)
	}
}

// TestFileContentStillFailsWhenNeitherSideHasIt makes sure the fallback
// doesn't swallow a genuinely missing file into a silent success.
func TestFileContentStillFailsWhenNeitherSideHasIt(t *testing.T) {
	app, _, _ := newFileTestApp(t)
	router := CreateRouter(APIConfig{}, app)
	adminToken := loginAs(t, router, "admin@files.test", "adminpass")

	app.backend.Knowledge = &stubKnowledgeBackend{downloadedFileID: "some-other-id"}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/files/truly_missing/content", nil)
	req.Header.Set("Authorization", "Bearer "+adminToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 when neither Files nor Knowledge has the file, got %d: %s", rec.Code, rec.Body.String())
	}
}
