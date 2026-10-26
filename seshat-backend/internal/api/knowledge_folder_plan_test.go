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

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/folderplan"
)

func archiveOnDisk(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	for _, f := range []string{"Contracts/a.pdf", "Contracts/b.pdf", "Contracts/c.pdf", "Contracts/d.pdf", "Contracts/e.pdf", "Contracts/f.pdf", "Notes/n1.txt", "Notes/n2.txt", "clip.mp4"} {
		p := filepath.Join(root, filepath.FromSlash(f))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func folderPlanApp() *App {
	return &App{folderPlans: folderplan.NewStore(time.Hour, 10)}
}

func postFolderPlan(app *App, userID, body string) *httptest.ResponseRecorder {
	req := withPrincipal(httptest.NewRequest(http.MethodPost, "/knowledge/folder-plans", strings.NewReader(body)), userID)
	rec := httptest.NewRecorder()
	app.handleKnowledgeFolderPlans(rec, req)
	return rec
}

func TestAFolderIsAnalysedIntoCollections(t *testing.T) {
	app := folderPlanApp()
	root := archiveOnDisk(t)
	body, _ := json.Marshal(map[string]string{"path": root})
	rec := postFolderPlan(app, "user-1", string(body))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var resp folderPlanResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.ID == "" || resp.Listed != 9 {
		t.Errorf("id %q, listed %d (want an id and 9)", resp.ID, resp.Listed)
	}
	if len(resp.Collections) != 2 || resp.Collections[0].Name != "Contracts" || resp.Collections[0].FileCount != 6 || resp.Collections[1].Name != "Notes" {
		t.Errorf("collections = %+v", resp.Collections)
	}
	if len(resp.Collections[0].Sample) != 5 {
		t.Errorf("the sample holds %d files, want 5", len(resp.Collections[0].Sample))
	}
	if resp.ExcludedCount != 1 || resp.ExcludedByReason["format the reader does not handle"] != 1 {
		t.Errorf("excluded = %d %v", resp.ExcludedCount, resp.ExcludedByReason)
	}
}

func TestAnAnalysisIsRefusedWhenItCannotBeDone(t *testing.T) {
	app := folderPlanApp()
	root := archiveOnDisk(t)
	file := filepath.Join(root, "clip.mp4")
	cases := map[string]struct {
		body string
		want int
	}{
		"a path that does not exist": {`{"path":` + quote(filepath.Join(root, "nope")) + `}`, http.StatusBadRequest},
		"a file":                     {`{"path":` + quote(file) + `}`, http.StatusBadRequest},
		"a relative path":            {`{"path":"some/folder"}`, http.StatusBadRequest},
		"no path":                    {`{}`, http.StatusBadRequest},
		"a body that is not json":    {`not json`, http.StatusBadRequest},
	}
	for name, c := range cases {
		if rec := postFolderPlan(app, "user-1", c.body); rec.Code != c.want {
			t.Errorf("%s: status %d, want %d (%s)", name, rec.Code, c.want, rec.Body.String())
		}
	}
}

func quote(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

func TestAnAnalysisNeedsASignedInPersonAndAPost(t *testing.T) {
	app := folderPlanApp()
	rec := httptest.NewRecorder()
	app.handleKnowledgeFolderPlans(rec, httptest.NewRequest(http.MethodPost, "/knowledge/folder-plans", strings.NewReader(`{}`)))
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("without a principal: status %d, want 401", rec.Code)
	}
	req := withPrincipal(httptest.NewRequest(http.MethodGet, "/knowledge/folder-plans", nil), "user-1")
	rec = httptest.NewRecorder()
	app.handleKnowledgeFolderPlans(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("a GET: status %d, want 405", rec.Code)
	}
}

func TestADeviceConnectedToAnOrganizationDoesNotAnalyseFolders(t *testing.T) {
	app := folderPlanApp()
	app.connectedServerURL = "https://cloud.example.test"
	body, _ := json.Marshal(map[string]string{"path": archiveOnDisk(t)})
	if rec := postFolderPlan(app, "user-1", string(body)); rec.Code != http.StatusConflict {
		t.Errorf("status %d, want 409", rec.Code)
	}
}

func getFiles(app *App, userID, id, query string) *httptest.ResponseRecorder {
	req := withPrincipal(httptest.NewRequest(http.MethodGet, "/knowledge/folder-plans/"+id+"/files?"+query, nil), userID)
	rec := httptest.NewRecorder()
	app.handleKnowledgeFolderPlan(rec, req)
	return rec
}

func TestTheFilesOfACollectionAreServedByPage(t *testing.T) {
	app := folderPlanApp()
	body, _ := json.Marshal(map[string]string{"path": archiveOnDisk(t)})
	var plan folderPlanResponse
	_ = json.Unmarshal(postFolderPlan(app, "user-1", string(body)).Body.Bytes(), &plan)

	rec := getFiles(app, "user-1", plan.ID, "collection=0&offset=4&limit=10")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var page struct {
		Collection string   `json:"collection"`
		Total      int      `json:"total"`
		Offset     int      `json:"offset"`
		Files      []string `json:"files"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &page)
	if page.Collection != "Contracts" || page.Total != 6 || page.Offset != 4 || len(page.Files) != 2 || page.Files[0] != "Contracts/e.pdf" {
		t.Errorf("page = %+v", page)
	}
	if rec := getFiles(app, "user-1", plan.ID, "collection=9"); rec.Code != http.StatusBadRequest {
		t.Errorf("a collection that is not in the plan: status %d, want 400", rec.Code)
	}
}

func TestAnotherPersonCannotReadAnAnalysis(t *testing.T) {
	app := folderPlanApp()
	body, _ := json.Marshal(map[string]string{"path": archiveOnDisk(t)})
	var plan folderPlanResponse
	_ = json.Unmarshal(postFolderPlan(app, "user-1", string(body)).Body.Bytes(), &plan)
	if rec := getFiles(app, "user-2", plan.ID, "collection=0"); rec.Code != http.StatusNotFound {
		t.Errorf("status %d, want 404", rec.Code)
	}
	if rec := getFiles(app, "user-1", "unknown", "collection=0"); rec.Code != http.StatusNotFound {
		t.Errorf("an unknown id: status %d, want 404", rec.Code)
	}
}

func patchFolderPlan(app *App, userID, id, body string) *httptest.ResponseRecorder {
	req := withPrincipal(httptest.NewRequest(http.MethodPatch, "/knowledge/folder-plans/"+id, strings.NewReader(body)), userID)
	rec := httptest.NewRecorder()
	app.handleKnowledgeFolderPlan(rec, req)
	return rec
}

func analysedPlan(t *testing.T, app *App) folderPlanResponse {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"path": archiveOnDisk(t)})
	var plan folderPlanResponse
	if err := json.Unmarshal(postFolderPlan(app, "user-1", string(body)).Body.Bytes(), &plan); err != nil {
		t.Fatal(err)
	}
	return plan
}

func TestAPlanCanBeRenamedMergedAndRemovedFrom(t *testing.T) {
	app := folderPlanApp()
	plan := analysedPlan(t, app)

	rec := patchFolderPlan(app, "user-1", plan.ID, `{"op":"rename","index":1,"name":"Memos"}`)
	var renamed folderPlanResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &renamed)
	if rec.Code != http.StatusOK || renamed.Collections[0].Name != "Contracts" || renamed.Collections[1].Name != "Memos" {
		t.Fatalf("rename: status %d, %s", rec.Code, rec.Body.String())
	}

	rec = patchFolderPlan(app, "user-1", plan.ID, `{"op":"merge","indexes":[0,1],"name":"Everything"}`)
	var merged folderPlanResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &merged)
	if rec.Code != http.StatusOK || len(merged.Collections) != 1 || merged.Collections[0].FileCount != 8 || merged.Collections[0].Index != 0 {
		t.Fatalf("merge: status %d, %s", rec.Code, rec.Body.String())
	}

	rec = patchFolderPlan(app, "user-1", plan.ID, `{"op":"remove","index":0}`)
	var removed folderPlanResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &removed)
	if rec.Code != http.StatusOK || len(removed.Collections) != 0 || removed.ExcludedByReason["removed from the plan"] != 8 {
		t.Fatalf("remove: status %d, %s", rec.Code, rec.Body.String())
	}
}

func TestAChangeThatTheStoredPlanCannotTakeIsRefusedAndChangesNothing(t *testing.T) {
	app := folderPlanApp()
	plan := analysedPlan(t, app)
	bad := map[string]string{
		"an unknown change":  `{"op":"delete-everything"}`,
		"a missing index":    `{"op":"remove","index":9}`,
		"a name taken":       `{"op":"rename","index":0,"name":"notes"}`,
		"merging only one":   `{"op":"merge","indexes":[0],"name":"X"}`,
		"a body that is bad": `[`,
	}
	for name, body := range bad {
		if rec := patchFolderPlan(app, "user-1", plan.ID, body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 400 (%s)", name, rec.Code, rec.Body.String())
		}
	}
	rec := getFiles(app, "user-1", plan.ID, "collection=1")
	var page struct {
		Collection string `json:"collection"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &page)
	if page.Collection != "Notes" {
		t.Errorf("the plan changed after refused edits: %q", page.Collection)
	}
}

func TestAnotherPersonCannotChangeAPlanAndOtherMethodsAreRefused(t *testing.T) {
	app := folderPlanApp()
	plan := analysedPlan(t, app)
	if rec := patchFolderPlan(app, "user-2", plan.ID, `{"op":"remove","index":0}`); rec.Code != http.StatusNotFound {
		t.Errorf("another person: status %d, want 404", rec.Code)
	}
	req := withPrincipal(httptest.NewRequest(http.MethodDelete, "/knowledge/folder-plans/"+plan.ID, nil), "user-1")
	rec := httptest.NewRecorder()
	app.handleKnowledgeFolderPlan(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("a DELETE: status %d, want 405", rec.Code)
	}
	req = httptest.NewRequest(http.MethodPatch, "/knowledge/folder-plans/"+plan.ID, strings.NewReader(`{}`))
	rec = httptest.NewRecorder()
	app.handleKnowledgeFolderPlan(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("without a person: status %d, want 401", rec.Code)
	}
}
