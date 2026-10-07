package knowledge_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/documentreading"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
	"github.com/KPO-Tech/seshat/pkg/documentreader"
	"github.com/KPO-Tech/seshat/pkg/rag"
	"github.com/KPO-Tech/seshat/pkg/storage"
	"github.com/KPO-Tech/seshat/pkg/vector"
)

// ─── Helpers ─────────────────────────────────────────────────────────────────

// fakeEmbedder returns a constant unit vector so tests don't need a live
// embedding API.
type fakeEmbedder struct{}

func (fakeEmbedder) EmbedTexts(_ context.Context, texts []string) ([][]float32, error) {
	out := make([][]float32, len(texts))
	for i := range texts {
		out[i] = []float32{1, 0, 0}
	}
	return out, nil
}

type fakeHybridReader struct{}

func (fakeHybridReader) IsAvailable(context.Context) bool { return true }

func (fakeHybridReader) ConvertFile(context.Context, string) (*documentreader.ConversionResult, error) {
	return &documentreader.ConversionResult{Markdown: "converted document text"}, nil
}

func (fakeHybridReader) ConvertBytes(context.Context, []byte, string) (*documentreader.ConversionResult, error) {
	return &documentreader.ConversionResult{Markdown: "converted document text"}, nil
}

func (fakeHybridReader) ConvertURL(context.Context, string) (*documentreader.ConversionResult, error) {
	return &documentreader.ConversionResult{Markdown: "converted document text"}, nil
}

func (fakeHybridReader) ChunkHybridBytes(context.Context, []byte, string, documentreader.ChunkOptions) ([]documentreader.Chunk, error) {
	return []documentreader.Chunk{{
		Filename:    "report.pdf",
		ChunkIndex:  0,
		Text:        "hybrid chunk about revenue",
		PageNumbers: []int{3},
	}}, nil
}

type fakeFailingHybridReader struct {
	fakeHybridReader
}

func (fakeFailingHybridReader) ConvertBytes(context.Context, []byte, string) (*documentreader.ConversionResult, error) {
	return &documentreader.ConversionResult{Markdown: "# Revenue\n\nFallback chunk about revenue."}, nil
}

func (fakeFailingHybridReader) ChunkHybridBytes(context.Context, []byte, string, documentreader.ChunkOptions) ([]documentreader.Chunk, error) {
	return nil, fmt.Errorf("hybrid chunking failed")
}

func openTestDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.Open(
		context.Background(),
		db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")),
	)
	require.NoError(t, err, "open test db")
	t.Cleanup(func() { _ = database.Close() })
	return database
}

func newTestArtifactStore(t *testing.T) storage.ArtifactStore {
	t.Helper()
	p, err := storage.NewLocalProviderWithConfig(storage.Config{
		Provider:  storage.ProviderLocal,
		LocalPath: t.TempDir(),
	})
	require.NoError(t, err, "local storage provider")
	return storage.NewArtifactStore(p)
}

func readDocumentFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "documentreading", "testdata", name))
	require.NoError(t, err, "read document fixture")
	return data
}

func newTestService(t *testing.T, database *db.DB, artifacts storage.ArtifactStore) *knowledge.Service {
	t.Helper()
	corpusStore, err := db.NewCorpusStore(database)
	require.NoError(t, err)
	fileStore, err := db.NewFileStore(database)
	require.NoError(t, err)
	jobStore, err := db.NewKnowledgeIngestionJobStore(database)
	require.NoError(t, err)

	vs := vector.NewMemoryStore()
	ragSvc := rag.NewService(artifacts, vs, fakeEmbedder{}, nil)

	return knowledge.NewService(corpusStore, fileStore, jobStore, artifacts, ragSvc)
}

func newTestServiceWithDocumentReader(t *testing.T, database *db.DB, artifacts storage.ArtifactStore, reader documentreader.Converter, preferExternal bool) *knowledge.Service {
	t.Helper()
	corpusStore, err := db.NewCorpusStore(database)
	require.NoError(t, err)
	fileStore, err := db.NewFileStore(database)
	require.NoError(t, err)
	jobStore, err := db.NewKnowledgeIngestionJobStore(database)
	require.NoError(t, err)

	resolve := func(context.Context) documentreader.Converter {
		return documentreading.NewPolicyConverter(reader, preferExternal)
	}
	chunker := rag.NewHybridDocumentChunkerForProfile(
		documentreading.NewDynamicHybridChunker(resolve),
		rag.ChunkProfile{Name: rag.ChunkProfileStructured, MaxTokens: 1024, OverlapTokens: 128},
		documentreader.ChunkOptions{},
	)
	ragSvc := rag.NewService(artifacts, vector.NewMemoryStore(), fakeEmbedder{}, chunker)
	return knowledge.NewService(corpusStore, fileStore, jobStore, artifacts, ragSvc).WithDocumentReader(resolve)
}

// testPrincipal constructs a minimal authenticated user for service calls.
func testPrincipal(userID string) *backendauth.Principal {
	return &backendauth.Principal{
		User:  backendauth.User{ID: userID},
		Roles: []string{"member"},
	}
}

// testPrincipalInWorkspace is testPrincipal plus membership in workspaceID.
func testPrincipalInWorkspace(userID, workspaceID string) *backendauth.Principal {
	p := testPrincipal(userID)
	p.WorkspaceMemberships = []backendauth.WorkspaceMembership{{WorkspaceID: workspaceID}}
	return p
}

// testAdminPrincipal constructs an authenticated admin with no memberships of
// its own — used to verify checkAccess/Search no longer grant admins a
// blanket bypass onto other users' Knowledge content (roadmap.md Phase 1).
func testAdminPrincipal(userID string) *backendauth.Principal {
	return &backendauth.Principal{
		User:  backendauth.User{ID: userID},
		Roles: []string{"admin"},
	}
}

// seedFile uploads blob content to the artifact store and creates a DB file
// record. Returns the file ID.
func seedFile(
	t *testing.T,
	ctx context.Context,
	database *db.DB,
	artifacts storage.ArtifactStore,
	userID, filename, content string,
) string {
	t.Helper()
	key := "files/" + userID + "/" + filename
	_, err := artifacts.Put(ctx, key, []byte(content), "text/plain")
	require.NoError(t, err, "store artifact")

	fileStore, err := db.NewFileStore(database)
	require.NoError(t, err)
	f, err := fileStore.Create(ctx, db.CreateFileParams{
		UserID:      userID,
		Filename:    filename,
		ContentType: "text/plain",
		Size:        int64(len(content)),
		StorageKey:  key,
	})
	require.NoError(t, err, "create file record")
	return f.ID
}

// ─── Service tests ───────────────────────────────────────────────────────────

func TestService_CreateAndGetCorpus(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	principal := testPrincipal("user-1")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "my corpus"})
	require.NoError(t, err)
	require.NotEmpty(t, corpus.ID)
	require.Equal(t, "my corpus", corpus.Name)

	got, err := svc.GetCorpus(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Equal(t, corpus.ID, got.ID)
}

func TestService_AttachFile_AutoEnqueuesJob(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	principal := testPrincipal("user-2")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "docs"})
	require.NoError(t, err)

	fileID := seedFile(t, ctx, database, artifacts, "user-2", "readme.txt", "Hello world content for testing RAG ingestion.")

	cf, err := svc.AttachFile(ctx, principal, corpus.ID, fileID)
	require.NoError(t, err)
	require.Equal(t, db.CorpusFileStatusPending, cf.Status)

	// An ingestion job must have been auto-created.
	jobs, err := svc.ListIngestionJobs(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Len(t, jobs, 1, "AttachFile must auto-enqueue one ingestion job")
	require.Equal(t, db.IngestionJobStatusPending, jobs[0].Status)
	require.Equal(t, fileID, jobs[0].FileID)
}

func TestService_AttachFile_IdempotentJob(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	principal := testPrincipal("user-3")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "docs"})
	require.NoError(t, err)

	fileID := seedFile(t, ctx, database, artifacts, "user-3", "notes.txt", "Some notes.")

	_, err = svc.AttachFile(ctx, principal, corpus.ID, fileID)
	require.NoError(t, err)

	// Explicitly enqueueing again must not create a second job.
	_, err = svc.EnqueueIngest(ctx, principal, knowledge.IngestParams{CorpusID: corpus.ID, FileID: fileID})
	require.NoError(t, err)

	jobs, err := svc.ListIngestionJobs(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Len(t, jobs, 1, "duplicate enqueue must not create a second job")
}

func TestService_ProcessNextIngestionJob_CompletesJob(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	principal := testPrincipal("user-4")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "kb"})
	require.NoError(t, err)

	content := "Paragraph one.\n\nParagraph two.\n\nParagraph three."
	fileID := seedFile(t, ctx, database, artifacts, "user-4", "doc.txt", content)

	_, err = svc.AttachFile(ctx, principal, corpus.ID, fileID)
	require.NoError(t, err)

	// Process the job.
	processed, err := svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)
	require.True(t, processed, "expected one job to be processed")

	// Job must be completed.
	jobs, err := svc.ListIngestionJobs(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Len(t, jobs, 1)
	require.Equal(t, db.IngestionJobStatusCompleted, jobs[0].Status)
	require.Greater(t, jobs[0].ChunkCount, 0)

	// Corpus file must be ingested with chunk count > 0.
	files, err := svc.ListFiles(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Len(t, files, 1)
	require.Equal(t, db.CorpusFileStatusIngested, files[0].Status)
	require.Greater(t, files[0].ChunkCount, 0)
}

func TestService_ProcessNextIngestionJob_UsesCachedDocumentReadResult(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	principal := testPrincipal("user-cache")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "cached-docs"})
	require.NoError(t, err)

	key := "files/user-cache/scan.png"
	binary := []byte{0x89, 0x50, 0x4e, 0x47, 0x00, 0xff}
	_, err = artifacts.Put(ctx, key, binary, "image/png")
	require.NoError(t, err)

	fileStore, err := db.NewFileStore(database)
	require.NoError(t, err)
	f, err := fileStore.Create(ctx, db.CreateFileParams{
		UserID:      principal.User.ID,
		Filename:    "scan.png",
		ContentType: "image/png",
		Size:        int64(len(binary)),
		StorageKey:  key,
	})
	require.NoError(t, err)
	require.NoError(t, documentreading.SaveReadResult(ctx, artifacts, f.ID, documentreading.ReadResult{
		Filename: "scan.png",
		Status:   documentreading.StatusReady,
		Engine:   documentreading.EngineExternal,
		Markdown: "Cached OCR text from upload.",
		Text:     "Cached OCR text from upload.",
	}))

	_, err = svc.AttachFile(ctx, principal, corpus.ID, f.ID)
	require.NoError(t, err)

	processed, err := svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)
	require.True(t, processed)

	jobs, err := svc.ListIngestionJobs(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Len(t, jobs, 1)
	require.Equal(t, db.IngestionJobStatusCompleted, jobs[0].Status)
	require.Greater(t, jobs[0].ChunkCount, 0)
}

func TestService_ProcessNextIngestionJob_UsesHybridDocumentChunkMetadata(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestServiceWithDocumentReader(t, database, artifacts, fakeHybridReader{}, true)
	principal := testPrincipal("user-hybrid")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "hybrid-docs"})
	require.NoError(t, err)

	key := "files/user-hybrid/report.pdf"
	data := readDocumentFixture(t, "scanned.pdf")
	_, err = artifacts.Put(ctx, key, data, "application/pdf")
	require.NoError(t, err)

	fileStore, err := db.NewFileStore(database)
	require.NoError(t, err)
	f, err := fileStore.Create(ctx, db.CreateFileParams{
		UserID:      principal.User.ID,
		Filename:    "report.pdf",
		ContentType: "application/pdf",
		Size:        int64(len(data)),
		StorageKey:  key,
	})
	require.NoError(t, err)

	_, err = svc.AttachFile(ctx, principal, corpus.ID, f.ID)
	require.NoError(t, err)

	processed, err := svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)
	require.True(t, processed)

	resp, err := svc.Search(ctx, principal, knowledge.SearchParams{
		CorpusID: corpus.ID,
		Query:    "revenue",
		TopK:     5,
	})
	require.NoError(t, err)
	require.NotEmpty(t, resp.Results)
	require.Equal(t, "document_hybrid", resp.Results[0].Metadata["chunker"])
	require.Equal(t, "[3]", resp.Results[0].Metadata["page_numbers"])
	require.Equal(t, "structured", resp.Results[0].Metadata["chunk_profile"])
}

func TestService_ProcessNextIngestionJob_FallsBackWhenHybridChunkingFails(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestServiceWithDocumentReader(t, database, artifacts, fakeFailingHybridReader{}, true)
	principal := testPrincipal("user-hybrid-fallback")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "hybrid-fallback-docs"})
	require.NoError(t, err)

	key := "files/user-hybrid-fallback/report.pdf"
	data := readDocumentFixture(t, "scanned.pdf")
	_, err = artifacts.Put(ctx, key, data, "application/pdf")
	require.NoError(t, err)

	fileStore, err := db.NewFileStore(database)
	require.NoError(t, err)
	f, err := fileStore.Create(ctx, db.CreateFileParams{
		UserID:      principal.User.ID,
		Filename:    "report.pdf",
		ContentType: "application/pdf",
		Size:        int64(len(data)),
		StorageKey:  key,
	})
	require.NoError(t, err)

	_, err = svc.AttachFile(ctx, principal, corpus.ID, f.ID)
	require.NoError(t, err)

	processed, err := svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)
	require.True(t, processed)

	resp, err := svc.Search(ctx, principal, knowledge.SearchParams{
		CorpusID: corpus.ID,
		Query:    "revenue",
		TopK:     5,
	})
	require.NoError(t, err)
	require.NotEmpty(t, resp.Results)
	require.Contains(t, resp.Results[0].Text, "Fallback chunk about revenue")
	require.NotEqual(t, "document_hybrid", resp.Results[0].Metadata["chunker"])
	// The text the native chunker read had the page marked: it knows the chunk is on page 1.
	require.Equal(t, "[1]", resp.Results[0].Metadata["page_numbers"])
}

// By default the document is chunked from the text the native readers wrote, even when an external reader that can
// chunk is configured: the external chunker reads the file again, with its own parser.
func TestService_ProcessNextIngestionJob_ChunksTheNativeTextUnlessTheExternalReaderIsPreferred(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestServiceWithDocumentReader(t, database, artifacts, fakeHybridReader{}, false)
	principal := testPrincipal("user-native-chunks")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "native-chunks"})
	require.NoError(t, err)

	key := "files/user-native-chunks/report.pdf"
	data := readDocumentFixture(t, "text_layer.pdf")
	_, err = artifacts.Put(ctx, key, data, "application/pdf")
	require.NoError(t, err)

	fileStore, err := db.NewFileStore(database)
	require.NoError(t, err)
	f, err := fileStore.Create(ctx, db.CreateFileParams{
		UserID:      principal.User.ID,
		Filename:    "report.pdf",
		ContentType: "application/pdf",
		Size:        int64(len(data)),
		StorageKey:  key,
	})
	require.NoError(t, err)

	_, err = svc.AttachFile(ctx, principal, corpus.ID, f.ID)
	require.NoError(t, err)
	processed, err := svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)
	require.True(t, processed)

	resp, err := svc.Search(ctx, principal, knowledge.SearchParams{CorpusID: corpus.ID, Query: "Sample Report", TopK: 5})
	require.NoError(t, err)
	require.NotEmpty(t, resp.Results)
	require.NotEqual(t, "document_hybrid", resp.Results[0].Metadata["chunker"], "the external chunker must not be used")
	require.NotContains(t, resp.Results[0].Text, "hybrid chunk")
	require.Equal(t, "[1]", resp.Results[0].Metadata["page_numbers"])
	require.NotContains(t, resp.Results[0].Text, "<!--", "a page marker must not reach the indexed text")
}

func TestService_ProcessNextIngestionJob_NoJobs(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)

	processed, err := svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)
	require.False(t, processed, "empty queue must return false")
}

func TestService_Search_AfterIngest(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	principal := testPrincipal("user-5")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "search-kb"})
	require.NoError(t, err)

	fileID := seedFile(t, ctx, database, artifacts, "user-5", "page.txt",
		"The quick brown fox jumps over the lazy dog.\n\nSecond paragraph about AI.")

	_, err = svc.AttachFile(ctx, principal, corpus.ID, fileID)
	require.NoError(t, err)

	_, err = svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)

	resp, err := svc.Search(ctx, principal, knowledge.SearchParams{
		CorpusID: corpus.ID,
		Query:    "fox",
		TopK:     5,
	})
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.Greater(t, len(resp.Results), 0, "should find chunks after ingest")
}

// TestService_Search_DedupesIdenticalChunkText is the regression test for
// the deduplication gap: two files with byte-identical text produce two
// independent chunks that can both legitimately rank in the same top-K for
// a matching query - without dedup, Search returns the same sentence twice.
func TestService_Search_DedupesIdenticalChunkText(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	principal := testPrincipal("user-7")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "dedup-kb"})
	require.NoError(t, err)

	text := "Refunds are processed within 14 business days of the return being received by our warehouse."
	fileID1 := seedFile(t, ctx, database, artifacts, "user-7", "refund-policy.txt", text)
	fileID2 := seedFile(t, ctx, database, artifacts, "user-7", "refund-policy-copy.txt", text)

	_, err = svc.AttachFile(ctx, principal, corpus.ID, fileID1)
	require.NoError(t, err)
	_, err = svc.AttachFile(ctx, principal, corpus.ID, fileID2)
	require.NoError(t, err)

	_, err = svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)
	_, err = svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)

	resp, err := svc.Search(ctx, principal, knowledge.SearchParams{CorpusID: corpus.ID, Query: "refund policy", TopK: 10})
	require.NoError(t, err)

	seen := make(map[string]int)
	for _, r := range resp.Results {
		seen[r.Text]++
	}
	for chunkText, count := range seen {
		require.LessOrEqualf(t, count, 1, "expected each distinct chunk text to appear once, got %q %d times in %+v", chunkText, count, resp.Results)
	}
}

func TestService_DetachFile_ClearsVectors(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	principal := testPrincipal("user-6")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "temp"})
	require.NoError(t, err)

	fileID := seedFile(t, ctx, database, artifacts, "user-6", "temp.txt", "Temporary content.")

	_, err = svc.AttachFile(ctx, principal, corpus.ID, fileID)
	require.NoError(t, err)

	_, err = svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)

	err = svc.DetachFile(ctx, principal, corpus.ID, fileID)
	require.NoError(t, err)

	files, err := svc.ListFiles(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Empty(t, files, "file should be removed from corpus after detach")
}

// ─── Permission filter tests (roadmap.md Phase 1) ─────────────────────────────

func TestService_CheckAccess_WorkspaceMemberCanSearch(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	owner := testPrincipalInWorkspace("owner-1", "ws-1")

	corpus, err := svc.CreateCorpus(ctx, owner, knowledge.CreateCorpusParams{Name: "shared kb", WorkspaceID: "ws-1"})
	require.NoError(t, err)

	fileID := seedFile(t, ctx, database, artifacts, "owner-1", "page.txt", "The quick brown fox jumps over the lazy dog.")
	_, err = svc.AttachFile(ctx, owner, corpus.ID, fileID)
	require.NoError(t, err)
	_, err = svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)

	// A different user, member of the same workspace but not the owner,
	// must be able to see and search the corpus.
	teammate := testPrincipalInWorkspace("teammate-1", "ws-1")
	_, err = svc.GetCorpus(ctx, teammate, corpus.ID)
	require.NoError(t, err, "workspace member must be able to access a shared corpus")

	resp, err := svc.Search(ctx, teammate, knowledge.SearchParams{CorpusID: corpus.ID, Query: "fox", TopK: 5})
	require.NoError(t, err)
	require.Greater(t, len(resp.Results), 0, "workspace member must see workspace-scoped chunks")

	// A user outside the workspace must be denied.
	outsider := testPrincipal("outsider-1")
	_, err = svc.GetCorpus(ctx, outsider, corpus.ID)
	require.Error(t, err, "non-member must not access a workspace corpus they don't belong to")
}

func TestService_CheckAccess_AdminHasNoRAGBypass(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	owner := testPrincipal("owner-2")

	corpus, err := svc.CreateCorpus(ctx, owner, knowledge.CreateCorpusParams{Name: "private kb"})
	require.NoError(t, err)

	admin := testAdminPrincipal("admin-1")
	_, err = svc.GetCorpus(ctx, admin, corpus.ID)
	require.Error(t, err, "admin must not get a blanket bypass onto another user's personal corpus")

	var bkErr *bkerr.Error
	require.ErrorAs(t, err, &bkErr)
	require.Equal(t, bkerr.ErrorKindForbidden, bkErr.Kind)
}

func TestService_IngestExternal_MultiIdentityACL(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	// checkAccess gates the whole corpus first (ownership or workspace
	// membership) - per-chunk ACL can only narrow further within what that
	// already allows, never grant access beyond it (see checkAccess's own
	// doc comment). So testing the ACL's differentiating power requires two
	// principals who both clear the corpus-level gate via a shared
	// workspace, then differ at the chunk level.
	owner := testPrincipalInWorkspace("owner-3", "ws-conn")
	teammate := testPrincipalInWorkspace("teammate-3", "ws-conn")

	corpus, err := svc.CreateCorpus(ctx, owner, knowledge.CreateCorpusParams{Name: "connector kb", WorkspaceID: "ws-conn"})
	require.NoError(t, err)

	// A resource shared with two identities at once - mirrors a Google
	// Drive file shared with a specific user plus a group, though here
	// using real resolvable identities (user IDs) rather than opaque
	// prefixed strings, since that's what Search() actually checks a
	// principal against today.
	_, err = svc.IngestExternal(ctx, owner, knowledge.ExternalIngestParams{
		CorpusID:      corpus.ID,
		ExternalID:    "gdrive-shared-file",
		Filename:      "shared.txt",
		Text:          "alpha content shared with owner and teammate",
		AccessControl: []string{"owner-3", "teammate-3"},
	})
	require.NoError(t, err)

	_, err = svc.IngestExternal(ctx, owner, knowledge.ExternalIngestParams{
		CorpusID:      corpus.ID,
		ExternalID:    "gdrive-private-file",
		Filename:      "private.txt",
		Text:          "alpha content private to the owner only",
		AccessControl: []string{"owner-3"},
	})
	require.NoError(t, err)

	// corpus_files bookkeeping works for connector-sourced content exactly
	// like uploaded files - both show up ingested with a chunk count.
	files, err := svc.ListFiles(ctx, owner, corpus.ID)
	require.NoError(t, err)
	require.Len(t, files, 2)
	for _, f := range files {
		require.Equal(t, db.CorpusFileStatusIngested, f.Status)
		require.Greater(t, f.ChunkCount, 0)
	}

	// The teammate is entitled to shared-file only.
	resp, err := svc.Search(ctx, teammate, knowledge.SearchParams{CorpusID: corpus.ID, Query: "alpha", TopK: 10})
	require.NoError(t, err)
	require.Len(t, resp.Results, 1)
	require.Equal(t, "shared.txt", resp.Results[0].Metadata["filename"])

	// The owner is entitled to both.
	resp, err = svc.Search(ctx, owner, knowledge.SearchParams{CorpusID: corpus.ID, Query: "alpha", TopK: 10})
	require.NoError(t, err)
	require.Len(t, resp.Results, 2)

	// An unrelated user has no access to the corpus at all (checkAccess
	// gates first), independent of the per-chunk ACL.
	_, err = svc.Search(ctx, testPrincipal("outsider-3"), knowledge.SearchParams{CorpusID: corpus.ID, Query: "alpha", TopK: 10})
	require.Error(t, err)
}

func TestService_IngestExternal_EmptyACLFallsBackToCorpusScope(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	owner := testPrincipal("owner-4")

	corpus, err := svc.CreateCorpus(ctx, owner, knowledge.CreateCorpusParams{Name: "connector kb 2"})
	require.NoError(t, err)

	_, err = svc.IngestExternal(ctx, owner, knowledge.ExternalIngestParams{
		CorpusID:   corpus.ID,
		ExternalID: "gdrive-unscoped-file",
		Filename:   "unscoped.txt",
		Text:       "alpha content with no explicit access control",
		// AccessControl deliberately omitted.
	})
	require.NoError(t, err)

	resp, err := svc.Search(ctx, owner, knowledge.SearchParams{CorpusID: corpus.ID, Query: "alpha", TopK: 10})
	require.NoError(t, err)
	require.Len(t, resp.Results, 1, "empty AccessControl must fall back to the corpus owner's scope, not vanish")
}

// ─── Runner tests ─────────────────────────────────────────────────────────────

func TestRunner_ProcessesAllPendingJobs(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)
	principal := testPrincipal("user-r1")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "runner-kb"})
	require.NoError(t, err)

	// Seed three files.
	for i, text := range []string{
		"First document content.",
		"Second document content.",
		"Third document content.",
	} {
		name := filepath.Join("file", string(rune('a'+i))+".txt")
		fileID := seedFile(t, ctx, database, artifacts, "user-r1", name, text)
		_, err = svc.AttachFile(ctx, principal, corpus.ID, fileID)
		require.NoError(t, err)
	}

	runner := knowledge.NewRunner(svc, knowledge.RunnerConfig{
		PollInterval:    20 * time.Millisecond,
		MaxPollInterval: 200 * time.Millisecond,
		MaxPerTick:      4,
	})
	runner.Start(ctx)

	// Wait until all three jobs are completed.
	require.Eventually(t, func() bool {
		jobs, err := svc.ListIngestionJobs(ctx, principal, corpus.ID)
		if err != nil || len(jobs) != 3 {
			return false
		}
		for _, j := range jobs {
			if j.Status != db.IngestionJobStatusCompleted {
				return false
			}
		}
		return true
	}, 8*time.Second, 50*time.Millisecond, "runner must process all 3 jobs")
}

func TestRunner_StopsOnContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newTestService(t, database, artifacts)

	runner := knowledge.NewRunner(svc, knowledge.RunnerConfig{
		PollInterval:    20 * time.Millisecond,
		MaxPollInterval: 100 * time.Millisecond,
	})
	runner.Start(ctx)

	cancel()
	// Give the goroutine a moment to exit; the test just checks no panic/hang.
	time.Sleep(50 * time.Millisecond)
}
