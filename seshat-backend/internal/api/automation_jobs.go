package api

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/automation"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
	"github.com/KPO-Tech/seshat/pkg/dataflow"
)

// Job management proxies seshat-server's /api/v1/jobs* API using the
// caller's own session token, exactly like seshat-console does — seshat-
// server enforces the same jobs.manage/jobs.read permission check
// regardless of which client calls it, so a plain org member without that
// permission gets an empty list (reads) or a 403 (writes), same as in
// seshat-console.

func (a *App) jobsClientForRequest(w http.ResponseWriter, r *http.Request) (*cloudautomation.JobsClient, string, string, bool) {
	if a.connectedServerURL == "" {
		writeJSONError(w, http.StatusBadRequest, "this device is not connected to an organization server")
		return nil, "", "", false
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return nil, "", "", false
	}
	return cloudautomation.NewJobsClient(a.connectedServerURL), principal.AuthSession.ID, principal.OrganizationID(), true
}

// resolveGraphAgents resolves every "agent" node's slug in params.Graph into
// a save-time snapshot (see cloudautomation.ResolvedAgent's doc comment for
// why this can only be a snapshot, not fresh per-run resolution) and sets
// params.ResolvedAgents. Returns false (having already written the HTTP
// response) if any referenced slug doesn't resolve to a real agent -
// rejecting a broken reference at save time, rather than saving it and
// failing only when the graph actually runs.
func (a *App) resolveGraphAgents(w http.ResponseWriter, r *http.Request, params *cloudautomation.JobParams) bool {
	if params.Graph == nil {
		params.ResolvedAgents = nil
		return true
	}
	if a.backend.Agents == nil {
		// No local agent store configured - fine as long as no node actually
		// references one; a node that does can't be resolved at all.
		for _, node := range params.Graph.Nodes {
			if node.Type == "agent" && dataflow.StringParam(node.Parameters, "agent", "") != "" {
				writeJSONError(w, http.StatusServiceUnavailable, "agent store not configured")
				return false
			}
		}
		params.ResolvedAgents = nil
		return true
	}

	resolved := make(map[string]cloudautomation.ResolvedAgent)
	for _, node := range params.Graph.Nodes {
		if node.Type != "agent" {
			continue
		}
		slug := strings.TrimSpace(dataflow.StringParam(node.Parameters, "agent", ""))
		if slug == "" {
			continue
		}
		if _, ok := resolved[slug]; ok {
			continue
		}
		ag, err := a.backend.Agents.GetBySlug(r.Context(), slug)
		if err != nil {
			if bkerr.KindOf(err) == bkerr.ErrorKindNotFound {
				writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("automation references unknown agent %q", slug))
				return false
			}
			writeBackendError(w, err)
			return false
		}
		resolved[slug] = cloudautomation.ResolvedAgent{SystemPrompt: ag.SystemPrompt, Model: ag.Model}
	}
	if len(resolved) == 0 {
		params.ResolvedAgents = nil
	} else {
		params.ResolvedAgents = resolved
	}
	return true
}

// handleAutomationJobs — GET/POST /api/v1/automation/jobs
func (a *App) handleAutomationJobs(w http.ResponseWriter, r *http.Request) {
	client, token, organizationID, ok := a.jobsClientForRequest(w, r)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodGet:
		jobs, err := client.ListJobs(r.Context(), token, organizationID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"jobs": jobs, "count": len(jobs)})
	case http.MethodPost:
		var params cloudautomation.JobParams
		if !decodeJSONBody(w, r, &params) {
			return
		}
		if !a.resolveGraphAgents(w, r, &params) {
			return
		}
		job, err := client.CreateJob(r.Context(), token, organizationID, params)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusCreated, job)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleAutomationJobDraft — POST /api/v1/automation/jobs/draft. Nothing is
// persisted here - see cloudautomation.JobsClient.DraftJob's doc comment.
func (a *App) handleAutomationJobDraft(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	client, token, organizationID, ok := a.jobsClientForRequest(w, r)
	if !ok {
		return
	}
	var req struct {
		Provider string `json:"provider"`
		Request  string `json:"request"`
	}
	if !decodeJSONBody(w, r, &req) {
		return
	}
	draft, err := client.DraftJob(r.Context(), token, organizationID, req.Provider, req.Request)
	if err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	writeJSON(w, http.StatusOK, draft)
}

// handleAutomationJobDispatch — GET/PUT/DELETE /api/v1/automation/jobs/{id}
// and POST .../pause, .../resume, .../run, GET .../runs.
func (a *App) handleAutomationJobDispatch(w http.ResponseWriter, r *http.Request) {
	client, token, _, ok := a.jobsClientForRequest(w, r)
	if !ok {
		return
	}

	rest := strings.Trim(strings.TrimPrefix(r.URL.Path, "/automation/jobs/"), "/")
	if rest == "" {
		writeJSONError(w, http.StatusNotFound, "job id is required")
		return
	}
	jobID, action, _ := strings.Cut(rest, "/")

	switch {
	case action == "" && r.Method == http.MethodGet:
		job, err := client.GetJob(r.Context(), token, jobID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, job)

	case action == "" && r.Method == http.MethodPut:
		var params cloudautomation.JobParams
		if !decodeJSONBody(w, r, &params) {
			return
		}
		if !a.resolveGraphAgents(w, r, &params) {
			return
		}
		job, err := client.UpdateJob(r.Context(), token, jobID, params)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, job)

	case action == "" && r.Method == http.MethodDelete:
		if err := client.DeleteJob(r.Context(), token, jobID); err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		w.WriteHeader(http.StatusNoContent)

	case action == "pause" && r.Method == http.MethodPost:
		job, err := client.SetJobPaused(r.Context(), token, jobID, true)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, job)

	case action == "resume" && r.Method == http.MethodPost:
		job, err := client.SetJobPaused(r.Context(), token, jobID, false)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, job)

	case action == "run" && r.Method == http.MethodPost:
		run, err := client.TriggerJobNow(r.Context(), token, jobID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusCreated, run)

	case action == "runs" && r.Method == http.MethodGet:
		runs, err := client.ListJobRuns(r.Context(), token, jobID)
		if err != nil {
			writeBackendError(w, cloudhttp.Translate(err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"runs": runs, "count": len(runs)})

	default:
		writeJSONError(w, http.StatusNotFound, "not found")
	}
}

// handleAutomationOverview — GET /api/v1/automation/overview, proxying
// seshat-server's dashboard aggregate (KPI stats, attention signals, recent
// activity) - same proxy-with-the-caller's-own-token reasoning as every
// other handler in this file.
func (a *App) handleAutomationOverview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	client, token, organizationID, ok := a.jobsClientForRequest(w, r)
	if !ok {
		return
	}
	overview, err := client.GetOverview(r.Context(), token, organizationID)
	if err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	writeJSON(w, http.StatusOK, overview)
}

// handleAutomationDevices — GET /api/v1/automation/devices, the organization's
// registered devices, for populating a job's target_device_id picker.
func (a *App) handleAutomationDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	client, token, organizationID, ok := a.jobsClientForRequest(w, r)
	if !ok {
		return
	}
	devices, err := client.ListOrgDevices(r.Context(), token, organizationID)
	if err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"devices": devices, "count": len(devices)})
}

// handleAutomationDataflowNodeTypes — GET /api/v1/automation/dataflow/node-types,
// proxying seshat-server's own node-type catalog so a graph-building UI in
// seshat-ui can populate its node palette without seshat-ui needing to know
// seshat-server's API shape directly - same proxy-with-the-caller's-own-
// token reasoning as every other handler in this file.
func (a *App) handleAutomationDataflowNodeTypes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	client, token, _, ok := a.jobsClientForRequest(w, r)
	if !ok {
		return
	}
	nodeTypes, err := client.ListNodeTypes(r.Context(), token)
	if err != nil {
		writeBackendError(w, cloudhttp.Translate(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"node_types": nodeTypes, "count": len(nodeTypes)})
}
