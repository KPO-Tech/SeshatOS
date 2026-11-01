package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/KPO-Tech/seshat-runtime/pkg/runtimepath"
	skillsloader "github.com/KPO-Tech/seshat-runtime/pkg/skills"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/tasks"
)

// TestRealSkillEnvironmentRunsAsATask installs a small real package through the route, as the desktop does, and follows the task. It needs
// the network, so it runs only when asked: SESHAT_REAL_INSTALL=1 go test ./internal/api -run TestRealSkillEnvironment -v
func TestRealSkillEnvironmentRunsAsATask(t *testing.T) {
	if os.Getenv("SESHAT_REAL_INSTALL") == "" {
		t.Skip("set SESHAT_REAL_INSTALL=1 to install real packages")
	}
	t.Setenv(runtimepath.EnvRuntimeRoot, t.TempDir())
	repo := filepath.Join(skillsloader.GetSkillReposPath(), "demo")
	for path, text := range map[string]string{
		filepath.Join(repo, ".git", "HEAD"):                    "ref: refs/heads/main\n",
		filepath.Join(repo, "skills", "a", "SKILL.md"):         "---\nname: a\n---\n",
		filepath.Join(repo, "skills", "a", "requirements.txt"): "six\nidna\n",
	} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	app := newTasksApp()

	rec := httptest.NewRecorder()
	started := time.Now()
	app.handleSkillRepoEnvironment(rec, httptest.NewRequest(http.MethodPost, "/skills/repos/demo/environment", strings.NewReader("{}")), "demo")
	if rec.Code != http.StatusAccepted {
		t.Fatalf("the route answers at once with 202, got %d: %s", rec.Code, rec.Body.String())
	}
	t.Logf("answered in %s", time.Since(started).Round(time.Millisecond))
	var body struct{ Task tasks.Task }
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Task.ID == "" {
		t.Fatalf("the task comes back: %s (%v)", rec.Body.String(), err)
	}

	steps := map[string]bool{}
	deadline := time.Now().Add(3 * time.Minute)
	var task tasks.Task
	for time.Now().Before(deadline) {
		task, _ = app.taskManager().Get(body.Task.ID)
		if task.Step != "" {
			steps[task.Step] = true
		}
		if !task.Status.Active() {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Logf("%s after %s; steps seen %v; last detail %q; log %d lines", task.Status, time.Since(started).Round(100*time.Millisecond), steps, task.Detail, len(task.Log))
	if task.Status != tasks.Succeeded {
		t.Fatalf("the installation succeeds, got %s: %s", task.Status, task.Error)
	}
	install, ok := skillsloader.LoadRepoInstall(repo)
	if !ok || install.Pending || install.Python == "" {
		t.Fatalf("the environment is recorded as ready: %+v", install)
	}
	if _, err := os.Stat(install.Python); err != nil {
		t.Fatalf("and its Python exists: %v", err)
	}
}
