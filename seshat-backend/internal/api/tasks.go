package api

import (
	"net/http"
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/tasks"
)

// handleTasks serves GET /tasks: the long jobs of the app, running or over, the most recent first.
func (a *App) handleTasks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	list := a.taskManager().List()
	active := 0
	for _, task := range list {
		if task.Status.Active() {
			active++
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"tasks": list, "active": active})
}

// handleTask serves what hangs under /tasks/{id}:
//
//	GET    /tasks/{id}          one task, with the end of its log
//	POST   /tasks/{id}/cancel   stops a task that is waiting or running
//	DELETE /tasks/{id}          forgets a task that is over
func (a *App) handleTask(w http.ResponseWriter, r *http.Request) {
	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/tasks/"), "/")
	id, action, _ := strings.Cut(rest, "/")
	if id == "" || strings.Contains(action, "/") {
		http.NotFound(w, r)
		return
	}
	manager := a.taskManager()
	task, ok := manager.Get(id)
	if !ok {
		writeBackendError(w, bkerr.NotFound("this task does not exist", nil))
		return
	}
	switch {
	case action == "" && r.Method == http.MethodGet:
		writeJSON(w, http.StatusOK, task)
	case action == "cancel" && r.Method == http.MethodPost:
		if !manager.Cancel(id) {
			writeBackendError(w, bkerr.Conflict("this task is already over", nil))
			return
		}
		updated, _ := manager.Get(id)
		writeJSON(w, http.StatusOK, updated)
	case action == "" && r.Method == http.MethodDelete:
		if !manager.Remove(id) {
			writeBackendError(w, bkerr.Conflict("this task is still running: cancel it first", nil))
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// taskManager is the manager of the app; an app built without one (a test) gets a manager that keeps its tasks in memory only.
func (a *App) taskManager() *tasks.Manager {
	a.tasksOnce.Do(func() {
		if a.backend != nil && a.backend.Tasks != nil {
			a.tasks = a.backend.Tasks
			return
		}
		a.tasks = tasks.NewManager("", 2)
	})
	return a.tasks
}
