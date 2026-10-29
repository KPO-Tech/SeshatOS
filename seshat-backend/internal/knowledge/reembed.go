package knowledge

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat-runtime/pkg/vector"
)

// Re-embedding: the passages of the collections keep their text, and only their vectors are made again, with the model now in use. The
// documents are not read again and not cut again, so it takes minutes where indexing took hours, and it works even for a file that
// has moved since. It is needed because the vectors of a collection belong to the model that made them: a question embedded by
// another model is compared with them as if they were of the same kind, and the search by meaning finds the wrong passages.

// embeddedWith marks a passage whose vector was made with the model it names. It is what lets a re-embedding that stopped (a quota,
// a closed app) go on where it was instead of starting over.
const embeddedWith = "embedded_with"

const reembedBatchSize = 16

// reembedWorkers is how many batches are made at once. A variable so that tests can make them one at a time.
var reembedWorkers = 3

// reembedBackoff is how long a batch waits before it is tried again after the embedding service refused it (a quota, a busy
// service). A variable so that tests do not wait.
var reembedBackoff = []time.Duration{2 * time.Second, 5 * time.Second, 15 * time.Second, 30 * time.Second, 60 * time.Second}

// ReembedStatus is what the screen shows of a re-embedding.
type ReembedStatus struct {
	// State is "idle" (none since the app started), "running", "done", "failed" or "cancelled".
	State string `json:"state"`
	// Model names the embedding model the vectors are being made with.
	Model string `json:"model,omitempty"`
	// Done and Total count passages; Total is the number the collections hold.
	Done  int    `json:"done"`
	Total int    `json:"total"`
	Error string `json:"error,omitempty"`
}

// vectorRecords is what a re-embedding needs of a vector store.
type vectorRecords interface {
	Get(ctx context.Context, namespace string, keys []string) ([]vector.Record, error)
	Upsert(ctx context.Context, records []vector.Record) error
}

type reembedJob struct {
	mu     sync.Mutex
	status ReembedStatus
	cancel context.CancelFunc
}

func (j *reembedJob) snapshot() ReembedStatus {
	j.mu.Lock()
	defer j.mu.Unlock()
	return j.status
}

func (j *reembedJob) update(change func(*ReembedStatus)) {
	j.mu.Lock()
	defer j.mu.Unlock()
	change(&j.status)
}

// WithLiveEmbedder gives the service the embedder of the app, which a re-embedding uses to make the new vectors, and a function to call
// with the key of the model once every vector was made with it.
func (s *Service) WithLiveEmbedder(live *LiveEmbedder, done func(ctx context.Context, key string)) *Service {
	s.live = live
	s.reembedDone = done
	return s
}

// ReembedStatus reports the re-embedding in progress or the last one.
func (s *Service) ReembedStatus() ReembedStatus {
	s.reembedMu.Lock()
	job := s.reembed
	s.reembedMu.Unlock()
	if job == nil {
		return ReembedStatus{State: "idle"}
	}
	return job.snapshot()
}

// CancelReembed stops the re-embedding in progress. What was done stays done.
func (s *Service) CancelReembed() {
	s.reembedMu.Lock()
	job := s.reembed
	s.reembedMu.Unlock()
	if job != nil && job.cancel != nil {
		job.cancel()
	}
}

// StartReembed makes the vectors of every collection of the person again with the model now in use, in the background. One runs at a
// time: asking while one runs returns its status.
func (s *Service) StartReembed(principal *backendauth.Principal) (ReembedStatus, error) {
	if s == nil || s.corpora == nil || s.rag == nil || s.rag.Vectors() == nil {
		return ReembedStatus{}, bkerr.Unavailable("the knowledge store is not available", nil)
	}
	if s.live == nil || s.live.Key() == "" {
		return ReembedStatus{}, bkerr.InvalidInput(ErrNoEmbedder.Error(), ErrNoEmbedder)
	}
	if principal == nil {
		return ReembedStatus{}, bkerr.Unauthorized("unauthorized", nil)
	}

	s.reembedMu.Lock()
	defer s.reembedMu.Unlock()
	if s.reembed != nil && s.reembed.snapshot().State == "running" {
		return s.reembed.snapshot(), nil
	}

	ctx, cancel := context.WithCancel(context.Background())
	corpora, err := s.corpora.ListByUserID(ctx, principal.User.ID)
	if err != nil {
		cancel()
		return ReembedStatus{}, bkerr.Internal("list collections: "+err.Error(), err)
	}
	total := 0
	ids := make([]string, 0, len(corpora))
	for _, corpus := range corpora {
		ids = append(ids, corpus.ID)
		files, err := s.corpora.ListFiles(ctx, corpus.ID)
		if err != nil {
			cancel()
			return ReembedStatus{}, bkerr.Internal("list files: "+err.Error(), err)
		}
		for _, file := range files {
			if file.Status == db.CorpusFileStatusIngested {
				total += file.ChunkCount
			}
		}
	}
	key := s.live.Key()
	job := &reembedJob{cancel: cancel, status: ReembedStatus{State: "running", Model: key, Total: total}}
	s.reembed = job
	go s.runReembed(ctx, job, ids, key)
	return job.snapshot(), nil
}

func (s *Service) runReembed(ctx context.Context, job *reembedJob, namespaces []string, key string) {
	defer job.cancel()
	store := s.rag.Vectors()
	var failure error
	for _, namespace := range namespaces {
		if failure = reembedNamespace(ctx, store, s.live, namespace, key, func(n int) { job.update(func(st *ReembedStatus) { st.Done += n }) }); failure != nil {
			break
		}
	}
	job.update(func(st *ReembedStatus) {
		switch {
		case failure == nil:
			st.State, st.Done = "done", max(st.Done, st.Total)
		case ctx.Err() != nil:
			st.State = "cancelled"
		default:
			st.State, st.Error = "failed", failure.Error()
		}
	})
	if failure == nil && s.reembedDone != nil {
		s.reembedDone(context.Background(), key)
	}
	if failure != nil && ctx.Err() == nil {
		log.Printf("[knowledge] re-embedding stopped: %v", failure)
	}
}

// reembedNamespace makes the vectors of the passages of one collection again, a few at a time. The passages already made with this
// model are left as they are. report is told how many were done after each batch (the ones left as they are count too).
func reembedNamespace(ctx context.Context, store vectorRecords, embedder Embedder, namespace, key string, report func(done int)) error {
	records, err := store.Get(ctx, namespace, nil)
	if err != nil {
		return fmt.Errorf("read the passages: %w", err)
	}
	var todo []vector.Record
	for _, record := range records {
		if record.Metadata[embeddedWith] == key {
			continue
		}
		if strings.TrimSpace(record.Text) == "" {
			continue
		}
		todo = append(todo, record)
	}
	log.Printf("[knowledge] re-embedding %s: %d of %d passages to make", namespace, len(todo), len(records))
	// What is already made counts as done, so that a re-embedding that goes on shows where it was.
	report(len(records) - len(todo))

	// A few batches go at once: a remote model answers in seconds, so one at a time leaves most of the time waiting. The first batch that
	// cannot be made stops the others.
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	var (
		wg       sync.WaitGroup
		mu       sync.Mutex // guards the first error and the writes to the store
		firstErr error
	)
	batches := make(chan []vector.Record)
	for range reembedWorkers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for batch := range batches {
				if err := reembedBatch(ctx, store, embedder, batch, key, &mu); err != nil {
					mu.Lock()
					if firstErr == nil {
						firstErr = err
						cancel()
					}
					mu.Unlock()
					continue
				}
				report(len(batch))
			}
		}()
	}
feed:
	for start := 0; start < len(todo); start += reembedBatchSize {
		select {
		case batches <- todo[start:min(start+reembedBatchSize, len(todo))]:
		case <-ctx.Done():
			break feed
		}
	}
	close(batches)
	wg.Wait()
	if firstErr != nil {
		return firstErr
	}
	return ctx.Err()
}

// reembedBatch makes the vectors of a few passages and saves them. Saving goes one batch at a time (mu).
func reembedBatch(ctx context.Context, store vectorRecords, embedder Embedder, batch []vector.Record, key string, mu *sync.Mutex) error {
	texts := make([]string, len(batch))
	for i, record := range batch {
		texts[i] = record.Text
	}
	vectors, err := embedWithRetry(ctx, embedder, texts)
	if err != nil {
		return err
	}
	out := make([]vector.Record, len(batch))
	for i, record := range batch {
		metadata := make(map[string]string, len(record.Metadata)+1)
		for k, v := range record.Metadata {
			metadata[k] = v
		}
		metadata[embeddedWith] = key
		out[i] = vector.Record{Namespace: record.Namespace, Key: record.Key, Text: record.Text, Vector: vectors[i], Metadata: metadata}
	}
	mu.Lock()
	defer mu.Unlock()
	if err := store.Upsert(ctx, out); err != nil {
		return fmt.Errorf("save the vectors: %w", err)
	}
	return nil
}

func embedWithRetry(ctx context.Context, embedder Embedder, texts []string) ([][]float32, error) {
	var last error
	for attempt := 0; ; attempt++ {
		vectors, err := embedder.EmbedTexts(ctx, texts)
		if err == nil && len(vectors) == len(texts) {
			return vectors, nil
		}
		if err == nil {
			err = fmt.Errorf("the embedding service returned %d vectors for %d passages", len(vectors), len(texts))
		}
		last = err
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		// A daily limit does not lift in a minute: trying again would only make the person wait to be told.
		if isDailyLimit(err) {
			return nil, errDailyLimit
		}
		log.Printf("[knowledge] re-embedding: the embedding service refused a batch (try %d): %v", attempt+1, err)
		if attempt >= len(reembedBackoff) {
			return nil, fmt.Errorf("the embedding service kept refusing (%d tries): %w", attempt+1, last)
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(reembedBackoff[attempt]):
		}
	}
}

// errDailyLimit is what a re-embedding says when the service refuses for the rest of the day, as the free models of OpenRouter do after
// 50 requests (1,000 once the account holds credits).
var errDailyLimit = errors.New("the embedding service has reached its limit for the day (the free models of OpenRouter allow 50 requests a day, 1,000 with credits). Choose a model that is not free, add credits, or continue tomorrow")

func isDailyLimit(err error) bool {
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "free-models-per-day") || strings.Contains(text, "per-day") || strings.Contains(text, "daily limit")
}
