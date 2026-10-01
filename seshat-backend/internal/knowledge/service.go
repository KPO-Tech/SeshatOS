package knowledge

import (
	"context"
	"fmt"
	"strings"
	"time"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/documentreading"
	"github.com/KPO-Tech/seshat/pkg/documentreader"
	"github.com/KPO-Tech/seshat/pkg/rag"
	"github.com/KPO-Tech/seshat/pkg/storage"
)

type Service struct {
	corpora                  *db.CorpusStore
	files                    *db.FileStore
	jobs                     *db.KnowledgeIngestionJobStore
	artifacts                storage.ArtifactStore
	rag                      *rag.Service
	resolveDocumentConverter func(ctx context.Context) documentreader.Converter
	documentProcessor        *documentreading.Processor
}

func NewService(
	corpora *db.CorpusStore,
	files *db.FileStore,
	jobs *db.KnowledgeIngestionJobStore,
	artifacts storage.ArtifactStore,
	ragSvc *rag.Service,
) *Service {
	return &Service{
		corpora:   corpora,
		files:     files,
		jobs:      jobs,
		artifacts: artifacts,
		rag:       ragSvc,
	}
}

// WithDocumentReader attaches a resolver that returns the document converter
// to use for binary files before chunking and embedding.
func (s *Service) WithDocumentReader(resolve func(ctx context.Context) documentreader.Converter) *Service {
	s.resolveDocumentConverter = resolve
	s.documentProcessor = documentreading.NewProcessor(resolve)
	return s
}

const (
	defaultIngestionMaxAttempts = 3
	defaultIngestionRetryDelay  = 2 * time.Second
	defaultStaleJobTimeout      = 10 * time.Minute

	// defaultHybridSearchWeight blends keyword (BM25/ts_rank) scoring into
	// vector search results - pure vector (0) means a chunk that never
	// literally mentions the query's own terms can still outrank one that
	// does, if it's merely topically similar. 0.3 keeps vector similarity
	// dominant while still rewarding literal term matches. Only the SQLite
	// and pgvector vector backends run real BM25/ts_rank for this (see
	// vector.Query.HybridWeight's doc); others fall back to a lightweight
	// keyword-overlap approximation - still strictly better than ignoring
	// keyword signal entirely.
	defaultHybridSearchWeight = 0.3
)

// ─── Corpus CRUD ──────────────────────────────────────────────────────────────

func (s *Service) CreateCorpus(ctx context.Context, principal *backendauth.Principal, params CreateCorpusParams) (*Corpus, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	if strings.TrimSpace(params.Name) == "" {
		return nil, bkerr.InvalidInput("corpus name is required", nil)
	}

	record, err := s.corpora.Create(ctx, db.CreateCorpusParams{
		UserID:      principal.User.ID,
		WorkspaceID: params.WorkspaceID,
		Name:        params.Name,
		Description: params.Description,
	})
	if err != nil {
		return nil, bkerr.Internal("create corpus: "+err.Error(), err)
	}
	return corpusFromDB(*record), nil
}

func (s *Service) GetCorpus(ctx context.Context, principal *backendauth.Principal, corpusID string) (*Corpus, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	record, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, err
	}
	return corpusFromDB(*record), nil
}

func (s *Service) ListCorpora(ctx context.Context, principal *backendauth.Principal) ([]Corpus, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}

	var records []db.Corpus
	var err error
	if principal.HasRole("admin") {
		records, err = s.corpora.ListAll(ctx)
	} else {
		records, err = s.corpora.ListByUserID(ctx, principal.User.ID)
	}
	if err != nil {
		return nil, bkerr.Internal("list corpora: "+err.Error(), err)
	}

	result := make([]Corpus, 0, len(records))
	for _, r := range records {
		result = append(result, *corpusFromDB(r))
	}
	return result, nil
}

func (s *Service) UpdateCorpus(ctx context.Context, principal *backendauth.Principal, corpusID string, params UpdateCorpusParams) (*Corpus, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if strings.TrimSpace(params.Name) == "" {
		return nil, bkerr.InvalidInput("corpus name is required", nil)
	}
	record, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, err
	}
	updated, err := s.corpora.Update(ctx, corpusID, db.UpdateCorpusParams{
		Name:        params.Name,
		Description: params.Description,
	})
	if err != nil {
		return nil, bkerr.Internal("update corpus: "+err.Error(), err)
	}
	return corpusFromDB(*updated), nil
}

func (s *Service) DeleteCorpus(ctx context.Context, principal *backendauth.Principal, corpusID string) error {
	if s == nil || s.corpora == nil {
		return bkerr.Unavailable("knowledge store not configured", nil)
	}
	record, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return err
	}

	// Delete all vector records for this corpus namespace.
	if s.rag != nil {
		if err := s.rag.DeleteNamespace(ctx, corpusID); err != nil {
			fmt.Printf("[knowledge] DeleteCorpus: failed to delete vector namespace %s: %v\n", corpusID, err)
		}
	}

	// Remove all corpus_files records then the corpus itself.
	files, _ := s.corpora.ListFiles(ctx, corpusID)
	var fileCleanupFailed int
	for _, f := range files {
		if err := s.corpora.RemoveFile(ctx, corpusID, f.FileID); err != nil {
			fileCleanupFailed++
			fmt.Printf("[knowledge] DeleteCorpus: failed to remove file %s from corpus %s: %v\n", f.FileID, corpusID, err)
		}
	}
	if fileCleanupFailed > 0 {
		fmt.Printf("[knowledge] DeleteCorpus: %d/%d file records could not be cleaned up for corpus %s\n", fileCleanupFailed, len(files), corpusID)
	}
	if err := s.corpora.Delete(ctx, corpusID); err != nil {
		return bkerr.Internal("delete corpus: "+err.Error(), err)
	}
	return nil
}

// ─── Corpus files ─────────────────────────────────────────────────────────────

func (s *Service) AttachFile(ctx context.Context, principal *backendauth.Principal, corpusID, fileID string) (*CorpusFile, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	record, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, err
	}

	// Verify the file exists and is accessible.
	fileRecord, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return nil, bkerr.NotFound("file not found", err)
	}
	if err := s.checkFileAccess(principal, fileRecord); err != nil {
		return nil, err
	}

	cf, err := s.corpora.AddFile(ctx, db.UpsertCorpusFileParams{
		CorpusID: corpusID,
		FileID:   fileID,
		Filename: fileRecord.Filename,
		Status:   db.CorpusFileStatusPending,
	})
	if err != nil {
		return nil, bkerr.Internal("attach file to corpus: "+err.Error(), err)
	}

	// Auto-enqueue an ingestion job when the service is fully configured.
	// Best-effort: a failure here does not fail the attach — the user can
	// always call POST /corpora/{id}/ingest explicitly as a fallback.
	if s.jobs != nil && s.rag != nil {
		if active, _ := s.jobs.FindActiveByCorpusFile(ctx, corpusID, fileID); active == nil {
			_, _ = s.jobs.Create(ctx, db.CreateKnowledgeIngestionJobParams{
				CorpusID:    corpusID,
				FileID:      fileID,
				UserID:      principal.User.ID,
				WorkspaceID: record.WorkspaceID,
				Filename:    fileRecord.Filename,
				MaxAttempts: defaultIngestionMaxAttempts,
			})
		}
	}

	return corpusFileFromDB(*cf), nil
}

// DownloadFile fetches a corpus file's raw bytes by its own id alone. In
// standalone mode a CorpusFile's FileID is always the same id the local
// Files service already knows (AttachFile reuses it verbatim), so this can
// go straight to the local file store/blob without touching s.corpora at
// all - unlike RemoteService's implementation, which is the one that
// actually needs a corpus lookup (see that type's doc comment).
func (s *Service) DownloadFile(ctx context.Context, principal *backendauth.Principal, fileID string) (*DownloadedFile, error) {
	if s == nil || s.files == nil || s.artifacts == nil {
		return nil, bkerr.Unavailable("file store not configured", nil)
	}
	fileRecord, err := s.files.GetByID(ctx, fileID)
	if err != nil {
		return nil, bkerr.NotFound("file not found", err)
	}
	if err := s.checkFileAccess(principal, fileRecord); err != nil {
		return nil, err
	}
	data, err := s.artifacts.Get(ctx, fileRecord.StorageKey)
	if err != nil {
		return nil, bkerr.Internal("read file blob: "+err.Error(), err)
	}
	return &DownloadedFile{Data: data, Filename: fileRecord.Filename, ContentType: fileRecord.ContentType}, nil
}

func (s *Service) ListFiles(ctx context.Context, principal *backendauth.Principal, corpusID string) ([]CorpusFile, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	record, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, err
	}
	rows, err := s.corpora.ListFiles(ctx, corpusID)
	if err != nil {
		return nil, bkerr.Internal("list corpus files: "+err.Error(), err)
	}
	result := make([]CorpusFile, 0, len(rows))
	for _, r := range rows {
		result = append(result, *corpusFileFromDB(r))
	}
	return result, nil
}

func (s *Service) DetachFile(ctx context.Context, principal *backendauth.Principal, corpusID, fileID string) error {
	if s == nil || s.corpora == nil {
		return bkerr.Unavailable("knowledge store not configured", nil)
	}
	record, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return err
	}
	corpusFile, err := s.corpora.GetFile(ctx, corpusID, fileID)
	if err != nil {
		return bkerr.NotFound("corpus file not found", err)
	}
	if corpusFile.ChunkCount > 0 && s.rag != nil {
		artifactKey := fmt.Sprintf("rag/%s/%s", corpusID, fileID)
		if err := s.rag.DeleteFileChunks(ctx, corpusID, artifactKey, 0); err != nil {
			return bkerr.Internal("delete corpus file vectors: "+err.Error(), err)
		}
	}
	if err := s.corpora.RemoveFileAndAdjustChunks(ctx, corpusID, fileID, corpusFile.ChunkCount); err != nil {
		if strings.Contains(err.Error(), "not found") {
			return bkerr.NotFound("corpus file not found", err)
		}
		return bkerr.Internal("detach file from corpus: "+err.Error(), err)
	}
	return nil
}

// ─── Ingest & Search ──────────────────────────────────────────────────────────

func (s *Service) EnqueueIngest(ctx context.Context, principal *backendauth.Principal, params IngestParams) (*IngestionJob, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if s.jobs == nil {
		return nil, bkerr.Unavailable("ingestion job store not configured", nil)
	}
	if s.files == nil {
		return nil, bkerr.Unavailable("file store not configured", nil)
	}
	if s.rag == nil {
		return nil, bkerr.Unavailable("RAG service not configured (embedder required)", nil)
	}
	if s.artifacts == nil {
		return nil, bkerr.Unavailable("artifact store not configured", nil)
	}

	corpus, fileRecord, err := s.loadIngestInputs(ctx, principal, params)
	if err != nil {
		return nil, err
	}

	if active, err := s.jobs.FindActiveByCorpusFile(ctx, params.CorpusID, params.FileID); err != nil {
		return nil, bkerr.Internal("find active ingestion job: "+err.Error(), err)
	} else if active != nil {
		return ingestionJobFromDB(*active), nil
	}

	_, _ = s.corpora.AddFile(ctx, db.UpsertCorpusFileParams{
		CorpusID: params.CorpusID,
		FileID:   params.FileID,
		Filename: fileRecord.Filename,
		Status:   db.CorpusFileStatusPending,
	})

	job, err := s.jobs.Create(ctx, db.CreateKnowledgeIngestionJobParams{
		CorpusID:    params.CorpusID,
		FileID:      params.FileID,
		UserID:      corpus.UserID,
		WorkspaceID: corpus.WorkspaceID,
		Filename:    fileRecord.Filename,
		MaxAttempts: defaultIngestionMaxAttempts,
	})
	if err != nil {
		return nil, bkerr.Internal("create ingestion job: "+err.Error(), err)
	}
	return ingestionJobFromDB(*job), nil
}

func (s *Service) ListIngestionJobs(ctx context.Context, principal *backendauth.Principal, corpusID string) ([]IngestionJob, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if s.jobs == nil {
		return nil, bkerr.Unavailable("ingestion job store not configured", nil)
	}
	record, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, err
	}
	rows, err := s.jobs.ListByCorpusID(ctx, corpusID)
	if err != nil {
		return nil, bkerr.Internal("list ingestion jobs: "+err.Error(), err)
	}
	result := make([]IngestionJob, 0, len(rows))
	for _, row := range rows {
		result = append(result, *ingestionJobFromDB(row))
	}
	return result, nil
}

func (s *Service) GetIngestionJob(ctx context.Context, principal *backendauth.Principal, corpusID, jobID string) (*IngestionJob, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if s.jobs == nil {
		return nil, bkerr.Unavailable("ingestion job store not configured", nil)
	}
	record, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, err
	}
	job, err := s.jobs.GetByID(ctx, jobID)
	if err != nil {
		return nil, bkerr.NotFound("ingestion job not found", err)
	}
	if job.CorpusID != corpusID {
		return nil, bkerr.NotFound("ingestion job not found", nil)
	}
	return ingestionJobFromDB(*job), nil
}

func (s *Service) RetryIngestionJob(ctx context.Context, principal *backendauth.Principal, corpusID, jobID string) (*IngestionJob, error) {
	job, err := s.GetIngestionJob(ctx, principal, corpusID, jobID)
	if err != nil {
		return nil, err
	}
	if job.Status != db.IngestionJobStatusFailed {
		return nil, bkerr.InvalidInput("only failed ingestion jobs can be retried", nil)
	}
	reset, err := s.jobs.ResetForRetry(ctx, jobID)
	if err != nil {
		return nil, bkerr.Internal("retry ingestion job: "+err.Error(), err)
	}
	return ingestionJobFromDB(*reset), nil
}

// Ingest reads a file from ArtifactStore, chunks+embeds the text, and upserts
// into the vector namespace for the corpus. Requires RAG service to be configured.
func (s *Service) Ingest(ctx context.Context, principal *backendauth.Principal, params IngestParams) (*CorpusFile, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if s.rag == nil {
		return nil, bkerr.Unavailable("RAG service not configured (embedder required)", nil)
	}
	if s.artifacts == nil {
		return nil, bkerr.Unavailable("artifact store not configured", nil)
	}

	corpus, fileRecord, err := s.loadIngestInputs(ctx, principal, params)
	if err != nil {
		return nil, err
	}

	// Mark as pending (or ensure attached).
	_, _ = s.corpora.AddFile(ctx, db.UpsertCorpusFileParams{
		CorpusID: params.CorpusID,
		FileID:   params.FileID,
		Filename: fileRecord.Filename,
		Status:   db.CorpusFileStatusPending,
	})

	cf, _, err := s.ingestFile(ctx, params.CorpusID, fileRecord, corpus.WorkspaceID, corpus.UserID)
	if err != nil {
		return nil, err
	}
	return cf, nil
}

// Search embeds the query and returns the top-K matching chunks from the corpus.
func (s *Service) Search(ctx context.Context, principal *backendauth.Principal, params SearchParams) (*rag.SearchResponse, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if s.rag == nil {
		return nil, bkerr.Unavailable("RAG service not configured (embedder required)", nil)
	}

	record, err := s.corpora.GetByID(ctx, params.CorpusID)
	if err != nil {
		return nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, err
	}

	topK := params.TopK
	if topK <= 0 {
		topK = 5
	}
	// allowedScopeIDs mirrors checkAccess's own rule (owner or workspace
	// member) at the chunk level, so that a corpus which one day aggregates
	// multi-source content (e.g. a connector syncing more than one
	// department) can restrict individual chunks below the corpus-level
	// check above — see helps/roadmap.md Phase 1.
	allowedScopeIDs := make([]string, 0, 1+len(principal.WorkspaceMemberships))
	allowedScopeIDs = append(allowedScopeIDs, principal.User.ID)
	for _, m := range principal.WorkspaceMemberships {
		allowedScopeIDs = append(allowedScopeIDs, m.WorkspaceID)
	}
	resp, err := s.rag.Search(ctx, rag.SearchRequest{
		CorpusID:     params.CorpusID,
		Query:        params.Query,
		TopK:         topK,
		HybridWeight: defaultHybridSearchWeight,
		Filter: map[string]any{
			"scope_id": map[string]any{"$in": allowedScopeIDs},
		},
	})
	if err != nil {
		return nil, bkerr.Internal("search corpus: "+err.Error(), err)
	}
	resp.Results = dedupeSearchResults(resp.Results)
	return &resp, nil
}

// dedupeSearchResults drops exact-duplicate hits (same chunk text verbatim,
// after trimming) from a single search response, keeping the first
// occurrence. Results already arrive score-sorted (descending - see the
// SDK's Search/rerank sort), so "first" is always the highest-scoring copy.
// This is a real, not hypothetical, case: a document re-ingested into a
// corpus it's already in produces two independent chunks with byte-identical
// text, and both can legitimately rank in the same top-K for a matching
// query - without this, a caller sees the same sentence twice instead of
// two distinct results.
func dedupeSearchResults(results []rag.SearchResult) []rag.SearchResult {
	if len(results) < 2 {
		return results
	}
	seen := make(map[string]struct{}, len(results))
	deduped := make([]rag.SearchResult, 0, len(results))
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

func (s *Service) ProcessNextIngestionJob(ctx context.Context) (bool, error) {
	if s == nil || s.jobs == nil || s.corpora == nil || s.files == nil || s.rag == nil || s.artifacts == nil {
		return false, nil
	}
	job, err := s.jobs.ClaimNextDue(ctx, defaultStaleJobTimeout)
	if err != nil {
		return false, bkerr.Internal("claim ingestion job: "+err.Error(), err)
	}
	if job == nil {
		return false, nil
	}
	s.processIngestionJob(ctx, *job)
	return true, nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func (s *Service) processIngestionJob(ctx context.Context, job db.KnowledgeIngestionJob) {
	if _, err := s.corpora.GetFile(ctx, job.CorpusID, job.FileID); err != nil {
		_ = s.jobs.MarkSkipped(ctx, job.ID, "corpus file detached before ingestion")
		return
	}

	fileRecord, err := s.files.GetByID(ctx, job.FileID)
	if err != nil {
		_ = s.corpora.UpdateFileStatus(ctx, job.CorpusID, job.FileID, db.CorpusFileStatusFailed, 0)
		_ = s.jobs.MarkFailed(ctx, job, err, defaultIngestionRetryDelay)
		return
	}

	_, chunks, err := s.ingestFile(ctx, job.CorpusID, fileRecord, job.WorkspaceID, job.UserID)
	if err != nil {
		_ = s.jobs.MarkFailed(ctx, job, err, defaultIngestionRetryDelay)
		return
	}
	_ = s.jobs.MarkCompleted(ctx, job.ID, chunks)
}

func (s *Service) loadIngestInputs(ctx context.Context, principal *backendauth.Principal, params IngestParams) (*db.Corpus, *db.File, error) {
	record, err := s.corpora.GetByID(ctx, params.CorpusID)
	if err != nil {
		return nil, nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, record); err != nil {
		return nil, nil, err
	}

	fileRecord, err := s.files.GetByID(ctx, params.FileID)
	if err != nil {
		return nil, nil, bkerr.NotFound("file not found", err)
	}
	if err := s.checkFileAccess(principal, fileRecord); err != nil {
		return nil, nil, err
	}
	return record, fileRecord, nil
}

// ingestFile chunks+embeds fileRecord into the corpus's vector namespace.
// workspaceID/ownerID determine the scope_id tag written on every resulting
// chunk (workspace wins when the corpus is shared, else the owner) — see
// helps/roadmap.md Phase 1.
func (s *Service) ingestFile(ctx context.Context, corpusID string, fileRecord *db.File, workspaceID, ownerID string) (*CorpusFile, int, error) {
	data, err := s.artifacts.Get(ctx, fileRecord.StorageKey)
	if err != nil {
		_ = s.corpora.UpdateFileStatus(ctx, corpusID, fileRecord.ID, db.CorpusFileStatusFailed, 0)
		return nil, 0, bkerr.Internal(fmt.Sprintf("read file blob: %s", err.Error()), err)
	}

	result, ok := s.readDocumentResultForFile(ctx, data, fileRecord)
	text := result.Text
	if strings.TrimSpace(text) == "" {
		_ = s.corpora.UpdateFileStatus(ctx, corpusID, fileRecord.ID, db.CorpusFileStatusFailed, 0)
		return nil, 0, bkerr.InvalidInput("file has no extractable text content", nil)
	}
	if ok {
		_ = documentreading.SaveReadResult(ctx, s.artifacts, fileRecord.ID, result)
	}

	scopeID := workspaceID
	if scopeID == "" {
		scopeID = ownerID
	}
	return s.ingestText(ctx, corpusID, fileRecord.ID, fileRecord.Filename, text, data, scopeID, nil)
}

// ingestText is the common core shared by ingestFile (text extracted from an
// uploaded blob) and IngestExternal (text already in hand, from a Knowledge
// connector) — chunk+embed via rag.Service, corpus_files bookkeeping, and
// stale-chunk cleanup on shrink. fileID is the key used for corpus_files and
// rag's deterministic artifact key: either a real db.File.ID or a synthetic
// connector-sourced identifier (e.g. "gdrive-{driveFileID}") — corpus_files
// has no foreign key on it, so a synthetic ID is safe.
func (s *Service) ingestText(ctx context.Context, corpusID, fileID, filename, text string, data []byte, scopeID string, scopeIDs []string) (*CorpusFile, int, error) {
	// Record the previous chunk count so we can compute a delta and clean up stale vectors
	// when a re-ingest produces fewer chunks than the previous run.
	oldChunkCount := 0
	if existing, err := s.corpora.GetFile(ctx, corpusID, fileID); err == nil {
		oldChunkCount = existing.ChunkCount
	}

	result, err := s.rag.Ingest(ctx, rag.IngestRequest{
		CorpusID: corpusID,
		FileID:   fileID, // deterministic artifact key — prevents duplicate vectors on re-ingest
		Filename: filename,
		Text:     text,
		Data:     data,
		ScopeID:  scopeID,
		ScopeIDs: scopeIDs,
	})
	if err != nil {
		_ = s.corpora.UpdateFileStatus(ctx, corpusID, fileID, db.CorpusFileStatusFailed, 0)
		return nil, 0, bkerr.Internal("ingest chunks: "+err.Error(), err)
	}

	// Remove stale chunk vectors when a re-ingest produced fewer chunks than the prior run.
	// Chunk keys follow "rag/{corpusID}/{fileID}#chunk-{i}" (set by rag.Service when FileID is given).
	if oldChunkCount > result.Chunks {
		artifactKey := fmt.Sprintf("rag/%s/%s", corpusID, fileID)
		_ = s.rag.DeleteFileChunks(ctx, corpusID, artifactKey, result.Chunks)
	}

	_ = s.corpora.UpdateFileStatus(ctx, corpusID, fileID, db.CorpusFileStatusIngested, result.Chunks)

	// Use delta so re-ingesting a file doesn't double-count its chunks in the corpus total.
	chunkDelta := result.Chunks - oldChunkCount
	if chunkDelta != 0 {
		_ = s.corpora.IncrementChunkCount(ctx, corpusID, chunkDelta)
	}

	cf, err := s.corpora.GetFile(ctx, corpusID, fileID)
	if err != nil {
		return nil, 0, bkerr.Internal("get corpus file: "+err.Error(), err)
	}
	return corpusFileFromDB(*cf), result.Chunks, nil
}

// IngestExternal ingests text pulled live from an external source (a
// Knowledge connector - see internal/connector.KnowledgeConnector) rather
// than an already-uploaded db.File. Shares ingestFile's corpus_files
// bookkeeping via ingestText, so connector-synced content shows up in the
// Knowledge UI's per-file status exactly like an uploaded file — it just
// skips reading a blob out of ArtifactStore, since the caller already has
// the text.
func (s *Service) IngestExternal(ctx context.Context, principal *backendauth.Principal, params ExternalIngestParams) (*CorpusFile, error) {
	if s == nil || s.corpora == nil {
		return nil, bkerr.Unavailable("knowledge store not configured", nil)
	}
	if s.rag == nil {
		return nil, bkerr.Unavailable("RAG service not configured (embedder required)", nil)
	}
	if strings.TrimSpace(params.ExternalID) == "" {
		return nil, bkerr.InvalidInput("external id is required", nil)
	}
	if strings.TrimSpace(params.Text) == "" {
		return nil, bkerr.InvalidInput("text is required", nil)
	}

	corpus, err := s.corpora.GetByID(ctx, params.CorpusID)
	if err != nil {
		return nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, corpus); err != nil {
		return nil, err
	}

	// An empty AccessControl falls back to the corpus's own scope (workspace,
	// else owner) rather than being left unscoped - scope_id is what the
	// search-time filter matches against, and an unscoped chunk matches
	// nothing (see vector.matchesFilter), so it would silently vanish from
	// every search rather than "be public." Never over-share by default.
	scopeIDs := params.AccessControl
	if len(scopeIDs) == 0 {
		scopeID := corpus.WorkspaceID
		if scopeID == "" {
			scopeID = corpus.UserID
		}
		scopeIDs = []string{scopeID}
	}

	_, _ = s.corpora.AddFile(ctx, db.UpsertCorpusFileParams{
		CorpusID: params.CorpusID,
		FileID:   params.ExternalID,
		Filename: params.Filename,
		Status:   db.CorpusFileStatusPending,
	})

	cf, _, err := s.ingestText(ctx, params.CorpusID, params.ExternalID, params.Filename, params.Text, nil, "", scopeIDs)
	if err != nil {
		return nil, err
	}
	return cf, nil
}

// checkAccess gates Knowledge content access: owning the corpus, or being a
// member of the workspace it's shared with. Deliberately does NOT grant
// admins a blanket bypass here — admins still see every corpus via
// ListCorpora's ListAll for management purposes, but reading RAG content
// belonging to another user/workspace requires actually being in scope, the
// same way any other principal would need to be. See helps/roadmap.md
// Phase 1 for why this changed from the previous unconditional admin bypass.
func (s *Service) checkAccess(principal *backendauth.Principal, corpus *db.Corpus) error {
	if principal == nil {
		return bkerr.Unauthorized("authentication required", nil)
	}
	if corpus.UserID == principal.User.ID {
		return nil
	}
	if corpus.WorkspaceID != "" && isWorkspaceMember(principal, corpus.WorkspaceID) {
		return nil
	}
	return bkerr.Forbidden("corpus belongs to another user", nil)
}

// isWorkspaceMember checks actual membership only — deliberately not
// principal.CanViewWorkspace, whose admin bypass is right for org-management
// UI but wrong here (see checkAccess's doc comment on why admins don't get a
// free pass to RAG content).
func isWorkspaceMember(principal *backendauth.Principal, workspaceID string) bool {
	for _, m := range principal.WorkspaceMemberships {
		if m.WorkspaceID == workspaceID {
			return true
		}
	}
	return false
}

func (s *Service) checkFileAccess(principal *backendauth.Principal, fileRecord *db.File) error {
	if principal == nil {
		return bkerr.Unauthorized("authentication required", nil)
	}
	if principal.HasRole("admin") {
		return nil
	}
	if fileRecord.UserID != principal.User.ID {
		return bkerr.Forbidden("file belongs to another user", nil)
	}
	return nil
}

// ExtractText is extractTextWithDocumentReader exported for callers outside this
// package - specifically Knowledge connectors (e.g. internal/knowledge/gdrive)
// that download a binary file's raw bytes and need the exact same
// extraction quality an uploaded file gets, rather than treating raw
// PDF/DOCX bytes as plain text (which produces unsearchable garbage - see
// helps/roadmap.md Phase 1's Google Drive connector for how this gap was
// found via a real end-to-end test).
func (s *Service) ExtractText(ctx context.Context, data []byte, contentType, filename string) string {
	return s.extractTextWithDocumentReader(ctx, data, contentType, filename)
}

// extractTextWithDocumentReader uses the configured document reader policy
// for rich formats, then falls back to plain-text extraction for everything
// else. The policy is local-first by default and only uses an external reader
// when it is configured.
func (s *Service) extractTextWithDocumentReader(ctx context.Context, data []byte, contentType, filename string) string {
	result, ok := s.readDocumentResult(ctx, documentreading.ReadInput{
		Filename:    filename,
		ContentType: contentType,
		Data:        data,
	})
	if ok {
		return result.Text
	}
	return ""
}

func (s *Service) readDocumentResultForFile(ctx context.Context, data []byte, fileRecord *db.File) (documentreading.ReadResult, bool) {
	if fileRecord == nil {
		return s.readDocumentResult(ctx, documentreading.ReadInput{Data: data})
	}
	if cached, ok, err := documentreading.LoadReadResult(ctx, s.artifacts, fileRecord.ID); err == nil && ok {
		if cached.SHA256 == "" || fileRecord.SHA256 == "" || strings.EqualFold(cached.SHA256, fileRecord.SHA256) {
			return cached, true
		}
	}
	return s.readDocumentResult(ctx, documentreading.ReadInput{
		SourceFileID: fileRecord.ID,
		Filename:     fileRecord.Filename,
		ContentType:  fileRecord.ContentType,
		Data:         data,
		SHA256:       fileRecord.SHA256,
	})
}

func (s *Service) readDocumentResult(ctx context.Context, input documentreading.ReadInput) (documentreading.ReadResult, bool) {
	processor := s.documentProcessor
	if processor == nil {
		processor = documentreading.NewProcessor(s.resolveDocumentConverter)
	}
	if result, ok, err := processor.ReadBytes(ctx, input); err == nil && ok {
		return result, true
	}
	return documentreading.ReadResult{}, false
}

// extractText attempts to extract UTF-8 text from the blob.
// For plain text content types it returns the raw bytes; otherwise it tries
// a best-effort conversion.
func extractText(data []byte, contentType, _ string) string {
	return documentreading.ExtractPlainText(data, contentType)
}

// isPrintable reports whether s looks like real text rather than binary
// data. utf8.ValidString is the load-bearing check: arbitrary binary (a
// PDF's compressed stream data, for instance) essentially never forms
// valid UTF-8 over any meaningful length, so this alone rejects almost all
// non-text blobs. Without it, ranging over an invalid byte sequence
// replaces each bad run with U+FFFD (>= 32), so the old "r >= 32" check
// scored raw binary as ~100% printable - this is exactly what let a raw,
// un-extracted PDF get silently indexed as "text" instead of the ingestion
// job failing. The printable-character ratio on top catches the rarer
// case of valid-but-not-really-text UTF-8 (e.g. mostly control characters).
func isPrintable(s string) bool {
	return documentreading.IsPrintableText(s)
}

func corpusFromDB(r db.Corpus) *Corpus {
	return &Corpus{
		ID:          r.ID,
		UserID:      r.UserID,
		WorkspaceID: r.WorkspaceID,
		Name:        r.Name,
		Description: r.Description,
		ChunkCount:  r.ChunkCount,
		CreatedAt:   r.CreatedAt,
		UpdatedAt:   r.UpdatedAt,
	}
}

func corpusFileFromDB(r db.CorpusFile) *CorpusFile {
	return &CorpusFile{
		CorpusID:   r.CorpusID,
		FileID:     r.FileID,
		Filename:   r.Filename,
		Status:     r.Status,
		ChunkCount: r.ChunkCount,
		IngestedAt: r.IngestedAt,
		CreatedAt:  r.CreatedAt,
	}
}

func ingestionJobFromDB(r db.KnowledgeIngestionJob) *IngestionJob {
	return &IngestionJob{
		ID:           r.ID,
		CorpusID:     r.CorpusID,
		FileID:       r.FileID,
		UserID:       r.UserID,
		WorkspaceID:  r.WorkspaceID,
		Filename:     r.Filename,
		Status:       r.Status,
		AttemptCount: r.AttemptCount,
		MaxAttempts:  r.MaxAttempts,
		ChunkCount:   r.ChunkCount,
		LastError:    r.LastError,
		ErrorLog:     r.ErrorLog,
		NextRunAt:    r.NextRunAt,
		StartedAt:    r.StartedAt,
		CompletedAt:  r.CompletedAt,
		CreatedAt:    r.CreatedAt,
		UpdatedAt:    r.UpdatedAt,
	}
}
