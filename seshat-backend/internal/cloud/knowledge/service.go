package cloudknowledge

import (
	"context"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/knowledge"
	"github.com/KPO-Tech/seshat/pkg/rag"
	"github.com/KPO-Tech/seshat/pkg/storage"
)

// RemoteService implements knowledge.Backend against a remote seshat-server
// — the "connected mode" org-wide Documents backend. See the package doc
// for why this is a clean swap rather than a merge like cloudmcp.
//
// FileID has two different meanings depending on which knowledge.Backend
// method carries it, both preserved from the existing local API contract
// (internal/api/knowledge.go, unchanged by this package):
//   - As AttachFile's input, it's the id of a file already uploaded through
//     the generic local POST /files endpoint (files/artifacts) — the only
//     place a *local* blob exists to upload.
//   - Everywhere else (CorpusFile.FileID as returned by AttachFile/
//     ListFiles, and as DetachFile's input) it's seshat-server's own
//     CorpusFile id, since a corpus's files may have been uploaded by any
//     connected client (seshat-console, another desktop), not just this one
//     — there is no local record for those.
//
// EnqueueIngest is the one place this duality can't be fully reconciled:
// the local API contract calls it with the same local blob id AttachFile
// just received, but seshat-server has no "enqueue ingest for file X"
// endpoint at all — uploading (AttachFile) already triggers ingestion
// server-side. See its doc comment for how that's bridged.
type RemoteService struct {
	client    *Client
	files     *db.FileStore
	artifacts storage.ArtifactStore
}

// NewRemoteService wires a RemoteService. files/artifacts are the *local*
// file store and blob store — still needed here purely to read back the
// bytes of a file the user just uploaded locally via POST /files, so
// AttachFile can forward them to seshat-server.
func NewRemoteService(serverURL string, files *db.FileStore, artifacts storage.ArtifactStore) *RemoteService {
	return &RemoteService{client: NewClient(serverURL), files: files, artifacts: artifacts}
}

var _ knowledge.Backend = (*RemoteService)(nil)

func (s *RemoteService) CreateCorpus(ctx context.Context, principal *backendauth.Principal, params knowledge.CreateCorpusParams) (*knowledge.Corpus, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	remote, err := s.client.CreateCorpus(ctx, principal.AuthSession.ID, principal.OrganizationID(), params.Name, params.Description)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	return fromRemoteCorpus(*remote), nil
}

func (s *RemoteService) GetCorpus(ctx context.Context, principal *backendauth.Principal, corpusID string) (*knowledge.Corpus, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	remote, err := s.client.GetCorpus(ctx, principal.AuthSession.ID, corpusID)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	return fromRemoteCorpus(*remote), nil
}

func (s *RemoteService) ListCorpora(ctx context.Context, principal *backendauth.Principal) ([]knowledge.Corpus, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	rows, err := s.client.ListCorpora(ctx, principal.AuthSession.ID, principal.OrganizationID())
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	out := make([]knowledge.Corpus, 0, len(rows))
	for _, r := range rows {
		out = append(out, *fromRemoteCorpus(r))
	}
	return out, nil
}

func (s *RemoteService) UpdateCorpus(ctx context.Context, principal *backendauth.Principal, corpusID string, params knowledge.UpdateCorpusParams) (*knowledge.Corpus, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	remote, err := s.client.UpdateCorpus(ctx, principal.AuthSession.ID, corpusID, params.Name, params.Description)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	return fromRemoteCorpus(*remote), nil
}

func (s *RemoteService) DeleteCorpus(ctx context.Context, principal *backendauth.Principal, corpusID string) error {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return err
	}
	if err := s.client.DeleteCorpus(ctx, principal.AuthSession.ID, corpusID); err != nil {
		return cloudhttp.Translate(err)
	}
	return nil
}

// AttachFile reads the given *local* file's blob (already uploaded via the
// generic POST /files) and forwards it to seshat-server as a multipart
// upload, which attaches it to the corpus and enqueues ingestion in one
// call. See the package/type doc comment for the FileID scheme.
func (s *RemoteService) AttachFile(ctx context.Context, principal *backendauth.Principal, corpusID, fileID string) (*knowledge.CorpusFile, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	if s.files == nil || s.artifacts == nil {
		return nil, bkerr.Unavailable("file store not configured", nil)
	}
	fileRecord, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return nil, bkerr.NotFound("file not found", err)
	}
	data, err := s.artifacts.Get(ctx, fileRecord.StorageKey)
	if err != nil {
		return nil, bkerr.Internal("read file blob: "+err.Error(), err)
	}
	remote, err := s.client.UploadFile(ctx, principal.AuthSession.ID, corpusID, fileRecord.Filename, fileRecord.ContentType, data)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	return fromRemoteCorpusFile(*remote), nil
}

// DownloadFile fetches a corpus file's raw bytes from seshat-server by the
// CorpusFile id AttachFile/ListFiles returned - not a local blob id, see the
// type doc comment. This is the fix for the gap that comment already flagged:
// GET /files/{id}/content previously always went through the *local* Files
// service (internal/api/files.go), which has no record of a server-side
// CorpusFile id at all, so every content/preview/delete request for a
// connected-mode corpus file 404'd regardless of ingest status.
func (s *RemoteService) DownloadFile(ctx context.Context, principal *backendauth.Principal, fileID string) (*knowledge.DownloadedFile, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	data, meta, err := s.client.DownloadFile(ctx, principal.AuthSession.ID, fileID)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	return &knowledge.DownloadedFile{Data: data, Filename: meta.Filename, ContentType: meta.ContentType}, nil
}

func (s *RemoteService) ListFiles(ctx context.Context, principal *backendauth.Principal, corpusID string) ([]knowledge.CorpusFile, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	rows, err := s.client.ListFiles(ctx, principal.AuthSession.ID, corpusID)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	out := make([]knowledge.CorpusFile, 0, len(rows))
	for _, r := range rows {
		out = append(out, *fromRemoteCorpusFile(r))
	}
	return out, nil
}

// DetachFile expects fileID to be seshat-server's own CorpusFile id (what
// AttachFile/ListFiles returned), not a local blob id — see the type doc.
func (s *RemoteService) DetachFile(ctx context.Context, principal *backendauth.Principal, corpusID, fileID string) error {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return err
	}
	if err := s.client.DetachFile(ctx, principal.AuthSession.ID, corpusID, fileID); err != nil {
		return cloudhttp.Translate(err)
	}
	return nil
}

// EnqueueIngest exists only because the local API contract
// (internal/api/knowledge.go's handleCorpusIngest) calls it as an explicit
// third step after upload+attach, passing the same local blob id AttachFile
// just consumed. seshat-server has no matching "enqueue ingest for file X"
// endpoint — AttachFile's upload already triggered ingestion server-side —
// so the local blob id here can't be resolved to one specific remote job.
// The frontend only uses the returned job for immediate status feedback
// (it reloads the full corpus detail right after), so returning the most
// recently created job for the corpus is a safe practical stand-in for
// "the job that upload just created."
func (s *RemoteService) EnqueueIngest(ctx context.Context, principal *backendauth.Principal, params knowledge.IngestParams) (*knowledge.IngestionJob, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	jobs, err := s.client.ListIngestionJobs(ctx, principal.AuthSession.ID, params.CorpusID)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	if len(jobs) == 0 {
		return nil, bkerr.NotFound("no ingestion job found for this corpus yet", nil)
	}
	latest := jobs[0]
	for _, j := range jobs[1:] {
		if j.CreatedAt.After(latest.CreatedAt) {
			latest = j
		}
	}
	return fromRemoteIngestionJob(latest), nil
}

func (s *RemoteService) ListIngestionJobs(ctx context.Context, principal *backendauth.Principal, corpusID string) ([]knowledge.IngestionJob, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	rows, err := s.client.ListIngestionJobs(ctx, principal.AuthSession.ID, corpusID)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	out := make([]knowledge.IngestionJob, 0, len(rows))
	for _, r := range rows {
		out = append(out, *fromRemoteIngestionJob(r))
	}
	return out, nil
}

func (s *RemoteService) GetIngestionJob(ctx context.Context, principal *backendauth.Principal, corpusID, jobID string) (*knowledge.IngestionJob, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	remote, err := s.client.GetIngestionJob(ctx, principal.AuthSession.ID, corpusID, jobID)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	return fromRemoteIngestionJob(*remote), nil
}

func (s *RemoteService) RetryIngestionJob(ctx context.Context, principal *backendauth.Principal, corpusID, jobID string) (*knowledge.IngestionJob, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	remote, err := s.client.RetryIngestionJob(ctx, principal.AuthSession.ID, corpusID, jobID)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	return fromRemoteIngestionJob(*remote), nil
}

func (s *RemoteService) Search(ctx context.Context, principal *backendauth.Principal, params knowledge.SearchParams) (*rag.SearchResponse, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	resp, err := s.client.Search(ctx, principal.AuthSession.ID, params.CorpusID, params.Query, params.TopK)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	return resp, nil
}

// ─── DTO conversion ─────────────────────────────────────────────────────────

func fromRemoteCorpus(r remoteCorpus) *knowledge.Corpus {
	return &knowledge.Corpus{
		ID:          r.ID,
		UserID:      r.CreatedByUserID,
		Name:        r.Name,
		Description: r.Description,
		ChunkCount:  r.ChunkCount,
		CreatedAt:   r.CreatedAt,
		UpdatedAt:   r.UpdatedAt,
	}
}

func fromRemoteCorpusFile(r remoteCorpusFile) *knowledge.CorpusFile {
	return &knowledge.CorpusFile{
		CorpusID:   r.CorpusID,
		FileID:     r.ID,
		Filename:   r.Filename,
		Status:     r.Status,
		ChunkCount: r.ChunkCount,
		IngestedAt: r.IngestedAt,
		CreatedAt:  r.CreatedAt,
	}
}

func fromRemoteIngestionJob(r remoteIngestionJob) *knowledge.IngestionJob {
	return &knowledge.IngestionJob{
		ID:           r.ID,
		CorpusID:     r.CorpusID,
		FileID:       r.CorpusFileID,
		Filename:     r.Filename,
		Status:       r.Status,
		AttemptCount: r.AttemptCount,
		MaxAttempts:  r.MaxAttempts,
		ChunkCount:   r.ChunkCount,
		LastError:    r.LastError,
		StartedAt:    r.StartedAt,
		CompletedAt:  r.CompletedAt,
		CreatedAt:    r.CreatedAt,
		UpdatedAt:    r.UpdatedAt,
	}
}
