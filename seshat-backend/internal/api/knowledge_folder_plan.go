package api

import (
	"context"
	"errors"
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

type folderPlanResponse struct {
	ID               string                     `json:"id"`
	Root             string                     `json:"root"`
	Listed           int                        `json:"listed"`
	Collections      []folderPlanCollection     `json:"collections"`
	ExcludedCount    int                        `json:"excluded_count"`
	ExcludedByReason map[string]int             `json:"excluded_by_reason"`
	Excluded         []collectionplan.Excluded  `json:"excluded"`
	DuplicateCount   int                        `json:"duplicate_count"`
	Duplicates       []collectionplan.Duplicate `json:"duplicates"`
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
	resp.Excluded = an.Plan.Excluded
	if len(resp.Excluded) > maxListed {
		resp.Excluded = resp.Excluded[:maxListed]
	}
	resp.DuplicateCount = len(an.Plan.Duplicates)
	resp.Duplicates = an.Plan.Duplicates
	if len(resp.Duplicates) > maxListed {
		resp.Duplicates = resp.Duplicates[:maxListed]
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
//	GET /api/v1/knowledge/folder-plans/{id}/files?collection=<index>&offset=<n>&limit=<n>   the files of one collection
func (a *App) handleKnowledgeFolderPlan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/knowledge/folder-plans/"), "/"), "/")
	if len(parts) != 2 || parts[1] != "files" {
		http.NotFound(w, r)
		return
	}
	an, ok := a.folderPlans.Get(principal.User.ID, parts[0])
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
