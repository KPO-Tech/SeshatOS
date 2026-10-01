package db

import (
	"context"
	"testing"
)

// TestBackfillRAGScopeID_EnqueuesJobForIngestedFile verifies the Phase 1 RAG
// permission-filter migration (see helps/roadmap.md): a corpus file that was
// already ingested before scope_id existed must get a fresh ingestion job
// queued so the knowledge Runner re-embeds it with the new metadata tag.
func TestBackfillRAGScopeID_EnqueuesJobForIngestedFile(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t) // migrations, including backfillRAGScopeID, already ran here against an empty table

	corpora, err := NewCorpusStore(database)
	if err != nil {
		t.Fatalf("NewCorpusStore: %v", err)
	}
	corpus, err := corpora.Create(ctx, CreateCorpusParams{UserID: "owner-1", WorkspaceID: "ws-1", Name: "kb"})
	if err != nil {
		t.Fatalf("create corpus: %v", err)
	}

	// Simulate a file that was ingested before this migration existed.
	if _, err := corpora.AddFile(ctx, UpsertCorpusFileParams{
		CorpusID:   corpus.ID,
		FileID:     "file-1",
		Filename:   "legacy.txt",
		Status:     CorpusFileStatusIngested,
		ChunkCount: 3,
	}); err != nil {
		t.Fatalf("seed corpus file: %v", err)
	}

	// Run the backfill directly (the automatic run at Open() happened before
	// this data existed, since migrations only run once).
	if err := backfillRAGScopeID(ctx, database); err != nil {
		t.Fatalf("backfillRAGScopeID: %v", err)
	}

	jobs, err := NewKnowledgeIngestionJobStore(database)
	if err != nil {
		t.Fatalf("NewKnowledgeIngestionJobStore: %v", err)
	}
	job, err := jobs.FindActiveByCorpusFile(ctx, corpus.ID, "file-1")
	if err != nil {
		t.Fatalf("FindActiveByCorpusFile: %v", err)
	}
	if job == nil {
		t.Fatal("expected backfill to enqueue an ingestion job for the legacy file")
	}
	if job.WorkspaceID != "ws-1" {
		t.Fatalf("expected job to carry the corpus's workspace id, got %q", job.WorkspaceID)
	}
	if job.UserID != "owner-1" {
		t.Fatalf("expected job to carry the corpus owner as user id, got %q", job.UserID)
	}

	// Running it again must not create a duplicate (FindActiveByCorpusFile guard).
	if err := backfillRAGScopeID(ctx, database); err != nil {
		t.Fatalf("backfillRAGScopeID (second run): %v", err)
	}
	rows, err := jobs.ListByCorpusID(ctx, corpus.ID)
	if err != nil {
		t.Fatalf("ListByCorpusID: %v", err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected exactly one job after re-running backfill, got %d", len(rows))
	}
}
