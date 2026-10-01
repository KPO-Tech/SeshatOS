package api

import (
	"net/http"
	"strconv"

	backendaudit "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/audit"
	cloudaudit "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/audit"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
)

// handleAuditLogs — GET /api/v1/audit/logs. Once connected to an
// organization server, an admin's Admin Console → Audit Logs tab shows the
// organization's real audit trail (seshat-server) instead of this device's
// own local activity log — see docs/helps/... "Admin Console" architecture
// item. A non-admin (even while connected) keeps seeing their own local
// entries unchanged: the org endpoint requires an admin permission anyway,
// and internal/audit itself is untouched by this - it stays exactly what
// it always was, this device's own activity log.
func (a *App) handleAuditLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	q := r.URL.Query()
	limit := 50
	if raw := q.Get("limit"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			limit = v
		}
	}
	offset := 0
	if raw := q.Get("offset"); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v >= 0 {
			offset = v
		}
	}
	action := q.Get("action")
	resourceType := q.Get("resource_type")

	if a.connectedServerURL != "" && principal.HasRole("admin") {
		if organizationID := principal.OrganizationID(); organizationID != "" {
			client := cloudaudit.NewClient(a.connectedServerURL)
			events, err := client.ListOrgAuditEvents(r.Context(), principal.AuthSession.ID, organizationID, cloudaudit.ListParams{
				ActorUserID: q.Get("actor_user_id"), Action: action, ResourceType: resourceType, Limit: limit, Offset: offset,
			})
			if err != nil {
				writeBackendError(w, cloudhttp.Translate(err))
				return
			}
			entries := orgAuditEventsToEntries(events)
			writeJSON(w, http.StatusOK, map[string]any{
				"logs": entries, "count": len(entries), "limit": limit, "offset": offset,
			})
			return
		}
	}

	params := backendaudit.ListParams{
		Action:       action,
		ResourceType: resourceType,
		Limit:        limit,
		Offset:       offset,
	}
	// Admin may filter by actor_user_id; non-admin is always scoped to own.
	if principal.HasRole("admin") {
		params.ActorUserID = q.Get("actor_user_id")
	}

	entries, err := a.backend.Audit.List(r.Context(), principal, params)
	if err != nil {
		writeBackendError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"logs":   entries,
		"count":  len(entries),
		"limit":  limit,
		"offset": offset,
	})
}

// orgAuditEventsToEntries adapts seshat-server's organization-wide audit
// shape onto the same wire contract this endpoint already used for local
// entries, so AdminAuditView.tsx needs no changes at all. Status is always
// "success" (seshat-server's audit trail only ever records events that
// succeeded, unlike internal/audit which also tracks failed/denied
// attempts); IPAddress is never known here.
func orgAuditEventsToEntries(events []cloudaudit.OrgAuditEvent) []backendaudit.Entry {
	entries := make([]backendaudit.Entry, 0, len(events))
	for _, e := range events {
		metadata := make(map[string]any, len(e.Metadata))
		for k, v := range e.Metadata {
			metadata[k] = v
		}
		entries = append(entries, backendaudit.Entry{
			ID:           e.ID,
			ActorUserID:  e.ActorUserID,
			Action:       e.Action,
			ResourceType: e.ResourceType,
			ResourceID:   e.ResourceID,
			Status:       backendaudit.StatusSuccess,
			Metadata:     metadata,
			CreatedAt:    e.CreatedAt,
		})
	}
	return entries
}
