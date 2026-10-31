package knowledge_test

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
	"github.com/KPO-Tech/seshat-runtime/pkg/documentreader"
	"github.com/KPO-Tech/seshat-runtime/pkg/rag"
	"github.com/KPO-Tech/seshat-runtime/pkg/storage"
	"github.com/KPO-Tech/seshat-runtime/pkg/vector"
)

// concurrencyProbe counts how many callers are inside at once, and the most that were.
type concurrencyProbe struct{ now, most atomic.Int32 }

func (p *concurrencyProbe) enter() func() {
	n := p.now.Add(1)
	for {
		m := p.most.Load()
		if n <= m || p.most.CompareAndSwap(m, n) {
			break
		}
	}
	return func() { p.now.Add(-1) }
}

// probedEmbedder is an embedder that takes a moment, so that callers that overlap are seen overlapping.
type probedEmbedder struct{ probe concurrencyProbe }

func (e *probedEmbedder) EmbedTexts(_ context.Context, texts []string) ([][]float32, error) {
	defer e.probe.enter()()
	time.Sleep(5 * time.Millisecond)
	out := make([][]float32, len(texts))
	for i := range texts {
		out[i] = []float32{1, 0, 0}
	}
	return out, nil
}

// probedReader is an external reader that takes a moment, so that reads that overlap are seen overlapping.
type probedReader struct{ probe concurrencyProbe }

func (r *probedReader) IsAvailable(context.Context) bool { return true }
func (r *probedReader) ConvertFile(context.Context, string) (*documentreader.ConversionResult, error) {
	return r.convert()
}
func (r *probedReader) ConvertBytes(context.Context, []byte, string) (*documentreader.ConversionResult, error) {
	return r.convert()
}
func (r *probedReader) ConvertURL(context.Context, string) (*documentreader.ConversionResult, error) {
	return r.convert()
}
func (r *probedReader) convert() (*documentreader.ConversionResult, error) {
	defer r.probe.enter()()
	time.Sleep(10 * time.Millisecond)
	return &documentreader.ConversionResult{Markdown: "Converted text of a document.\n\nA second paragraph."}, nil
}

func seedAndAttach(t *testing.T, ctx context.Context, database *db.DB, artifacts storage.ArtifactStore, svc *knowledge.Service, corpusID, userID string, count int, ext string) {
	t.Helper()
	principal := testPrincipal(userID)
	for i := 0; i < count; i++ {
		fileID := seedFile(t, ctx, database, artifacts, userID, fmt.Sprintf("doc-%02d.%s", i, ext), fmt.Sprintf("Document number %d.\n\nSome more text.", i))
		_, err := svc.AttachFile(ctx, principal, corpusID, fileID)
		require.NoError(t, err)
	}
}

func TestSeveralWorkersCompleteEveryJobExactlyOnce(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	emb := &probedEmbedder{}
	corpusStore, _ := db.NewCorpusStore(database)
	fileStore, _ := db.NewFileStore(database)
	jobStore, _ := db.NewKnowledgeIngestionJobStore(database)
	svc := knowledge.NewService(corpusStore, fileStore, jobStore, artifacts, rag.NewService(artifacts, vector.NewMemoryStore(), emb, nil))
	principal := testPrincipal("user-w")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "kb"})
	require.NoError(t, err)
	const count = 40
	seedAndAttach(t, ctx, database, artifacts, svc, corpus.ID, "user-w", count, "txt")

	knowledge.NewRunner(svc, knowledge.RunnerConfig{Workers: 4}).Run(ctx)

	jobs, err := svc.ListIngestionJobs(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Len(t, jobs, count)
	for _, job := range jobs {
		require.Equal(t, db.IngestionJobStatusCompleted, job.Status, job.Filename)
		require.Equal(t, 1, job.AttemptCount, "%s was taken by more than one worker", job.Filename)
	}
	files, err := svc.ListFiles(ctx, principal, corpus.ID)
	require.NoError(t, err)
	for _, f := range files {
		require.Equal(t, db.CorpusFileStatusIngested, f.Status)
	}
	require.EqualValues(t, 1, emb.probe.most.Load(), "the provider must see one request at a time, however many documents are read")
}

func TestReadsThroughAnExternalReaderStayOneAtATime(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	reader := &probedReader{}
	svc := newTestServiceWithDocumentReader(t, database, artifacts, reader, true)
	principal := testPrincipal("user-x")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "kb"})
	require.NoError(t, err)
	seedAndAttach(t, ctx, database, artifacts, svc, corpus.ID, "user-x", 12, "png")

	knowledge.NewRunner(svc, knowledge.RunnerConfig{Workers: 4}).Run(ctx)

	jobs, err := svc.ListIngestionJobs(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Len(t, jobs, 12)
	for _, job := range jobs {
		require.Equal(t, db.IngestionJobStatusCompleted, job.Status, "%s: %s", job.Filename, job.LastError)
	}
	require.EqualValues(t, 1, reader.probe.most.Load(), "an external reader is given one document at a time")
}

func TestTheWorkersFollowTheVariableAndTheCores(t *testing.T) {
	t.Setenv("SESHAT_INGEST_WORKERS", "3")
	require.Equal(t, 3, knowledge.IngestWorkers())
	t.Setenv("SESHAT_INGEST_WORKERS", "999")
	require.Equal(t, 16, knowledge.IngestWorkers(), "a typing mistake does not start hundreds of readers")
	t.Setenv("SESHAT_INGEST_WORKERS", "not a number")
	got := knowledge.IngestWorkers()
	require.GreaterOrEqual(t, got, 1)
	require.LessOrEqual(t, got, 4)
}
