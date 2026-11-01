package tasks

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

// waitFor polls until the condition holds, so that a test never depends on how fast a goroutine is scheduled.
func waitFor(t *testing.T, what string, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if ok() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

// settle cancels what is still active when a test ends and waits for it, so that no task writes to a folder that is being removed.
func settle(t *testing.T, m *Manager) {
	t.Helper()
	t.Cleanup(func() {
		for _, task := range m.List() {
			m.Cancel(task.ID)
		}
		deadline := time.Now().Add(3 * time.Second)
		for time.Now().Before(deadline) {
			m.mu.Lock()
			idle := m.running == 0
			m.mu.Unlock()
			if idle {
				return
			}
			time.Sleep(5 * time.Millisecond)
		}
	})
}

func status(m *Manager, id string) Status {
	task, _ := m.Get(id)
	return task.Status
}

func TestATaskRunsAndSucceeds(t *testing.T) {
	m := NewManager("", 2)
	task, created := m.Start("skill.install", "paperasse", "Installing paperasse", func(_ context.Context, r *Reporter) error {
		r.Step(1, 2, "Getting the tools")
		r.Detail("Resolved 12 packages")
		return nil
	})
	if !created {
		t.Fatal("a first task is created")
	}
	waitFor(t, "success", func() bool { return status(m, task.ID) == Succeeded })
	done, _ := m.Get(task.ID)
	if done.Step != "Getting the tools" || done.StepCount != 2 || done.EndedAt == 0 || len(done.Log) != 1 {
		t.Fatalf("the steps and the log are kept: %+v", done)
	}
}

func TestATaskThatFailsKeepsItsError(t *testing.T) {
	m := NewManager("", 1)
	task, _ := m.Start("k", "s", "t", func(context.Context, *Reporter) error { return errors.New("pip said no") })
	waitFor(t, "failure", func() bool { return status(m, task.ID) == Failed })
	if got, _ := m.Get(task.ID); got.Error != "pip said no" {
		t.Fatalf("got %q", got.Error)
	}
}

func TestAPanicFailsTheTaskInsteadOfTheApp(t *testing.T) {
	m := NewManager("", 1)
	task, _ := m.Start("k", "s", "t", func(context.Context, *Reporter) error { panic("boom") })
	waitFor(t, "failure", func() bool { return status(m, task.ID) == Failed })
}

func TestTheSameKindAndSubjectDoesNotStartTwice(t *testing.T) {
	m := NewManager("", 2)
	release := make(chan struct{})
	first, _ := m.Start("skill.install", "a", "t", func(ctx context.Context, _ *Reporter) error {
		select {
		case <-release:
		case <-ctx.Done():
		}
		return nil
	})
	second, created := m.Start("skill.install", "a", "t", func(context.Context, *Reporter) error { return nil })
	if created || second.ID != first.ID {
		t.Fatalf("the running task is returned, got %+v (created=%v)", second, created)
	}
	other, created := m.Start("skill.install", "b", "t", func(context.Context, *Reporter) error { return nil })
	if !created || other.ID == first.ID {
		t.Fatal("another subject is another task")
	}
	close(release)
	waitFor(t, "end", func() bool { return status(m, first.ID) == Succeeded })
	if _, created := m.Start("skill.install", "a", "t", func(context.Context, *Reporter) error { return nil }); !created {
		t.Fatal("once over, the same subject can start again")
	}
}

func TestOnlyAsManyTasksRunAtOnceAsAllowed(t *testing.T) {
	m := NewManager("", 1)
	release := make(chan struct{})
	first, _ := m.Start("k", "a", "t", func(ctx context.Context, _ *Reporter) error {
		<-release
		return nil
	})
	second, _ := m.Start("k", "b", "t", func(context.Context, *Reporter) error { return nil })
	waitFor(t, "first running", func() bool { return status(m, first.ID) == Running })
	if got := status(m, second.ID); got != Queued {
		t.Fatalf("the second waits for a slot, got %s", got)
	}
	close(release)
	waitFor(t, "second done", func() bool { return status(m, second.ID) == Succeeded })
}

func TestCancelStopsARunningAndAQueuedTask(t *testing.T) {
	m := NewManager("", 1)
	running, _ := m.Start("k", "a", "t", func(ctx context.Context, _ *Reporter) error {
		<-ctx.Done()
		return ctx.Err()
	})
	queued, _ := m.Start("k", "b", "t", func(context.Context, *Reporter) error { return nil })
	waitFor(t, "running", func() bool { return status(m, running.ID) == Running })

	if !m.Cancel(queued.ID) {
		t.Fatal("a queued task can be cancelled")
	}
	if !m.Cancel(running.ID) {
		t.Fatalf("a running task can be cancelled, it is %s", status(m, running.ID))
	}
	waitFor(t, "running cancelled", func() bool { return status(m, running.ID) == Cancelled })
	waitFor(t, "queued cancelled", func() bool { return status(m, queued.ID) == Cancelled })
	if m.Cancel(running.ID) {
		t.Fatal("a task that is over cannot be cancelled")
	}
}

func TestATaskThatWasActiveWhenTheAppStoppedComesBackInterrupted(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "tasks")
	first := NewManager(dir, 1)
	settle(t, first)
	task, _ := first.Start("k", "a", "t", func(ctx context.Context, r *Reporter) error {
		r.Step(2, 4, "Installing")
		<-ctx.Done()
		return nil
	})
	waitFor(t, "step saved", func() bool { got, _ := first.Get(task.ID); return got.Step == "Installing" })

	second := NewManager(dir, 1)
	settle(t, second)
	got, ok := second.Get(task.ID)
	if !ok || got.Status != Interrupted || got.Error == "" || got.Step != "Installing" {
		t.Fatalf("the task is remembered as interrupted, got %+v (ok=%v)", got, ok)
	}
	if _, created := second.Start("k", "a", "t", func(context.Context, *Reporter) error { return nil }); !created {
		t.Fatal("an interrupted task does not block a new one")
	}
}

func TestOnlyFinishedTasksAreRemoved(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "tasks")
	m := NewManager(dir, 1)
	settle(t, m)
	release := make(chan struct{})
	task, _ := m.Start("k", "a", "t", func(context.Context, *Reporter) error { <-release; return nil })
	waitFor(t, "running", func() bool { return status(m, task.ID) == Running })
	if m.Remove(task.ID) {
		t.Fatal("an active task is not removed")
	}
	close(release)
	waitFor(t, "done", func() bool { return status(m, task.ID) == Succeeded })
	if !m.Remove(task.ID) {
		t.Fatal("a finished task is removed")
	}
	if len(NewManager(dir, 1).List()) != 0 {
		t.Fatal("and forgotten for good")
	}
}

func TestListGivesTheMostRecentFirst(t *testing.T) {
	m := NewManager("", 3)
	var tick int64
	m.now = func() time.Time { tick++; return time.Unix(1000+tick, 0) }
	a, _ := m.Start("k", "a", "t", func(context.Context, *Reporter) error { return nil })
	b, _ := m.Start("k", "b", "t", func(context.Context, *Reporter) error { return nil })
	list := m.List()
	if len(list) != 2 || list[0].ID != b.ID || list[1].ID != a.ID {
		t.Fatalf("got %+v", list)
	}
}
