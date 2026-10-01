package cloudautomation

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"
)

const (
	// pollInterval matches the old local scheduler's cadence.
	pollInterval = 30 * time.Second

	// runHeartbeatInterval keeps a long-running execution alive in
	// seshat-server's bookkeeping — well under its stale-run-reaping default
	// of 10 minutes (SESHAT_SERVER_STALE_RUN_TIMEOUT).
	runHeartbeatInterval = 2 * time.Minute
)

// Worker is a background goroutine that heartbeats and polls
// seshat-server for device-targeted runs to claim and execute locally.
// Does nothing (not an error) while no Connection is established.
type Worker struct {
	store    *Store
	policies *PolicyStore
	versions *VersionStore
	executor JobExecutor
	quit     chan struct{}
	once     sync.Once
}

func NewWorker(store *Store, policies *PolicyStore, versions *VersionStore, executor JobExecutor) *Worker {
	return &Worker{store: store, policies: policies, versions: versions, executor: executor, quit: make(chan struct{})}
}

func (w *Worker) Start() {
	w.once.Do(func() { go w.run() })
}

func (w *Worker) Stop() {
	close(w.quit)
}

func (w *Worker) run() {
	w.tick()
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			w.tick()
		case <-w.quit:
			return
		}
	}
}

func (w *Worker) tick() {
	ctx, cancel := context.WithTimeout(context.Background(), pollInterval)
	defer cancel()

	conn, err := w.store.Load(ctx)
	if err != nil {
		log.Printf("[cloudautomation] load connection: %v", err)
		return
	}
	if conn == nil {
		return // not connected — nothing to do, not an error
	}

	client := NewClient(conn.ServerURL, conn.DeviceToken)
	if device, err := client.Heartbeat(ctx); err != nil {
		log.Printf("[cloudautomation] heartbeat: %v", err)
		// A transient network blip shouldn't stop the claim attempt below.
	} else {
		if w.policies != nil {
			if err := w.policies.Save(ctx, device.Policies); err != nil {
				log.Printf("[cloudautomation] save desktop policies: %v", err)
			}
		}
		if w.versions != nil {
			if err := w.versions.Save(ctx, device.MinAppVersion, device.AppVersionOutdated); err != nil {
				log.Printf("[cloudautomation] save app version status: %v", err)
			}
		}
	}

	run, err := client.ClaimRun(ctx)
	if err != nil {
		log.Printf("[cloudautomation] claim run: %v", err)
		return
	}
	if run == nil {
		return // nothing queued right now — normal
	}
	go w.executeRun(client, conn.ConnectedByUserID, *run)
}

// executeRun fetches the claimed run's job payload, reports start, executes
// it locally via the JobExecutor (which uses this machine's own configured
// LLM credentials — see ExecParams doc), heartbeating throughout, then
// reports the outcome.
func (w *Worker) executeRun(client *Client, userID string, run Run) {
	ctx := context.Background()

	job, err := client.GetRunJob(ctx, run.ID)
	if err != nil {
		log.Printf("[cloudautomation] fetch job for run %s: %v", run.ID, err)
		_ = client.FailRun(ctx, run.ID, fmt.Sprintf("failed to fetch job payload: %v", err))
		return
	}
	if err := client.StartRun(ctx, run.ID); err != nil {
		log.Printf("[cloudautomation] start run %s: %v", run.ID, err)
		return
	}

	heartbeatCtx, stopHeartbeat := context.WithCancel(ctx)
	go func() {
		ticker := time.NewTicker(runHeartbeatInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if err := client.HeartbeatRun(heartbeatCtx, run.ID); err != nil {
					log.Printf("[cloudautomation] run heartbeat %s: %v", run.ID, err)
				}
			case <-heartbeatCtx.Done():
				return
			}
		}
	}()

	output, execErr := w.executor(ctx, ExecParams{
		UserID:        userID,
		Prompt:        job.Prompt,
		ModelOverride: job.ModelOverride,
	})
	stopHeartbeat()

	if execErr != nil {
		log.Printf("[cloudautomation] run %s failed: %v", run.ID, execErr)
		_ = client.FailRun(context.Background(), run.ID, execErr.Error())
		return
	}
	if err := client.CompleteRun(context.Background(), run.ID, output); err != nil {
		log.Printf("[cloudautomation] report completion for run %s: %v", run.ID, err)
	}
}
