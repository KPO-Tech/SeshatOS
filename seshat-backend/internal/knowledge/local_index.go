package knowledge

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/documentreading"
)

// Indexing a file of a folder source: the file is read from where it is, turned to text by the document reader, chunked and embedded
// like any other, and the collection keeps only the text's chunks, never a copy of the file. The jobs are the ones of every other file,
// so waiting, retrying and the state of each file are shown the same way.

// localCost orders the jobs so that what is cheap to read goes first: plain text, then Word, then PDF, then presentations and
// spreadsheets, and inside a kind the small files before the big ones. A scan cannot be told from a digital PDF without reading it, but
// it is usually the bigger of the two, so the size order puts most of them last. Lower runs first.
func localCost(name string, size int64) int {
	class := 3
	switch strings.ToLower(filepath.Ext(name)) {
	case ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".html", ".htm":
		class = 0
	case ".docx":
		class = 1
	case ".pdf":
		class = 2
	}
	kb := min(size/1024, 999_999)
	return class*1_000_000 + int(kb)
}

// localCorpusFile returns a file of a folder source with the collection and source it belongs to, checking that its path is still
// inside the folder of the source.
func (s *Service) localCorpusFile(ctx context.Context, corpusID, fileID string) (*db.CorpusFile, *db.Corpus, error) {
	cf, err := s.corpora.GetFile(ctx, corpusID, fileID)
	if err != nil || cf.SourcePath == "" {
		return nil, nil, bkerr.NotFound("file not found", err)
	}
	corpus, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return nil, nil, bkerr.NotFound("corpus not found", err)
	}
	if corpus.SourceID == "" {
		return nil, nil, bkerr.NotFound("file not found", nil)
	}
	source, err := s.corpora.GetSource(ctx, corpus.SourceID)
	if err != nil || !within(source.Root, cf.SourcePath) {
		return nil, nil, bkerr.NotFound("the file is not in the folder of its source", err)
	}
	return cf, corpus, nil
}

// EnqueueLocalFile queues the indexing of one file of a folder source.
func (s *Service) EnqueueLocalFile(ctx context.Context, principal *backendauth.Principal, corpusID, fileID string) (*IngestionJob, error) {
	if s == nil || s.corpora == nil || s.jobs == nil {
		return nil, bkerr.Unavailable("ingestion job store not configured", nil)
	}
	if s.rag == nil {
		return nil, bkerr.Unavailable("RAG service not configured (embedder required)", nil)
	}
	corpus, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return nil, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, corpus); err != nil {
		return nil, err
	}
	cf, _, err := s.localCorpusFile(ctx, corpusID, fileID)
	if err != nil {
		return nil, err
	}
	if active, err := s.jobs.FindActiveByCorpusFile(ctx, corpusID, fileID); err != nil {
		return nil, bkerr.Internal("find active ingestion job: "+err.Error(), err)
	} else if active != nil {
		return ingestionJobFromDB(*active), nil
	}
	var size int64
	if st, err := os.Stat(cf.SourcePath); err == nil {
		size = st.Size()
	}
	job, err := s.jobs.Create(ctx, db.CreateKnowledgeIngestionJobParams{
		CorpusID:    corpusID,
		FileID:      fileID,
		UserID:      corpus.UserID,
		WorkspaceID: corpus.WorkspaceID,
		Filename:    cf.Filename,
		MaxAttempts: defaultIngestionMaxAttempts,
		Priority:    localCost(cf.SourcePath, size),
	})
	if err != nil {
		return nil, bkerr.Internal("create ingestion job: "+err.Error(), err)
	}
	return ingestionJobFromDB(*job), nil
}

// EnqueueAllLocal queues the indexing of every file of a collection that is still waiting, and says how many it queued. A file that
// already has a job running or waiting is left alone, so asking twice queues nothing twice.
func (s *Service) EnqueueAllLocal(ctx context.Context, principal *backendauth.Principal, corpusID string) (int, error) {
	if s == nil || s.corpora == nil {
		return 0, bkerr.Unavailable("knowledge store not configured", nil)
	}
	corpus, err := s.corpora.GetByID(ctx, corpusID)
	if err != nil {
		return 0, bkerr.NotFound("corpus not found", err)
	}
	if err := s.checkAccess(principal, corpus); err != nil {
		return 0, err
	}
	files, err := s.corpora.ListFiles(ctx, corpusID)
	if err != nil {
		return 0, bkerr.Internal("list files: "+err.Error(), err)
	}
	var waiting []db.CorpusFile
	for _, f := range files {
		if f.SourcePath != "" && f.Status == db.CorpusFileStatusPending {
			waiting = append(waiting, f)
		}
	}
	sort.Slice(waiting, func(i, j int) bool { return waiting[i].Filename < waiting[j].Filename })
	queued := 0
	for _, f := range waiting {
		if active, _ := s.jobs.FindActiveByCorpusFile(ctx, corpusID, f.FileID); active != nil {
			continue
		}
		if _, err := s.EnqueueLocalFile(ctx, principal, corpusID, f.FileID); err != nil {
			return queued, err
		}
		queued++
	}
	return queued, nil
}

// processLocalJob indexes one file of a folder source. A file that was moved or cannot be read fails with the reason, which the screen
// shows next to it.
func (s *Service) processLocalJob(ctx context.Context, job db.KnowledgeIngestionJob) {
	fail := func(err error) {
		_ = s.corpora.UpdateFileStatus(ctx, job.CorpusID, job.FileID, db.CorpusFileStatusFailed, 0)
		_ = s.jobs.MarkFailed(ctx, job, err, defaultIngestionRetryDelay)
	}
	cf, corpus, err := s.localCorpusFile(ctx, job.CorpusID, job.FileID)
	if err != nil {
		_ = s.jobs.MarkSkipped(ctx, job.ID, "corpus file detached before ingestion")
		return
	}
	name := filepath.Base(cf.SourcePath)
	stat, err := os.Stat(cf.SourcePath)
	if err != nil {
		fail(errors.New("the file is no longer where it was: " + name))
		return
	}
	if !stat.Mode().IsRegular() || stat.Size() > maxLocalFileBytes {
		fail(errors.New("this file cannot be read here: " + name))
		return
	}
	data, err := os.ReadFile(cf.SourcePath)
	if err != nil {
		fail(errors.New("the file could not be read: " + err.Error()))
		return
	}
	result, ok, readErr := s.readDocumentResult(ctx, documentreading.ReadInput{
		SourceFileID: job.FileID,
		Filename:     name,
		ContentType:  contentTypeOf(name),
		Data:         data,
	})
	if !ok || strings.TrimSpace(result.Text) == "" {
		fail(errors.New(documentreading.UnreadableReason(name, readErr)))
		return
	}
	scopeID := corpus.WorkspaceID
	if scopeID == "" {
		scopeID = corpus.UserID
	}
	_, chunks, err := s.ingestText(ctx, job.CorpusID, job.FileID, cf.Filename, result.Text, nil, scopeID, nil)
	if err != nil {
		_ = s.jobs.MarkFailed(ctx, job, err, defaultIngestionRetryDelay)
		return
	}
	_ = s.jobs.MarkCompleted(ctx, job.ID, chunks)
}
