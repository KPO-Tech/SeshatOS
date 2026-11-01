// Package tasks runs the long jobs of the app in the background: a job that the person started, that goes on when they leave the page, that
// says how far it is, that can be cancelled, and that is remembered across a restart. It starts nothing by itself: automation belongs to
// SeshatCloud, and a task exists only because someone asked for it.
package tasks

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Status is where a task stands.
type Status string

const (
	Queued      Status = "queued"
	Running     Status = "running"
	Succeeded   Status = "succeeded"
	Failed      Status = "failed"
	Cancelled   Status = "cancelled"
	Interrupted Status = "interrupted"
)

// Active reports whether the task is waiting or running.
func (s Status) Active() bool { return s == Queued || s == Running }

const (
	// logLines is how many of the last lines a task keeps.
	logLines = 60
	// keepFinished and keepFor bound what is remembered of the tasks that are over.
	keepFinished = 30
	keepFor      = 14 * 24 * time.Hour
	// interruptedMessage is said of a task that was running when the app stopped.
	interruptedMessage = "The app was closed before this finished."
)

// Task is what the interface shows of a job.
type Task struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	Subject string `json:"subject"`
	Title   string `json:"title"`
	Status  Status `json:"status"`
	// Step is the part of the job that is running, and which one it is out of how many.
	Step      string `json:"step,omitempty"`
	StepIndex int    `json:"step_index,omitempty"`
	StepCount int    `json:"step_count,omitempty"`
	// Detail is the last thing the job said: the package being downloaded, for instance.
	Detail    string   `json:"detail,omitempty"`
	Error     string   `json:"error,omitempty"`
	Log       []string `json:"log,omitempty"`
	StartedAt int64    `json:"started_at"`
	EndedAt   int64    `json:"ended_at,omitempty"`
}

// Func is the job: it ends with an error, or with nil when it is done, and it stops when its context is cancelled.
type Func func(ctx context.Context, report *Reporter) error

// Reporter is how a job says where it is.
type Reporter struct {
	manager *Manager
	id      string
}

// Step says which part of the job starts.
func (r *Reporter) Step(index, count int, name string) {
	r.manager.update(r.id, true, func(t *Task) { t.Step, t.StepIndex, t.StepCount, t.Detail = name, index, count, "" })
}

// Detail says what the job is doing now; it replaces the previous one.
func (r *Reporter) Detail(text string) {
	text = strings.TrimSpace(text)
	if text == "" {
		return
	}
	r.manager.update(r.id, false, func(t *Task) {
		t.Detail = text
		t.Log = append(t.Log, text)
		if len(t.Log) > logLines {
			t.Log = t.Log[len(t.Log)-logLines:]
		}
	})
}

type item struct {
	task   Task
	ctx    context.Context
	cancel context.CancelFunc
	run    Func
}

// Manager runs the tasks and keeps their state in a folder.
type Manager struct {
	dir        string
	maxRunning int
	now        func() time.Time

	mu      sync.Mutex
	items   map[string]*item
	pending []string // the tasks waiting for a place, in the order they were started
	running int
}

// NewManager reads the tasks left in dir by an earlier run and makes sure that at most maxRunning of them run at once. A task that was still
// active when the app stopped is marked interrupted. dir may be empty: the tasks are then kept in memory only.
func NewManager(dir string, maxRunning int) *Manager {
	if maxRunning < 1 {
		maxRunning = 1
	}
	m := &Manager{dir: dir, maxRunning: maxRunning, now: time.Now, items: map[string]*item{}}
	m.load()
	return m
}

func (m *Manager) load() {
	if m.dir == "" {
		return
	}
	entries, err := os.ReadDir(m.dir)
	if err != nil {
		return
	}
	var finished []Task
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(m.dir, entry.Name()))
		if err != nil {
			continue
		}
		var task Task
		if json.Unmarshal(data, &task) != nil || task.ID == "" {
			continue
		}
		if task.Status.Active() {
			task.Status, task.Error, task.EndedAt = Interrupted, interruptedMessage, m.now().Unix()
			m.save(task)
		}
		m.items[task.ID] = &item{task: task}
		finished = append(finished, task)
	}
	m.prune(finished)
}

// prune forgets the oldest of the tasks that are over, and the ones kept for too long.
func (m *Manager) prune(tasks []Task) {
	sort.Slice(tasks, func(i, j int) bool { return tasks[i].EndedAt > tasks[j].EndedAt })
	for i, task := range tasks {
		if i >= keepFinished || m.now().Sub(time.Unix(task.EndedAt, 0)) > keepFor {
			m.forget(task.ID)
		}
	}
}

func (m *Manager) forget(id string) {
	delete(m.items, id)
	if m.dir != "" {
		_ = os.Remove(filepath.Join(m.dir, id+".json"))
	}
}

func (m *Manager) save(task Task) {
	if m.dir == "" {
		return
	}
	if err := os.MkdirAll(m.dir, 0o755); err != nil {
		return
	}
	data, err := json.MarshalIndent(task, "", "  ")
	if err != nil {
		return
	}
	part := filepath.Join(m.dir, task.ID+".json.part")
	if os.WriteFile(part, data, 0o644) == nil {
		_ = os.Rename(part, filepath.Join(m.dir, task.ID+".json"))
	}
}

func newID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("t%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

// Start runs the job in the background. When a task of the same kind and subject is already waiting or running, nothing new starts and that
// one is returned, with false.
func (m *Manager) Start(kind, subject, title string, run Func) (Task, bool) {
	m.mu.Lock()
	for _, it := range m.items {
		if it.task.Kind == kind && it.task.Subject == subject && it.task.Status.Active() {
			task := copyOf(it.task)
			m.mu.Unlock()
			return task, false
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	it := &item{task: Task{ID: newID(), Kind: kind, Subject: subject, Title: title, Status: Queued, StartedAt: m.now().Unix()}, ctx: ctx, cancel: cancel, run: run}
	m.items[it.task.ID] = it
	m.pending = append(m.pending, it.task.ID)
	m.save(copyOf(it.task))
	m.dispatchLocked()
	task := copyOf(it.task)
	m.mu.Unlock()
	return task, true
}

// dispatchLocked starts the waiting tasks, oldest first, while there is a place for them. The lock is held.
func (m *Manager) dispatchLocked() {
	for m.running < m.maxRunning && len(m.pending) > 0 {
		id := m.pending[0]
		m.pending = m.pending[1:]
		it, ok := m.items[id]
		if !ok || it.task.Status != Queued {
			continue
		}
		m.running++
		it.task.Status = Running
		m.save(copyOf(it.task))
		go m.execute(it)
	}
}

func (m *Manager) execute(it *item) {
	var err error
	func() {
		defer func() {
			if recovered := recover(); recovered != nil {
				err = fmt.Errorf("the task stopped unexpectedly: %v", recovered)
			}
		}()
		err = it.run(it.ctx, &Reporter{manager: m, id: it.task.ID})
	}()
	if it.ctx.Err() != nil && err != nil {
		err = it.ctx.Err()
	}
	m.finish(it.task.ID, err)
	m.mu.Lock()
	m.running--
	m.dispatchLocked()
	m.mu.Unlock()
}

func (m *Manager) finish(id string, err error) {
	m.update(id, true, func(t *Task) {
		t.EndedAt = m.now().Unix()
		switch {
		case err == nil:
			t.Status, t.Error = Succeeded, ""
		case err == context.Canceled:
			t.Status, t.Error = Cancelled, ""
		default:
			t.Status, t.Error = Failed, err.Error()
		}
	})
}

// update changes a task under the lock; persist says whether the change is worth writing to disk.
func (m *Manager) update(id string, persist bool, change func(*Task)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	it, ok := m.items[id]
	if !ok {
		return
	}
	change(&it.task)
	if persist {
		m.save(copyOf(it.task))
	}
}

func copyOf(task Task) Task {
	task.Log = append([]string(nil), task.Log...)
	return task
}

// Get returns one task.
func (m *Manager) Get(id string) (Task, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	it, ok := m.items[id]
	if !ok {
		return Task{}, false
	}
	return copyOf(it.task), true
}

// List returns every task, the most recent first.
func (m *Manager) List() []Task {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Task, 0, len(m.items))
	for _, it := range m.items {
		out = append(out, copyOf(it.task))
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].StartedAt != out[j].StartedAt {
			return out[i].StartedAt > out[j].StartedAt
		}
		return out[i].ID > out[j].ID
	})
	return out
}

// Cancel stops a task that is waiting or running; it reports whether there was one to stop. A task that was waiting is over at once; one
// that was running is marked cancelled when its job has returned, which is as soon as the programs it started are killed.
func (m *Manager) Cancel(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	it, ok := m.items[id]
	if !ok || !it.task.Status.Active() {
		return false
	}
	it.cancel()
	if it.task.Status == Queued {
		for i, waiting := range m.pending {
			if waiting == id {
				m.pending = append(m.pending[:i], m.pending[i+1:]...)
				break
			}
		}
		it.task.Status, it.task.EndedAt = Cancelled, m.now().Unix()
		m.save(copyOf(it.task))
	}
	return true
}

// Remove forgets a task that is over; it reports false for one that is still active or that does not exist.
func (m *Manager) Remove(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	it, ok := m.items[id]
	if !ok || it.task.Status.Active() {
		return false
	}
	m.forget(id)
	return true
}
