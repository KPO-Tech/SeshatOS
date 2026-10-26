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

// A database made before a corpus file could record where it lives on this computer gets the column when it is opened.
func TestCorpusFileSourcePathIsAddedToAnExistingDatabase(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	if err := database.gormDB.Migrator().DropColumn(&gCorpusFile{}, "source_path"); err != nil {
		t.Fatalf("drop column: %v", err)
	}
	var run func(context.Context, *DB) error
	for _, m := range backendMigrations() {
		if m.ID == "20261026_054_corpus_file_source_path" {
			run = m.Run
		}
	}
	if run == nil {
		t.Fatal("the migration is not registered")
	}
	if err := run(ctx, database); err != nil {
		t.Fatalf("migration: %v", err)
	}

	corpora, err := NewCorpusStore(database)
	if err != nil {
		t.Fatal(err)
	}
	corpus, err := corpora.Create(ctx, CreateCorpusParams{UserID: "u", Name: "kb"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := corpora.AddFile(ctx, UpsertCorpusFileParams{CorpusID: corpus.ID, FileID: "local-1", Filename: "a.pdf", SourcePath: "/x/a.pdf"}); err != nil {
		t.Fatalf("add file: %v", err)
	}
	files, _ := corpora.ListFiles(ctx, corpus.ID)
	if len(files) != 1 || files[0].SourcePath != "/x/a.pdf" {
		t.Fatalf("files = %+v", files)
	}
}

// A database made before collections had a source gets the sources table and the collections' source_id when it is opened.
func TestKnowledgeSourcesAreAddedToAnExistingDatabase(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	m := database.gormDB.Migrator()
	if err := m.DropColumn(&gCorpus{}, "source_id"); err != nil {
		t.Fatalf("drop column: %v", err)
	}
	if err := m.DropTable(&gKnowledgeSource{}); err != nil {
		t.Fatalf("drop table: %v", err)
	}
	var run func(context.Context, *DB) error
	for _, mig := range backendMigrations() {
		if mig.ID == "20261026_055_knowledge_sources" {
			run = mig.Run
		}
	}
	if run == nil {
		t.Fatal("the migration is not registered")
	}
	if err := run(ctx, database); err != nil {
		t.Fatalf("migration: %v", err)
	}
	store, _ := NewCorpusStore(database)
	src, err := store.CreateSource(ctx, CreateKnowledgeSourceParams{UserID: "u", Kind: KnowledgeSourceLocalFolder, Name: "n", Root: "/x"})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	c, err := store.Create(ctx, CreateCorpusParams{UserID: "u", Name: "kb", SourceID: src.ID})
	if err != nil || c.SourceID != src.ID {
		t.Fatalf("create corpus under the source: %+v, %v", c, err)
	}
}

// A database made before sources had an icon gets the column when it is opened.
func TestKnowledgeSourceIconIsAddedToAnExistingDatabase(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	if err := database.gormDB.Migrator().DropColumn(&gKnowledgeSource{}, "icon"); err != nil {
		t.Fatalf("drop column: %v", err)
	}
	var run func(context.Context, *DB) error
	for _, mig := range backendMigrations() {
		if mig.ID == "20261027_056_knowledge_source_icon" {
			run = mig.Run
		}
	}
	if run == nil {
		t.Fatal("the migration is not registered")
	}
	if err := run(ctx, database); err != nil {
		t.Fatalf("migration: %v", err)
	}
	store, _ := NewCorpusStore(database)
	src, err := store.CreateSource(ctx, CreateKnowledgeSourceParams{UserID: "u", Kind: KnowledgeSourceLocalFolder, Name: "n", Root: "/x", Icon: "bank"})
	if err != nil || src.Icon != "bank" {
		t.Fatalf("create source with an icon: %+v, %v", src, err)
	}
}
