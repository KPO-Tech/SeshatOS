package knowledge

import (
	"context"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/KPO-Tech/seshat/pkg/rag"
)

// Backend is what internal/app.go's App.Knowledge holds, and what
// internal/api/knowledge.go's handlers call — satisfied by *Service
// (standalone/local: SQLite + local embedder + local vector store) and by
// internal/cloudknowledge.RemoteService (connected mode: proxies to a
// connected seshat-server's own org-wide knowledge base). The API layer is
// written against this interface, not the concrete type, so it never needs
// to know which mode it's running in.
//
// Deliberately narrower than Service's full method set: ProcessNextIngestionJob
// (and the Runner built on it) only makes sense for the local implementation
// — a connected seshat-server runs its own ingestion pipeline server-side,
// so there is nothing for a local runner to do against a RemoteService.
type Backend interface {
	CreateCorpus(ctx context.Context, principal *backendauth.Principal, params CreateCorpusParams) (*Corpus, error)
	GetCorpus(ctx context.Context, principal *backendauth.Principal, corpusID string) (*Corpus, error)
	ListCorpora(ctx context.Context, principal *backendauth.Principal) ([]Corpus, error)
	UpdateCorpus(ctx context.Context, principal *backendauth.Principal, corpusID string, params UpdateCorpusParams) (*Corpus, error)
	DeleteCorpus(ctx context.Context, principal *backendauth.Principal, corpusID string) error

	AttachFile(ctx context.Context, principal *backendauth.Principal, corpusID, fileID string) (*CorpusFile, error)
	ListFiles(ctx context.Context, principal *backendauth.Principal, corpusID string) ([]CorpusFile, error)
	DetachFile(ctx context.Context, principal *backendauth.Principal, corpusID, fileID string) error
	// DownloadFile fetches a corpus file's raw bytes by its own id alone -
	// the caller doesn't (and in connected mode, can't cheaply) know which
	// corpus it belongs to up front. See cloudknowledge.RemoteService's doc
	// comment for why a corpus file's id and the desktop's local blob id are
	// two different id spaces there.
	DownloadFile(ctx context.Context, principal *backendauth.Principal, fileID string) (*DownloadedFile, error)

	EnqueueIngest(ctx context.Context, principal *backendauth.Principal, params IngestParams) (*IngestionJob, error)
	ListIngestionJobs(ctx context.Context, principal *backendauth.Principal, corpusID string) ([]IngestionJob, error)
	GetIngestionJob(ctx context.Context, principal *backendauth.Principal, corpusID, jobID string) (*IngestionJob, error)
	RetryIngestionJob(ctx context.Context, principal *backendauth.Principal, corpusID, jobID string) (*IngestionJob, error)

	Search(ctx context.Context, principal *backendauth.Principal, params SearchParams) (*rag.SearchResponse, error)
}

var _ Backend = (*Service)(nil)
