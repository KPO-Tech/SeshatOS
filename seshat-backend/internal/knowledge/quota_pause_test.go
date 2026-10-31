package knowledge_test

import (
	"context"
	"errors"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
	"github.com/KPO-Tech/seshat-runtime/pkg/rag"
	"github.com/KPO-Tech/seshat-runtime/pkg/rag/embedder"
	"github.com/KPO-Tech/seshat-runtime/pkg/storage"
	"github.com/KPO-Tech/seshat-runtime/pkg/vector"
)

// quotaEmbedder refuses for quota `refusals` times, then embeds.
type quotaEmbedder struct {
	refusals int32
	calls    atomic.Int32
	err      error
}

func (q *quotaEmbedder) EmbedTexts(_ context.Context, texts []string) ([][]float32, error) {
	if q.calls.Add(1) <= q.refusals {
		return nil, q.err
	}
	return fakeEmbedder{}.EmbedTexts(context.Background(), texts)
}

func newQuotaService(t *testing.T, database *db.DB, artifacts storage.ArtifactStore, emb rag.Embedder) *knowledge.Service {
	t.Helper()
	corpusStore, err := db.NewCorpusStore(database)
	require.NoError(t, err)
	fileStore, err := db.NewFileStore(database)
	require.NoError(t, err)
	jobStore, err := db.NewKnowledgeIngestionJobStore(database)
	require.NoError(t, err)
	return knowledge.NewService(corpusStore, fileStore, jobStore, artifacts, rag.NewService(artifacts, vector.NewMemoryStore(), emb, nil))
}

func TestARefusalForQuotaKeepsTheDocumentWaitingAndPausesTheQueue(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	limited := &embedder.RateLimitedError{Status: 429, Body: "slow down", RetryAfter: 30 * time.Second}
	svc := newQuotaService(t, database, artifacts, &quotaEmbedder{refusals: 1, err: limited})
	principal := testPrincipal("user-q")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "kb"})
	require.NoError(t, err)
	for _, name := range []string{"a.txt", "b.txt"} {
		fileID := seedFile(t, ctx, database, artifacts, "user-q", name, "Some text.\n\nMore text.")
		_, err = svc.AttachFile(ctx, principal, corpus.ID, fileID)
		require.NoError(t, err)
	}

	processed, err := svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)
	require.True(t, processed)

	jobs, err := svc.ListIngestionJobs(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Len(t, jobs, 2)
	var waiting *knowledge.IngestionJob
	for i := range jobs {
		if strings.HasPrefix(jobs[i].LastError, knowledge.QuotaPausedPrefix) {
			waiting = &jobs[i]
		}
	}
	require.NotNil(t, waiting, "the refused job says why it waits")
	require.Equal(t, db.IngestionJobStatusPending, waiting.Status)
	require.Zero(t, waiting.AttemptCount, "a refusal for quota does not use an attempt")
	require.NotNil(t, waiting.NextRunAt)
	require.WithinDuration(t, time.Now().Add(30*time.Second), *waiting.NextRunAt, 3*time.Second)

	files, err := svc.ListFiles(ctx, principal, corpus.ID)
	require.NoError(t, err)
	for _, f := range files {
		require.NotEqual(t, db.CorpusFileStatusFailed, f.Status, "no document is marked as failed for a quota")
	}

	// The queue is paused: the second document is not started only to be refused too.
	processed, err = svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)
	require.False(t, processed, "the queue must wait while the provider refuses")
}

func TestADailyQuotaPausesForLongerAndSaysSo(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	limited := &embedder.RateLimitedError{Status: 429, Body: "free-models-per-day", Daily: true}
	svc := newQuotaService(t, database, artifacts, &quotaEmbedder{refusals: 1, err: limited})
	principal := testPrincipal("user-d")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "kb"})
	require.NoError(t, err)
	fileID := seedFile(t, ctx, database, artifacts, "user-d", "a.txt", "Some text.")
	_, err = svc.AttachFile(ctx, principal, corpus.ID, fileID)
	require.NoError(t, err)

	_, err = svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)
	jobs, err := svc.ListIngestionJobs(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Len(t, jobs, 1)
	require.Contains(t, jobs[0].LastError, "daily quota")
	require.NotNil(t, jobs[0].NextRunAt)
	require.True(t, jobs[0].NextRunAt.After(time.Now().Add(30*time.Minute)), "a daily quota is not looked at again in a minute")
}

func TestAnotherEmbeddingErrorStillFailsTheDocument(t *testing.T) {
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newQuotaService(t, database, artifacts, &quotaEmbedder{refusals: 100, err: errors.New("embedding API returned 401: bad key")})
	principal := testPrincipal("user-f")

	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "kb"})
	require.NoError(t, err)
	fileID := seedFile(t, ctx, database, artifacts, "user-f", "a.txt", "Some text.")
	_, err = svc.AttachFile(ctx, principal, corpus.ID, fileID)
	require.NoError(t, err)

	_, err = svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)
	jobs, err := svc.ListIngestionJobs(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Len(t, jobs, 1)
	require.Equal(t, 1, jobs[0].AttemptCount, "an ordinary failure uses its attempt")
	require.False(t, strings.HasPrefix(jobs[0].LastError, knowledge.QuotaPausedPrefix))
	files, err := svc.ListFiles(ctx, principal, corpus.ID)
	require.NoError(t, err)
	require.Equal(t, db.CorpusFileStatusFailed, files[0].Status)
}
