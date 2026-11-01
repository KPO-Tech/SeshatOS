package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	seshat "github.com/KPO-Tech/SeshatOS/seshat-backend/internal"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/tasks"
)

func newTasksApp() *App {
	return &App{backend: &seshat.App{Tasks: tasks.NewManager("", 2)}}
}

func callTasks(app *App, method, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	handler := app.handleTask
	if path == "/tasks" {
		handler = app.handleTasks
	}
	handler(rec, httptest.NewRequest(method, path, strings.NewReader("")))
	return rec
}

func waitForStatus(t *testing.T, app *App, id string, want tasks.Status) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if task, _ := app.taskManager().Get(id); task.Status == want {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("task %s never reached %s", id, want)
}

func TestTasksListsWhatRunsAndCountsTheActiveOnes(t *testing.T) {
	app := newTasksApp()
	release := make(chan struct{})
	t.Cleanup(func() { close(release) })
	app.taskManager().Start("k", "a", "Running one", func(ctx context.Context, _ *tasks.Reporter) error {
		select {
		case <-release:
		case <-ctx.Done():
		}
		return nil
	})
	done, _ := app.taskManager().Start("k", "b", "Finished one", func(context.Context, *tasks.Reporter) error { return nil })
	waitForStatus(t, app, done.ID, tasks.Succeeded)

	rec := callTasks(app, http.MethodGet, "/tasks")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Tasks  []tasks.Task `json:"tasks"`
		Active int          `json:"active"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Tasks) != 2 || body.Active != 1 {
		t.Fatalf("two tasks, one of them active, got %+v", body)
	}
	if callTasks(app, http.MethodPost, "/tasks").Code != http.StatusMethodNotAllowed {
		t.Fatal("the list only answers GET")
	}
}

func TestATaskCanBeReadCancelledAndForgotten(t *testing.T) {
	app := newTasksApp()
	task, _ := app.taskManager().Start("k", "a", "t", func(ctx context.Context, _ *tasks.Reporter) error {
		<-ctx.Done()
		return ctx.Err()
	})
	waitForStatus(t, app, task.ID, tasks.Running)

	if rec := callTasks(app, http.MethodGet, "/tasks/"+task.ID); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), task.ID) {
		t.Fatalf("read: %d %s", rec.Code, rec.Body.String())
	}
	if rec := callTasks(app, http.MethodDelete, "/tasks/"+task.ID); rec.Code != http.StatusConflict {
		t.Fatalf("a running task is not forgotten, got %d", rec.Code)
	}
	if rec := callTasks(app, http.MethodPost, "/tasks/"+task.ID+"/cancel"); rec.Code != http.StatusOK {
		t.Fatalf("cancel: %d %s", rec.Code, rec.Body.String())
	}
	waitForStatus(t, app, task.ID, tasks.Cancelled)
	if rec := callTasks(app, http.MethodPost, "/tasks/"+task.ID+"/cancel"); rec.Code != http.StatusConflict {
		t.Fatalf("a task that is over cannot be cancelled again, got %d", rec.Code)
	}
	if rec := callTasks(app, http.MethodDelete, "/tasks/"+task.ID); rec.Code != http.StatusNoContent {
		t.Fatalf("a finished task is forgotten, got %d", rec.Code)
	}
	if rec := callTasks(app, http.MethodGet, "/tasks/"+task.ID); rec.Code != http.StatusNotFound {
		t.Fatalf("and is gone, got %d", rec.Code)
	}
}

func TestTheInstallOfASkillRepositoryIsKnownWhileItRuns(t *testing.T) {
	app := newTasksApp()
	release := make(chan struct{})
	t.Cleanup(func() { close(release) })
	app.taskManager().Start(skillInstallTask, "paperasse", "Installing paperasse", func(ctx context.Context, _ *tasks.Reporter) error {
		select {
		case <-release:
		case <-ctx.Done():
		}
		return nil
	})
	if !app.skillInstallRunning("paperasse") || app.skillInstallRunning("other") {
		t.Fatal("only the repository being installed is reported as such")
	}
}
