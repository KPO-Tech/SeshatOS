package api

import (
	"net/http"
	"strconv"

	backendwebsearch "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/websearch"
	webpolicy "github.com/KPO-Tech/seshat/pkg/web"
)

type webSearchSettingsResponse struct {
	ID                 string   `json:"id,omitempty"`
	UserID             string   `json:"user_id"`
	Enabled            bool     `json:"enabled"`
	ProviderSettingIDs []string `json:"provider_setting_ids,omitempty"`
	AllowEnvFallback   bool     `json:"allow_env_fallback"`
	AllowedDomains     []string `json:"allowed_domains,omitempty"`
	BlockedDomains     []string `json:"blocked_domains,omitempty"`
	MaxQueriesPerDay   int      `json:"max_queries_per_day"`
	CreatedAt          int64    `json:"created_at,omitempty"`
	UpdatedAt          int64    `json:"updated_at,omitempty"`
	// OrgAllowedDomains/OrgBlockedDomains are the subset of the two fields
	// above contributed by a connected seshat-server's org policy — omitted
	// in standalone mode or when the org has no policy set.
	OrgAllowedDomains []string `json:"org_allowed_domains,omitempty"`
	OrgBlockedDomains []string `json:"org_blocked_domains,omitempty"`
}

type webSearchLogResponse struct {
	ID                string   `json:"id"`
	UserID            string   `json:"user_id"`
	ProviderSettingID string   `json:"provider_setting_id,omitempty"`
	Provider          string   `json:"provider,omitempty"`
	Query             string   `json:"query"`
	Status            string   `json:"status"`
	ErrorMessage      string   `json:"error_message,omitempty"`
	AllowedDomains    []string `json:"allowed_domains,omitempty"`
	BlockedDomains    []string `json:"blocked_domains,omitempty"`
	ResultCount       int      `json:"result_count"`
	DurationMillis    int64    `json:"duration_millis"`
	CreatedAt         int64    `json:"created_at"`
}

type webSearchResponse struct {
	Query             string   `json:"query"`
	Provider          string   `json:"provider"`
	ProviderSettingID string   `json:"provider_setting_id,omitempty"`
	AllowedDomains    []string `json:"allowed_domains,omitempty"`
	BlockedDomains    []string `json:"blocked_domains,omitempty"`
	Results           any      `json:"results"`
	DurationSeconds   float64  `json:"duration_seconds"`
	QuotaLimit        int      `json:"quota_limit"`
	QuotaUsed         int      `json:"quota_used"`
	QuotaRemaining    int      `json:"quota_remaining"`
}

func webSearchSettingsToResponse(settings backendwebsearch.Settings) webSearchSettingsResponse {
	return webSearchSettingsResponse{
		ID:                 settings.ID,
		UserID:             settings.UserID,
		Enabled:            settings.Enabled,
		ProviderSettingIDs: append([]string(nil), settings.ProviderSettingIDs...),
		AllowEnvFallback:   settings.AllowEnvFallback,
		AllowedDomains:     append([]string(nil), settings.AllowedDomains...),
		BlockedDomains:     append([]string(nil), settings.BlockedDomains...),
		MaxQueriesPerDay:   settings.MaxQueriesPerDay,
		CreatedAt:          settings.CreatedAt.Unix(),
		UpdatedAt:          settings.UpdatedAt.Unix(),
		OrgAllowedDomains:  settings.OrgAllowedDomains,
		OrgBlockedDomains:  settings.OrgBlockedDomains,
	}
}

func webSearchLogToResponse(log backendwebsearch.SearchLog) webSearchLogResponse {
	return webSearchLogResponse{
		ID:                log.ID,
		UserID:            log.UserID,
		ProviderSettingID: log.ProviderSettingID,
		Provider:          log.Provider,
		Query:             log.Query,
		Status:            log.Status,
		ErrorMessage:      log.ErrorMessage,
		AllowedDomains:    append([]string(nil), log.AllowedDomains...),
		BlockedDomains:    append([]string(nil), log.BlockedDomains...),
		ResultCount:       log.ResultCount,
		DurationMillis:    log.DurationMillis,
		CreatedAt:         log.CreatedAt.Unix(),
	}
}

func (a *App) handleWebSearchSettings(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	switch r.Method {
	case http.MethodGet:
		settings, err := a.backend.WebSearch.GetSettings(r.Context(), principal)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, webSearchSettingsToResponse(*settings))
	case http.MethodPut:
		var body struct {
			Enabled            bool     `json:"enabled"`
			ProviderSettingIDs []string `json:"provider_setting_ids"`
			AllowEnvFallback   bool     `json:"allow_env_fallback"`
			AllowedDomains     []string `json:"allowed_domains"`
			BlockedDomains     []string `json:"blocked_domains"`
			MaxQueriesPerDay   int      `json:"max_queries_per_day"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		settings, err := a.backend.WebSearch.UpdateSettings(r.Context(), principal, backendwebsearch.UpdateSettingsParams{
			Enabled:            body.Enabled,
			ProviderSettingIDs: body.ProviderSettingIDs,
			AllowEnvFallback:   body.AllowEnvFallback,
			AllowedDomains:     body.AllowedDomains,
			BlockedDomains:     body.BlockedDomains,
			MaxQueriesPerDay:   body.MaxQueriesPerDay,
		})
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, webSearchSettingsToResponse(*settings))
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (a *App) handleWebSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var body struct {
		Query             string   `json:"query"`
		ProviderSettingID string   `json:"provider_setting_id"`
		AllowedDomains    []string `json:"allowed_domains"`
		BlockedDomains    []string `json:"blocked_domains"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	resp, err := a.backend.WebSearch.Search(r.Context(), principal, backendwebsearch.SearchParams{
		Query:             body.Query,
		ProviderSettingID: body.ProviderSettingID,
		AllowedDomains:    body.AllowedDomains,
		BlockedDomains:    body.BlockedDomains,
	})
	if err != nil {
		writeBackendError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, webSearchResponse{
		Query:             resp.Query,
		Provider:          resp.Provider,
		ProviderSettingID: resp.ProviderSettingID,
		AllowedDomains:    append([]string(nil), resp.AllowedDomains...),
		BlockedDomains:    append([]string(nil), resp.BlockedDomains...),
		Results:           resp.Results,
		DurationSeconds:   resp.DurationSeconds,
		QuotaLimit:        resp.QuotaLimit,
		QuotaUsed:         resp.QuotaUsed,
		QuotaRemaining:    resp.QuotaRemaining,
	})
}

// ── Search Provider Config Handlers ─────────────────────────────────────────

type searchProviderResponse struct {
	Provider        string `json:"provider"`
	Label           string `json:"label"`
	Enabled         bool   `json:"enabled"`
	HasAPIKey       bool   `json:"has_api_key"`
	BaseURL         string `json:"base_url,omitempty"`
	AuthUsername    string `json:"auth_username,omitempty"`
	RequiresAPIKey  bool   `json:"requires_api_key"`
	RequiresBaseURL bool   `json:"requires_base_url"`
	DefaultBaseURL  string `json:"default_base_url,omitempty"`
	Priority        int    `json:"priority"`
	UpdatedAt       int64  `json:"updated_at,omitempty"`
	// Source is "organization"/"platform" for providers resolved from a
	// connected seshat-server rather than personally configured — see
	// internal/cloudwebsearch.
	Source string `json:"source,omitempty"`
}

func providerStatusToResponse(p backendwebsearch.ProviderStatus) searchProviderResponse {
	var updatedAt int64
	if !p.UpdatedAt.IsZero() {
		updatedAt = p.UpdatedAt.Unix()
	}
	return searchProviderResponse{
		Provider:        p.Provider,
		Label:           p.Label,
		Enabled:         p.Enabled,
		HasAPIKey:       p.HasAPIKey,
		BaseURL:         p.BaseURL,
		AuthUsername:    p.AuthUsername,
		RequiresAPIKey:  p.RequiresAPIKey,
		RequiresBaseURL: p.RequiresBaseURL,
		DefaultBaseURL:  p.DefaultBaseURL,
		Priority:        p.Priority,
		Source:          p.Source,
		UpdatedAt:       updatedAt,
	}
}

// GET /api/v1/web/search/providers
func (a *App) handleWebSearchProviders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	list, err := a.backend.WebSearch.ListProviders(r.Context(), principal)
	if err != nil {
		writeBackendError(w, err)
		return
	}
	items := make([]searchProviderResponse, 0, len(list))
	for _, p := range list {
		items = append(items, providerStatusToResponse(p))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"providers": items,
		"count":     len(items),
	})
}

// PUT  /api/v1/web/search/providers/{name}
// POST /api/v1/web/search/providers/{name}/test
func (a *App) handleWebSearchProviderByName(w http.ResponseWriter, r *http.Request) {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	// Path: /web/search/providers/{name}  or  /web/search/providers/{name}/test
	path := r.URL.Path
	const prefix = "/web/search/providers/"
	tail := path[len(prefix):]

	isTest := false
	providerName := tail
	if len(tail) > 5 && tail[len(tail)-5:] == "/test" {
		isTest = true
		providerName = tail[:len(tail)-5]
	}

	if providerName == "" {
		writeJSONError(w, http.StatusBadRequest, "provider name required")
		return
	}

	if isTest {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		result, err := a.backend.WebSearch.TestProvider(r.Context(), principal, providerName)
		if err != nil {
			writeBackendError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":         result.OK,
			"latency_ms": result.LatencyMs,
			"error":      result.Error,
		})
		return
	}

	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		Enabled      bool    `json:"enabled"`
		APIKey       *string `json:"api_key"`
		BaseURL      string  `json:"base_url"`
		AuthUsername *string `json:"auth_username"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}

	status, err := a.backend.WebSearch.UpsertProvider(r.Context(), principal, providerName, backendwebsearch.UpsertProviderParams{
		Enabled:      body.Enabled,
		APIKey:       body.APIKey,
		BaseURL:      body.BaseURL,
		AuthUsername: body.AuthUsername,
	})
	if err != nil {
		writeBackendError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, providerStatusToResponse(*status))
}

func (a *App) handleWebSearchLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if value, err := strconv.Atoi(raw); err == nil {
			limit = value
		}
	}
	logs, err := a.backend.WebSearch.ListLogs(r.Context(), principal, limit)
	if err != nil {
		writeBackendError(w, err)
		return
	}
	items := make([]webSearchLogResponse, 0, len(logs))
	for _, log := range logs {
		items = append(items, webSearchLogToResponse(log))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"logs":  items,
		"count": len(items),
	})
}

// GET /api/v1/web/search/domain-catalog
func (a *App) handleWebSearchDomainCatalog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		writeJSONError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	catalog := webpolicy.DomainCatalog()
	writeJSON(w, http.StatusOK, map[string]any{
		"categories": catalog,
	})
}
