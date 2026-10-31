package knowledge

import (
	"context"
	"errors"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat-runtime/pkg/rag/embedder"
)

// QuotaPausedPrefix starts the last error of a job that waits for the quota of the embedding provider; the page reads it to say that the
// queue is paused and not that a document failed.
const QuotaPausedPrefix = "Paused:"

const (
	// What the queue waits when the provider refuses for quota and did not say for how long.
	defaultQuotaPause = time.Minute
	// A daily quota does not come back in a minute; the queue looks again after this, and the person can change the provider before.
	dailyQuotaPause = time.Hour
	minQuotaPause   = 5 * time.Second
)

// finishFailedJob records why a job did not complete. A refusal for quota is not a failure of the document: the job goes back to waiting
// without using an attempt, and the whole queue pauses, so that the next document is not started only to be refused too. Anything else
// is a failure, retried as before and then left failed.
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
	if limited.Daily {
		return dailyQuotaPause, QuotaPausedPrefix + " the daily quota of the embedding provider is used up. Indexing goes on by itself; change the provider in Settings to go on now."
	}
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

// isQuotaRefusal reports whether an error is a refusal for quota, so that a file is not marked as failed because of it.
func isQuotaRefusal(err error) bool {
	var limited *embedder.RateLimitedError
	return errors.As(err, &limited)
}
