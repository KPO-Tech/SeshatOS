package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	publicskills "github.com/KPO-Tech/seshat-runtime/pkg/skills"
	skillsloader "github.com/KPO-Tech/seshat-runtime/pkg/skills"
)

// CodeQL reports every file operation on a name taken from the address of a request (go/path-injection) because it does not know the
// cleaning that comes first: filepath.Base on the name in the dispatchers, and a check that a repository name is a folder of its own. Those
// alerts were read one by one on 2026-11-07 and are false. These tests keep them false: a name that climbs out of the folder removes or
// changes nothing outside it, whatever way it is written (a slash, a backslash, encoded or not).
var climbingNames = []string{
	"..%2Foutside",
	"..%5Coutside",
	"..%5C..%5Coutside",
	"%2E%2E%5Coutside",
	"..%2F..%2Foutside",
}

func writeOutsideMarker(t *testing.T, dir string) string {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(dir, "keep.txt")
	if err := os.WriteFile(marker, []byte("must survive"), 0o644); err != nil {
		t.Fatal(err)
	}
	return marker
}

func TestASkillNameThatClimbsOutOfTheFolderChangesNothingOutsideIt(t *testing.T) {
	t.Setenv("SESHAT_RUNTIME_ROOT", t.TempDir())
	app, _ := newSkillsTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@skills.test", "adminpass")
	createSkillForTest(t, router, token, "mine", "A skill of the person")

	principal, err := app.backend.Auth.ResolvePrincipal(t.Context(), token)
	if err != nil {
		t.Fatal(err)
	}
	userDir := publicskills.UserPath(principal.User.ID)
	// "outside" sits next to the folder of the skills of the person, and two levels up, where the names above would land.
	markers := []string{
		writeOutsideMarker(t, filepath.Join(filepath.Dir(userDir), "outside")),
		writeOutsideMarker(t, filepath.Join(filepath.Dir(filepath.Dir(userDir)), "outside")),
	}

	for _, name := range climbingNames {
		for _, method := range []string{http.MethodDelete, http.MethodPut} {
			request := httptest.NewRequest(method, "/api/v1/skills/"+name, strings.NewReader(`{"description":"changed"}`))
			request.Header.Set("Authorization", "Bearer "+token)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code >= 200 && response.Code < 300 {
				t.Errorf("%s %s answered %d: a name that climbs out of the folder must not be accepted", method, name, response.Code)
			}
		}
	}

	for _, marker := range markers {
		if data, err := os.ReadFile(marker); err != nil || string(data) != "must survive" {
			t.Fatalf("a file outside the folder of the skills was removed or changed: %s (%v)", marker, err)
		}
	}
	if _, err := os.Stat(filepath.Join(userDir, "mine", "skill.md")); err != nil {
		t.Fatalf("the skill of the person is still there: %v", err)
	}

	// The same route does its work for a name that is a name: without this, the test would pass if the route answered nothing at all.
	request := httptest.NewRequest(http.MethodDelete, "/api/v1/skills/mine", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code < 200 || response.Code >= 300 {
		t.Fatalf("deleting a skill by its name must work, got %d: %s", response.Code, response.Body.String())
	}
	if _, err := os.Stat(filepath.Join(userDir, "mine")); !os.IsNotExist(err) {
		t.Fatal("the skill was not deleted by its own name")
	}
}

func TestARepositoryNameThatClimbsOutOfTheFolderUninstallsNothingOutsideIt(t *testing.T) {
	t.Setenv("SESHAT_RUNTIME_ROOT", t.TempDir())
	app, _ := newSkillsTestApp(t)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@skills.test", "adminpass")

	reposDir := skillsloader.GetSkillReposPath()
	markers := []string{
		writeOutsideMarker(t, filepath.Join(filepath.Dir(reposDir), "outside")),
		writeOutsideMarker(t, filepath.Join(filepath.Dir(filepath.Dir(reposDir)), "outside")),
	}
	for _, name := range climbingNames {
		request := httptest.NewRequest(http.MethodDelete, "/api/v1/skills/repos/"+name, nil)
		request.Header.Set("Authorization", "Bearer "+token)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code >= 200 && response.Code < 300 {
			t.Errorf("DELETE repos/%s answered %d: a name that climbs out of the folder must not be accepted", name, response.Code)
		}
	}
	for _, marker := range markers {
		if data, err := os.ReadFile(marker); err != nil || string(data) != "must survive" {
			t.Fatalf("a file outside the folder of the repositories was removed: %s (%v)", marker, err)
		}
	}

	// The route is reached for a name that is a name (a repository that is not installed is not found), so the answers above are the check
	// of the name and not a route that does not exist.
	request := httptest.NewRequest(http.MethodDelete, "/api/v1/skills/repos/not-installed", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("a repository that is not installed must be reported as not found, got %d: %s", response.Code, response.Body.String())
	}
}
