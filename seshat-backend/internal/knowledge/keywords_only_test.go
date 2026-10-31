package knowledge_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
	"github.com/KPO-Tech/seshat-runtime/pkg/rag/embedder"
)

func ingestOne(t *testing.T, emb *quotaEmbedder, text string) (*knowledge.Service, *db.DB, string, string, context.Context) {
	t.Helper()
	ctx := context.Background()
	database := openTestDB(t)
	artifacts := newTestArtifactStore(t)
	svc := newQuotaService(t, database, artifacts, emb)
	principal := testPrincipal("user-k")
	corpus, err := svc.CreateCorpus(ctx, principal, knowledge.CreateCorpusParams{Name: "kb"})
	require.NoError(t, err)
	fileID := seedFile(t, ctx, database, artifacts, "user-k", "a.txt", text)
	_, err = svc.AttachFile(ctx, principal, corpus.ID, fileID)
	require.NoError(t, err)
	_, err = svc.ProcessNextIngestionJob(ctx)
	require.NoError(t, err)
	return svc, database, corpus.ID, fileID, ctx
}

func TestADocumentWhoseEmbeddingFailsIsKeptForKeywordsOnly(t *testing.T) {
	svc, _, corpusID, _, ctx := ingestOne(t, &quotaEmbedder{refusals: 100, err: errors.New("embedding API returned 401: bad key")}, "The quick brown fox jumps over the lazy dog.\n\nSecond paragraph about AI.")
	principal := testPrincipal("user-k")

	jobs, err := svc.ListIngestionJobs(ctx, principal, corpusID)
	require.NoError(t, err)
	require.Len(t, jobs, 1)
	require.Equal(t, db.IngestionJobStatusCompleted, jobs[0].Status, "the reading worked: the document does not fail for its embedding")
	require.Equal(t, 1, jobs[0].AttemptCount)
	require.Greater(t, jobs[0].ChunkCount, 0)

	files, err := svc.ListFiles(ctx, principal, corpusID)
	require.NoError(t, err)
	require.Len(t, files, 1)
	require.Equal(t, db.CorpusFileStatusIngested, files[0].Status)
	require.True(t, files[0].KeywordsOnly)
	require.Contains(t, files[0].KeywordsReason, "bad key")

	// It is found by its words, though the embedder still fails for the query too.
	found, err := svc.Search(ctx, principal, knowledge.SearchParams{CorpusID: corpusID, Query: "fox", TopK: 5})
	require.NoError(t, err)
	require.NotEmpty(t, found.Results, "a document kept for keywords only must be found by them")
}

func TestADailyQuotaKeepsTheDocumentForKeywordsAndSaysSo(t *testing.T) {
	limited := &embedder.RateLimitedError{Status: 429, Body: "free-models-per-day", Daily: true}
	svc, _, corpusID, _, ctx := ingestOne(t, &quotaEmbedder{refusals: 100, err: limited}, "Some text.")
	principal := testPrincipal("user-k")

	files, err := svc.ListFiles(ctx, principal, corpusID)
	require.NoError(t, err)
	require.True(t, files[0].KeywordsOnly)
	require.Contains(t, files[0].KeywordsReason, "daily quota")
	jobs, err := svc.ListIngestionJobs(ctx, principal, corpusID)
	require.NoError(t, err)
	require.Equal(t, db.IngestionJobStatusCompleted, jobs[0].Status)
	require.False(t, strings.HasPrefix(jobs[0].LastError, knowledge.QuotaPausedPrefix), "a daily quota is not a pause")
}

func TestAQuotaThatAWaitMendsIsStillAPauseAndNotKeywordsOnly(t *testing.T) {
	limited := &embedder.RateLimitedError{Status: 429, Body: "slow down"}
	svc, _, corpusID, _, ctx := ingestOne(t, &quotaEmbedder{refusals: 100, err: limited}, "Some text.")
	principal := testPrincipal("user-k")

	files, err := svc.ListFiles(ctx, principal, corpusID)
	require.NoError(t, err)
	require.False(t, files[0].KeywordsOnly)
	require.NotEqual(t, db.CorpusFileStatusIngested, files[0].Status)
	jobs, err := svc.ListIngestionJobs(ctx, principal, corpusID)
	require.NoError(t, err)
	require.Equal(t, db.IngestionJobStatusPending, jobs[0].Status)
	require.True(t, strings.HasPrefix(jobs[0].LastError, knowledge.QuotaPausedPrefix))
}

func TestIndexingAgainWithTheVectorsClearsTheMark(t *testing.T) {
	// The embedder fails once for a reason that is not a quota, then works.
	svc, _, corpusID, fileID, ctx := ingestOne(t, &quotaEmbedder{refusals: 1, err: errors.New("embedding API returned 401: bad key")}, "Some text.\n\nMore text.")
	principal := testPrincipal("user-k")

	files, err := svc.ListFiles(ctx, principal, corpusID)
	require.NoError(t, err)
	require.True(t, files[0].KeywordsOnly)

	_, err = svc.Ingest(ctx, principal, knowledge.IngestParams{CorpusID: corpusID, FileID: fileID})
	require.NoError(t, err)
	files, err = svc.ListFiles(ctx, principal, corpusID)
	require.NoError(t, err)
	require.False(t, files[0].KeywordsOnly, "a document indexed again with its vectors is no longer keywords only")
	require.Empty(t, files[0].KeywordsReason)
}
