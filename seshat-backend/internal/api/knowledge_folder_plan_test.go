package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	seshat "github.com/KPO-Tech/SeshatOS/seshat-backend/internal"
	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge"
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

func folderPlanAppWithKnowledge(t *testing.T) (*App, *knowledge.Service) {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "plan-test.db")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	corpora, err := db.NewCorpusStore(database)
	if err != nil {
		t.Fatal(err)
	}
	svc := knowledge.NewService(corpora, nil, nil, nil, nil)
	return &App{folderPlans: folderplan.NewStore(time.Hour, 10), backend: &seshat.App{Knowledge: svc}}, svc
}

func createFolderPlan(app *App, userID, id string) *httptest.ResponseRecorder {
	req := withPrincipal(httptest.NewRequest(http.MethodPost, "/knowledge/folder-plans/"+id+"/create", nil), userID)
	rec := httptest.NewRecorder()
	app.handleKnowledgeFolderPlan(rec, req)
	return rec
}

func TestAPlanBecomesCollectionsOnceAndKeepsTheFilesWhereTheyAre(t *testing.T) {
	app, svc := folderPlanAppWithKnowledge(t)
	plan := analysedPlan(t, app)

	rec := createFolderPlan(app, "user-1", plan.ID)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Collections []createdCollectionResponse `json:"collections"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if len(resp.Collections) != 2 || resp.Collections[0].Name != "Contracts" || resp.Collections[0].FileCount != 6 {
		t.Fatalf("collections = %+v", resp.Collections)
	}

	files, err := svc.ListFiles(context.Background(), &backendauth.Principal{User: backendauth.User{ID: "user-1"}}, resp.Collections[0].ID)
	if err != nil || len(files) != 6 {
		t.Fatalf("files = %d, err %v", len(files), err)
	}
	for _, f := range files {
		if f.Status != "pending" || !filepath.IsAbs(f.SourcePath) || !strings.HasSuffix(filepath.ToSlash(f.SourcePath), "/"+f.Filename) {
			t.Errorf("file %+v is not recorded where it is", f)
		}
	}

	if rec := createFolderPlan(app, "user-1", plan.ID); rec.Code != http.StatusNotFound {
		t.Errorf("asking twice: status %d, want 404 (the plan is spent)", rec.Code)
	}
}

func TestAPlanThatClashesWithACollectionIsKeptSoThatItCanBeRenamed(t *testing.T) {
	app, _ := folderPlanAppWithKnowledge(t)
	plan := analysedPlan(t, app)
	if rec := createFolderPlan(app, "user-1", plan.ID); rec.Code != http.StatusCreated {
		t.Fatalf("first creation: status %d", rec.Code)
	}
	again := analysedPlan(t, app)
	if rec := createFolderPlan(app, "user-1", again.ID); rec.Code != http.StatusConflict {
		t.Fatalf("same names: status %d, want 409", rec.Code)
	}
	if rec := patchFolderPlan(app, "user-1", again.ID, `{"op":"rename","index":0,"name":"Contracts 2"}`); rec.Code != http.StatusOK {
		t.Fatalf("the plan should still be there: status %d", rec.Code)
	}
	if rec := patchFolderPlan(app, "user-1", again.ID, `{"op":"rename","index":1,"name":"Memos"}`); rec.Code != http.StatusOK {
		t.Fatalf("rename: status %d", rec.Code)
	}
	if rec := createFolderPlan(app, "user-1", again.ID); rec.Code != http.StatusCreated {
		t.Fatalf("after renaming: status %d: %s", rec.Code, rec.Body.String())
	}
}

func TestOnlyThePersonWhoMadeAPlanCanCreateItsCollections(t *testing.T) {
	app, _ := folderPlanAppWithKnowledge(t)
	plan := analysedPlan(t, app)
	if rec := createFolderPlan(app, "user-2", plan.ID); rec.Code != http.StatusNotFound {
		t.Errorf("another person: status %d, want 404", rec.Code)
	}
	app.connectedServerURL = "https://cloud.example.test"
	if rec := createFolderPlan(app, "user-1", plan.ID); rec.Code != http.StatusConflict {
		t.Errorf("connected device: status %d, want 409", rec.Code)
	}
}

func doJSON(app *App, handler func(http.ResponseWriter, *http.Request), method, path, userID, body string) *httptest.ResponseRecorder {
	req := withPrincipal(httptest.NewRequest(method, path, strings.NewReader(body)), userID)
	rec := httptest.NewRecorder()
	handler(rec, req)
	return rec
}

func TestAFolderBecomesASourceThatItsPlanAndCollectionsBelongTo(t *testing.T) {
	app, _ := folderPlanAppWithKnowledge(t)
	root := archiveOnDisk(t)

	rec := doJSON(app, app.handleKnowledgeSources, http.MethodPost, "/knowledge/sources", "user-1", `{"kind":"local_folder","path":`+quote(root)+`}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("add source: status %d: %s", rec.Code, rec.Body.String())
	}
	var src knowledge.Source
	_ = json.Unmarshal(rec.Body.Bytes(), &src)
	if src.ID == "" || src.Root != filepath.Clean(root) {
		t.Fatalf("source = %+v", src)
	}
	if rec := doJSON(app, app.handleKnowledgeSources, http.MethodPost, "/knowledge/sources", "user-1", `{"kind":"local_folder","path":`+quote(root)+`}`); rec.Code != http.StatusConflict {
		t.Errorf("the same folder twice: status %d, want 409", rec.Code)
	}
	if rec := doJSON(app, app.handleKnowledgeSources, http.MethodPost, "/knowledge/sources", "user-1", `{"kind":"local_folder","path":"relative/dir"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("a relative path: status %d, want 400", rec.Code)
	}

	// A plan made for the source analyses the source's folder, whatever path is sent, and its collections belong to the source.
	rec = doJSON(app, app.handleKnowledgeFolderPlans, http.MethodPost, "/knowledge/folder-plans", "user-1", `{"source_id":`+quote(src.ID)+`,"path":"/elsewhere"}`)
	var plan folderPlanResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &plan)
	if rec.Code != http.StatusOK || plan.SourceID != src.ID || plan.Listed != 9 {
		t.Fatalf("plan for the source: status %d: %s", rec.Code, rec.Body.String())
	}
	if rec := createFolderPlan(app, "user-1", plan.ID); rec.Code != http.StatusCreated {
		t.Fatalf("create: status %d: %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(app, app.handleKnowledgeSources, http.MethodGet, "/knowledge/sources", "user-1", "")
	var list struct {
		Default struct {
			Count int `json:"collection_count"`
		} `json:"default"`
		Sources []knowledge.Source `json:"sources"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list.Sources) != 1 || list.Sources[0].Count != 2 || list.Default.Count != 0 {
		t.Fatalf("list = %s", rec.Body.String())
	}

	if rec := doJSON(app, app.handleKnowledgeSource, http.MethodDelete, "/knowledge/sources/"+src.ID, "user-1", ""); rec.Code != http.StatusConflict {
		t.Errorf("a source with collections: status %d, want 409", rec.Code)
	}
	if rec := doJSON(app, app.handleKnowledgeSource, http.MethodDelete, "/knowledge/sources/"+src.ID, "user-2", ""); rec.Code != http.StatusNotFound {
		t.Errorf("another person: status %d, want 404", rec.Code)
	}
}

func TestAPlanForAnUnknownSourceIsRefused(t *testing.T) {
	app, _ := folderPlanAppWithKnowledge(t)
	rec := doJSON(app, app.handleKnowledgeFolderPlans, http.MethodPost, "/knowledge/folder-plans", "user-1", `{"source_id":"src_nope"}`)
	if rec.Code != http.StatusNotFound {
		t.Errorf("status %d, want 404", rec.Code)
	}
}

func TestASourceCanBeRenamedAndGivenAnIcon(t *testing.T) {
	app, _ := folderPlanAppWithKnowledge(t)
	root := archiveOnDisk(t)
	rec := doJSON(app, app.handleKnowledgeSources, http.MethodPost, "/knowledge/sources", "user-1", `{"kind":"local_folder","path":`+quote(root)+`,"icon":"briefcase"}`)
	var src knowledge.Source
	_ = json.Unmarshal(rec.Body.Bytes(), &src)
	if rec.Code != http.StatusCreated || src.Icon != "briefcase" {
		t.Fatalf("add with an icon: status %d: %s", rec.Code, rec.Body.String())
	}

	patch := func(user, body string) *httptest.ResponseRecorder {
		return doJSON(app, app.handleKnowledgeSource, http.MethodPatch, "/knowledge/sources/"+src.ID, user, body)
	}
	rec = patch("user-1", `{"icon":"bank"}`)
	var changed knowledge.Source
	_ = json.Unmarshal(rec.Body.Bytes(), &changed)
	if rec.Code != http.StatusOK || changed.Icon != "bank" || changed.Name != src.Name {
		t.Fatalf("icon only: status %d: %s", rec.Code, rec.Body.String())
	}
	rec = patch("user-1", `{"name":"  Archive 2021  "}`)
	_ = json.Unmarshal(rec.Body.Bytes(), &changed)
	if rec.Code != http.StatusOK || changed.Name != "Archive 2021" || changed.Icon != "bank" {
		t.Fatalf("name only: status %d: %s", rec.Code, rec.Body.String())
	}
	rec = patch("user-1", `{"icon":""}`)
	changed = knowledge.Source{} // the icon is left out of the answer when empty
	_ = json.Unmarshal(rec.Body.Bytes(), &changed)
	if rec.Code != http.StatusOK || changed.Icon != "" {
		t.Errorf("an empty icon goes back to the kind's own: status %d: %s", rec.Code, rec.Body.String())
	}

	for name, body := range map[string]string{"an empty name": `{"name":" "}`, "an icon with a path in it": `{"icon":"../x"}`, "capitals": `{"icon":"Bank"}`} {
		if rec := patch("user-1", body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 400", name, rec.Code)
		}
	}
	if rec := patch("user-2", `{"icon":"bank"}`); rec.Code != http.StatusNotFound {
		t.Errorf("another person: status %d, want 404", rec.Code)
	}
}
