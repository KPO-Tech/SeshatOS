package knowledge

import (
	"context"
	"log"
	"sync"
	"time"
)

// RunnerConfig controls how the ingestion background workers poll and retry.
type RunnerConfig struct {
	// PollInterval is the base delay between poll attempts when jobs are found.
	// Defaults to 500 ms.
	PollInterval time.Duration

	// MaxPollInterval is the maximum delay applied when the queue is empty
	// (idle backoff). Defaults to 5 s.
	MaxPollInterval time.Duration

	// MaxPerTick is the maximum number of jobs a worker processes in a single wakeup.
	// Defaults to 4.
	MaxPerTick int

	// Workers is how many documents are read at once. Defaults to IngestWorkers(): half of the cores, from one to four. The step that
	// chunks and embeds stays one document at a time whatever this is (see ingest_limits.go).
	Workers int
}

// Runner polls the ingestion job queue and processes pending jobs with a few workers.
// Each worker backs off exponentially when the queue is empty to avoid busy-waiting.
type Runner struct {
	service *Service
	config  RunnerConfig
}

// NewRunner creates a runner for the given service.
func NewRunner(service *Service, config RunnerConfig) *Runner {
	if config.PollInterval <= 0 {
		config.PollInterval = 500 * time.Millisecond
	}
	if config.MaxPollInterval <= 0 {
		config.MaxPollInterval = 5 * time.Second
	}
	if config.MaxPerTick <= 0 {
		config.MaxPerTick = 4
	}
	if config.Workers <= 0 {
		config.Workers = IngestWorkers()
	}
	return &Runner{service: service, config: config}
}

// Start launches the worker goroutines. They stop when ctx is cancelled.
func (r *Runner) Start(ctx context.Context) {
	if r == nil || r.service == nil || r.service.jobs == nil {
		return
	}
	// A job still marked running was left by an app that closed or crashed on it; none is running yet, since the workers start below.
	if err := r.service.jobs.RecoverInterrupted(ctx); err != nil {
		log.Printf("[knowledge] could not recover interrupted ingestion jobs: %v", err)
	}
	for i := 0; i < r.config.Workers; i++ {
		go r.loop(ctx)
	}
}

// Run processes jobs with the configured workers until none is left due, and returns. It is Start for a caller that waits for the queue
// to be drained (tests, and a measure).
func (r *Runner) Run(ctx context.Context) {
	if r == nil || r.service == nil || r.service.jobs == nil {
		return
	}
	var wg sync.WaitGroup
	for i := 0; i < r.config.Workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for ctx.Err() == nil {
				if r.runTick(ctx) == 0 {
					return
				}
			}
		}()
	}
	wg.Wait()
}

func (r *Runner) loop(ctx context.Context) {
	wait := r.config.PollInterval
	timer := time.NewTimer(wait)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
			n := r.runTick(ctx)
			if n > 0 {
				wait = r.config.PollInterval // reset: jobs were found
			} else {
				wait = r.backoff(wait) // increase idle delay
			}
			timer.Reset(wait)
		}
	}
}

// runTick processes up to MaxPerTick jobs and returns how many were processed.
func (r *Runner) runTick(ctx context.Context) int {
	n := 0
	for i := 0; i < r.config.MaxPerTick; i++ {
		processed, err := r.service.ProcessNextIngestionJob(ctx)
		if err != nil {
			log.Printf("[knowledge] ingestion runner error: %v", err)
			break
		}
		if !processed {
			break
		}
		n++
	}
	return n
}

// backoff doubles current wait up to MaxPollInterval.
func (r *Runner) backoff(current time.Duration) time.Duration {
	next := current * 2
	if next > r.config.MaxPollInterval {
		return r.config.MaxPollInterval
	}
	return next
}
