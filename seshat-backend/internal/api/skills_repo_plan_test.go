package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/KPO-Tech/seshat-runtime/pkg/runtimepath"
	skillsloader "github.com/KPO-Tech/seshat-runtime/pkg/skills"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/skillinstall"
)

func repoOnDisk(t *testing.T, name string, files map[string]string) {
	t.Helper()
	root := filepath.Join(skillsloader.GetSkillReposPath(), name)
	files[filepath.Join(".git", "HEAD")] = "ref: refs/heads/main\n"
	for path, text := range files {
		full := filepath.Join(root, path)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestSkillRepoPlanIsAskedAfterTheDownloadEnds(t *testing.T) {
	t.Setenv(runtimepath.EnvRuntimeRoot, t.TempDir())
	repoOnDisk(t, "demo", map[string]string{
		filepath.Join("skills", "a", "SKILL.md"):         "---\nname: a\n---\n",
		filepath.Join("skills", "a", "requirements.txt"): "six\n",
	})
	if err := skillinstall.WriteInstall(filepath.Join(skillsloader.GetSkillReposPath(), "demo"), skillsloader.RepoInstall{Pending: true}); err != nil {
		t.Fatal(err)
	}
	app := newTasksApp()

	rec := httptest.NewRecorder()
	app.handleSkillRepoPlan(rec, httptest.NewRequest(http.MethodGet, "/skills/repos/demo/plan", nil), "demo")
	if rec.Code != http.StatusOK {
		t.Fatalf("the plan of a downloaded repository comes back, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Name             string `json:"name"`
		NeedsEnvironment bool   `json:"needs_environment"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Name != "demo" || !body.NeedsEnvironment {
		t.Fatalf("unexpected plan %s (%v)", rec.Body.String(), err)
	}

	rec = httptest.NewRecorder()
	app.handleSkillRepoPlan(rec, httptest.NewRequest(http.MethodGet, "/skills/repos/missing/plan", nil), "missing")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("a repository that is not there is not found, got %d", rec.Code)
	}
}
