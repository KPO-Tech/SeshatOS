package cloudautomation

import (
	"context"
	"log"
	"sync"
	"time"
)

// pollInterval is how often the device heartbeats to its seshat-server.
const pollInterval = 30 * time.Second

// Worker is a background goroutine that heartbeats to seshat-server and keeps
// the organization's desktop policies and minimum app version up to date. It
// does nothing (not an error) while no Connection is established, and it runs
// no jobs.
type Worker struct {
	store    *Store
	policies *PolicyStore
	versions *VersionStore
	quit     chan struct{}
	once     sync.Once
}

// NewWorker builds the heartbeat worker.
func NewWorker(store *Store, policies *PolicyStore, versions *VersionStore) *Worker {
	return &Worker{store: store, policies: policies, versions: versions, quit: make(chan struct{})}
}

// Start begins heartbeating in the background.
func (w *Worker) Start() {
	w.once.Do(func() { go w.run() })
}

// Stop ends the background loop.
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
		return // not connected: nothing to do, not an error
	}

	device, err := NewClient(conn.ServerURL, conn.DeviceToken).Heartbeat(ctx)
	if err != nil {
		log.Printf("[cloudautomation] heartbeat: %v", err)
		return
	}
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
