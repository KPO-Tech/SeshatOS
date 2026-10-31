package knowledge

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat-runtime/pkg/rag"
	"github.com/KPO-Tech/seshat-runtime/pkg/rag/embedder"
)

// QuotaPausedPrefix starts the last error of a job that waits for the quota of the embedding provider; the page reads it to say that the
// queue is paused and not that a document failed.
const QuotaPausedPrefix = "Paused:"

const (
	// What the queue waits when the provider refuses for quota and did not say for how long.
	defaultQuotaPause = time.Minute
	minQuotaPause     = 5 * time.Second
)

// finishFailedJob records why a job did not complete. A refusal for quota that a wait mends is not a failure of the document: the job
// goes back to waiting without using an attempt, and the whole queue pauses, so that the next document is not started only to be refused
// too. Anything else is a failure, retried as before and then left failed.
func (s *Service) finishFailedJob(ctx context.Context, job db.KnowledgeIngestionJob, err error) {
	var limited *embedder.RateLimitedError
	if !errors.As(err, &limited) {
		_ = s.jobs.MarkFailed(ctx, job, err, defaultIngestionRetryDelay)
		return
	}
	wait, message := quotaPause(limited)
	_ = s.jobs.MarkRateLimited(ctx, job, wait, message)
	s.pausedUntil.Store(time.Now().Add(wait).UnixNano())
}

// quotaPause is how long the queue waits for a refusal for quota, and what the page says about it.
func quotaPause(limited *embedder.RateLimitedError) (time.Duration, string) {
	wait := limited.RetryAfter
	if wait <= 0 {
		wait = defaultQuotaPause
	}
	return max(wait, minQuotaPause), QuotaPausedPrefix + " the quota of the embedding provider is used up. Indexing goes on by itself."
}

// quotaPausedFor is how long the queue still waits, zero when it is running.
func (s *Service) quotaPausedFor() time.Duration {
	until := s.pausedUntil.Load()
	if until == 0 {
		return 0
	}
	return max(0, time.Until(time.Unix(0, until)))
}

// isQuotaRefusal reports whether an error is a refusal for quota that a wait mends, so that a file is not marked as failed because of it.
func isQuotaRefusal(err error) bool {
	var limited *embedder.RateLimitedError
	return errors.As(err, &limited) && !limited.Daily
}

// keywordsFallback decides what to do with a document whose ingestion failed: when the embedder is what failed, and waiting does not mend
// it (a wrong key, a model that is gone, a daily quota, a provider that is down), the document is kept for keywords only, and the reason
// is returned for the page to show. A refusal for quota that a wait mends is a pause (see finishFailedJob), a cancelled run is not a
// failure of the embedding, and a failure of reading, chunking or storing is a failure of the document.
func keywordsFallback(ctx context.Context, err error) (reason string, fallBack bool) {
	if err == nil || ctx.Err() != nil {
		return "", false
	}
	var embedding *rag.EmbeddingError
	if !errors.As(err, &embedding) {
		return "", false
	}
	if isQuotaRefusal(err) {
		return "", false
	}
	var limited *embedder.RateLimitedError
	if errors.As(err, &limited) && limited.Daily {
		return "the daily quota of the embedding provider is used up", true
	}
	return "the embedding provider refused: " + oneLine(err.Error(), 200), true
}

// oneLine shortens a provider's message to a line of at most n characters.
func oneLine(text string, n int) string {
	text = strings.Join(strings.Fields(text), " ")
	if len(text) > n {
		return text[:n] + "..."
	}
	return text
}
