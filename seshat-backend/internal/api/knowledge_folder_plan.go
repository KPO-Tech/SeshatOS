package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/knowledge/folderplan"
	"github.com/KPO-Tech/seshat-runtime/pkg/collectionplan"
)

// folderPlanTimeout bounds one analysis: it lists files and reads none, so a folder that takes longer is too big to propose from.
const folderPlanTimeout = 2 * time.Minute

// maxListed is how many excluded files or duplicates a response names; the counts say the rest.
const maxListed = 100

type folderPlanCollection struct {
	Index     int      `json:"index"`
	Name      string   `json:"name"`
	FileCount int      `json:"file_count"`
	Bytes     int64    `json:"bytes"`
	Folders   []string `json:"folders"`
	Sample    []string `json:"sample"`
}

type folderPlanExcluded struct {
	Path   string `json:"path"`
	Reason string `json:"reason"`
}

type folderPlanDuplicate struct {
	Path string `json:"path"`
	Of   string `json:"of"`
}

type folderPlanResponse struct {
	ID               string                 `json:"id"`
	Root             string                 `json:"root"`
	Listed           int                    `json:"listed"`
	Collections      []folderPlanCollection `json:"collections"`
	ExcludedCount    int                    `json:"excluded_count"`
	ExcludedByReason map[string]int         `json:"excluded_by_reason"`
	Excluded         []folderPlanExcluded   `json:"excluded"`
	DuplicateCount   int                    `json:"duplicate_count"`
	Duplicates       []folderPlanDuplicate  `json:"duplicates"`
}

func folderPlanSummary(an *folderplan.Analysis) folderPlanResponse {
	resp := folderPlanResponse{ID: an.ID, Root: an.Root, Listed: an.Listed, ExcludedByReason: map[string]int{}}
	for i, c := range an.Plan.Collections {
		item := folderPlanCollection{Index: i, Name: c.Name, FileCount: len(c.Files), Bytes: c.Bytes, Folders: c.Folders, Sample: c.Files}
		if len(item.Folders) > 20 {
			item.Folders = item.Folders[:20]
		}
		if len(item.Sample) > 5 {
			item.Sample = item.Sample[:5]
		}
		resp.Collections = append(resp.Collections, item)
	}
	resp.ExcludedCount = len(an.Plan.Excluded)
	for _, e := range an.Plan.Excluded {
		reason := e.Reason
		if strings.HasPrefix(reason, "unreadable: ") {
			reason = "unreadable"
		}
		resp.ExcludedByReason[reason]++
	}
	resp.Excluded = []folderPlanExcluded{}
	for _, e := range an.Plan.Excluded[:min(len(an.Plan.Excluded), maxListed)] {
		resp.Excluded = append(resp.Excluded, folderPlanExcluded{Path: e.Path, Reason: e.Reason})
	}
	resp.DuplicateCount = len(an.Plan.Duplicates)
	resp.Duplicates = []folderPlanDuplicate{}
	for _, d := range an.Plan.Duplicates[:min(len(an.Plan.Duplicates), maxListed)] {
		resp.Duplicates = append(resp.Duplicates, folderPlanDuplicate{Path: d.Path, Of: d.Of})
	}
	if resp.Collections == nil {
		resp.Collections = []folderPlanCollection{}
	}
	return resp
}

// handleKnowledgeFolderPlans analyses a folder of this computer and proposes its collections.
//
//	POST /api/v1/knowledge/folder-plans  {"path": "<absolute path of a folder>"}
//
// The analysis lists the files and reads none; the plan stays on the server and the answer names it by id. Only on this computer: a
// device connected to an organization keeps its collections on the organization's server.
func (a *App) handleKnowledgeFolderPlans(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if a.connectedServerURL != "" {
		writeJSONError(w, http.StatusConflict, "folders can be analysed on this computer only, not on a device connected to an organization")
		return
	}
	var body struct {
		Path string `json:"path"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), folderPlanTimeout)
	defer cancel()
	root, listed, plan, err := folderplan.Analyze(ctx, body.Path, collectionplan.Options{})
	switch {
	case errors.Is(err, folderplan.ErrNotAFolder):
		writeJSONError(w, http.StatusBadRequest, err.Error())
		return
	case errors.Is(err, folderplan.ErrTooBig):
		writeJSONError(w, http.StatusRequestEntityTooLarge, "this folder holds too many files to propose collections from: choose a smaller one")
		return
	case errors.Is(err, context.DeadlineExceeded):
		writeJSONError(w, http.StatusGatewayTimeout, "the analysis took too long: choose a smaller folder")
		return
	case err != nil:
		writeJSONError(w, http.StatusInternalServerError, "the folder could not be analysed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, folderPlanSummary(a.folderPlans.Add(principal.User.ID, root, listed, plan)))
}

// handleKnowledgeFolderPlan serves what hangs under /knowledge/folder-plans/{id}:
//
//	GET   /api/v1/knowledge/folder-plans/{id}/files?collection=<index>&offset=<n>&limit=<n>   the files of one collection
//	PATCH /api/v1/knowledge/folder-plans/{id}   {"op":"rename","index":0,"name":"..."} | {"op":"remove","index":0} | {"op":"merge","indexes":[0,2],"name":"..."}
//
// A change only reorganises the files the scan found, by the index of the collections of the plan the person is looking at; the answer
// to a change is the new plan, whose indexes may have moved (collections are kept in order of name).
func (a *App) handleKnowledgeFolderPlan(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	// The router has already taken "/api/v1" off the path.
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/knowledge/folder-plans/"), "/"), "/")
	switch {
	case r.Method == http.MethodGet && len(parts) == 2 && parts[1] == "files":
		a.serveFolderPlanFiles(w, r, principal.User.ID, parts[0])
	case r.Method == http.MethodPatch && len(parts) == 1 && parts[0] != "":
		a.editFolderPlan(w, r, principal.User.ID, parts[0])
	case len(parts) == 2 && parts[1] == "files", len(parts) == 1 && parts[0] != "":
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	default:
		http.NotFound(w, r)
	}
}

func (a *App) editFolderPlan(w http.ResponseWriter, r *http.Request, userID, id string) {
	var body struct {
		Op      string `json:"op"`
		Index   int    `json:"index"`
		Indexes []int  `json:"indexes"`
		Name    string `json:"name"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	an, err := a.folderPlans.Update(userID, id, func(an *folderplan.Analysis) error {
		switch body.Op {
		case "rename":
			return folderplan.Rename(an, body.Index, body.Name)
		case "remove":
			return folderplan.Remove(an, body.Index)
		case "merge":
			return folderplan.Merge(an, body.Indexes, body.Name)
		}
		return fmt.Errorf("%w: unknown change %q", folderplan.ErrInvalidEdit, body.Op)
	})
	switch {
	case errors.Is(err, folderplan.ErrNotFound):
		writeJSONError(w, http.StatusNotFound, "no such analysis: it may have expired, analyse the folder again")
	case errors.Is(err, folderplan.ErrInvalidEdit):
		writeJSONError(w, http.StatusBadRequest, err.Error())
	case err != nil:
		writeJSONError(w, http.StatusInternalServerError, err.Error())
	default:
		writeJSON(w, http.StatusOK, folderPlanSummary(an))
	}
}

func (a *App) serveFolderPlanFiles(w http.ResponseWriter, r *http.Request, userID, id string) {
	an, ok := a.folderPlans.Get(userID, id)
	if !ok {
		writeJSONError(w, http.StatusNotFound, "no such analysis: it may have expired, analyse the folder again")
		return
	}
	query := r.URL.Query()
	index, err := strconv.Atoi(query.Get("collection"))
	if err != nil || index < 0 || index >= len(an.Plan.Collections) {
		writeJSONError(w, http.StatusBadRequest, "collection must be the index of a collection of the plan")
		return
	}
	offset, _ := strconv.Atoi(query.Get("offset"))
	limit, err := strconv.Atoi(query.Get("limit"))
	if err != nil || limit <= 0 || limit > 1000 {
		limit = 200
	}
	files := an.Plan.Collections[index].Files
	if offset < 0 {
		offset = 0
	}
	offset = min(offset, len(files))
	end := min(offset+limit, len(files))
	page := append([]string(nil), files[offset:end]...)
	sort.Strings(page)
	writeJSON(w, http.StatusOK, map[string]any{"collection": an.Plan.Collections[index].Name, "total": len(files), "offset": offset, "files": page})
}
