package websearch

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/websearch"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	backendsettings "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/settings"
	searchproviders "github.com/KPO-Tech/seshat/pkg/web/search/providers"
)

// cloudCacheTTL bounds how long a connected org's web-search config
// (provider credentials, domain policy) is reused before being re-fetched.
// This config changes rarely (an admin editing it in Seshat Console) but
// was otherwise being re-resolved over HTTP on every single search/list
// call; a short cache cuts that down to at most one fetch per window,
// shared across every user of the org, while still picking up admin
// changes within a bounded, short delay.
const cloudCacheTTL = 30 * time.Second

type Service struct {
	settings        *db.WebSearchSettingStore
	logs            *db.WebSearchLogStore
	providerConfigs *db.SearchProviderConfigStore
	providers       *backendsettings.Service
	runner          Runner
	// cloudClient is nil in standalone mode. When set (connected mode, see
	// internal/config/bootstrap.go), org/platform web-search providers not
	// personally configured are merged into the resolution chain and org
	// domain policy is merged into effective settings — see
	// internal/cloudwebsearch's package doc for why this is additive
	// enrichment rather than a Provider swap. The organization itself is
	// resolved fresh per call from the caller's own principal (see
	// auth.Principal.OrganizationID), not stored on the Service - see
	// agents.Service's doc comment for why. The caches below are keyed by
	// organization id for the same reason: a shared backend process serving
	// requests for more than one organization must not leak one org's
	// cached provider config to another's request.
	cloudClient *cloudwebsearch.Client

	cloudProvidersCache cloudProvidersCache
	orgPolicyCache      orgPolicyCache
}

func NewService(settingsStore *db.WebSearchSettingStore, logStore *db.WebSearchLogStore, providerConfigs *db.SearchProviderConfigStore, providerSettings *backendsettings.Service, runner Runner, cloudClient *cloudwebsearch.Client) *Service {
	if runner == nil {
		runner = NewDefaultRunner()
	}
	return &Service{
		settings:        settingsStore,
		logs:            logStore,
		providerConfigs: providerConfigs,
		providers:       providerSettings,
		runner:          runner,
		cloudClient:     cloudClient,
	}
}

// cloudCandidate is one provider resolved from a connected seshat-server,
// not personally configured locally.
type cloudCandidate struct {
	provider string
	resolved *cloudwebsearch.ResolvedProviderSetting
}

// cloudProvidersCache holds each org's full catalog resolution (every
// provider, not filtered to any one user's personal config) — the personal
// skip-filter is applied per-caller after reading the cache, since which
// providers a given user has already configured varies but the org's own
// credentials don't. Keyed by organization id (see Service.cloudClient's
// doc comment for why: this Service resolves the org fresh per call now,
// not once at startup, so a single unkeyed cache slot could otherwise leak
// one org's config into another org's request on a shared backend process).
type cloudProvidersCache struct {
	mu    sync.Mutex
	byOrg map[string]cloudProvidersCacheEntry
}

type cloudProvidersCacheEntry struct {
	results   []cloudCandidate
	fetchedAt time.Time
}

type orgPolicyCache struct {
	mu    sync.Mutex
	byOrg map[string]orgPolicyCacheEntry
}

type orgPolicyCacheEntry struct {
	policy    *cloudwebsearch.OrgPolicy
	fetchedAt time.Time
}

// resolveCloudProviders returns every catalog provider not in skip that the
// connected seshat-server has configured (org or platform tier) for
// organizationID, serving from a short-lived cache shared across all
// requests for that same org when fresh. Any provider that errors (most
// commonly: nothing configured for it) is silently omitted — this is
// enrichment, never a hard dependency.
func (s *Service) resolveCloudProviders(ctx context.Context, token, organizationID string, skip map[string]bool) []cloudCandidate {
	if s.cloudClient == nil || organizationID == "" || token == "" {
		return nil
	}
	all := s.allCloudProviders(ctx, token, organizationID)
	if len(skip) == 0 {
		return all
	}
	out := make([]cloudCandidate, 0, len(all))
	for _, cand := range all {
		if !skip[cand.provider] {
			out = append(out, cand)
		}
	}
	return out
}

// allCloudProviders resolves organizationID's ENTIRE catalog (unfiltered),
// using the cache when fresh. Deliberately ignores any per-caller skip set
// so the underlying network fetch — and its cache entry — can be shared by
// every user of that org, not just the one making this particular call.
func (s *Service) allCloudProviders(ctx context.Context, token, organizationID string) []cloudCandidate {
	s.cloudProvidersCache.mu.Lock()
	if s.cloudProvidersCache.byOrg == nil {
		s.cloudProvidersCache.byOrg = map[string]cloudProvidersCacheEntry{}
	}
	if entry, ok := s.cloudProvidersCache.byOrg[organizationID]; ok && time.Since(entry.fetchedAt) < cloudCacheTTL {
		s.cloudProvidersCache.mu.Unlock()
		return entry.results
	}
	s.cloudProvidersCache.mu.Unlock()

	var (
		wg      sync.WaitGroup
		mu      sync.Mutex
		results []cloudCandidate
	)
	for _, cat := range providerCatalog {
		name := cat.Name
		wg.Add(1)
		go func() {
			defer wg.Done()
			resolved, err := s.cloudClient.ResolveProviderSetting(ctx, token, organizationID, name)
			if err != nil || resolved == nil {
				return
			}
			mu.Lock()
			results = append(results, cloudCandidate{provider: name, resolved: resolved})
			mu.Unlock()
		}()
	}
	wg.Wait()

	s.cloudProvidersCache.mu.Lock()
	s.cloudProvidersCache.byOrg[organizationID] = cloudProvidersCacheEntry{results: results, fetchedAt: time.Now()}
	s.cloudProvidersCache.mu.Unlock()
	return results
}

// getOrgPolicy fetches organizationID's web-search domain policy, using the
// cache when fresh — see cloudCacheTTL.
func (s *Service) getOrgPolicy(ctx context.Context, token, organizationID string) *cloudwebsearch.OrgPolicy {
	s.orgPolicyCache.mu.Lock()
	if s.orgPolicyCache.byOrg == nil {
		s.orgPolicyCache.byOrg = map[string]orgPolicyCacheEntry{}
	}
	if entry, ok := s.orgPolicyCache.byOrg[organizationID]; ok && time.Since(entry.fetchedAt) < cloudCacheTTL {
		s.orgPolicyCache.mu.Unlock()
		return entry.policy
	}
	s.orgPolicyCache.mu.Unlock()

	policy, err := s.cloudClient.GetOrgPolicy(ctx, token, organizationID)
	if err != nil {
		return nil
	}
	s.orgPolicyCache.mu.Lock()
	s.orgPolicyCache.byOrg[organizationID] = orgPolicyCacheEntry{policy: policy, fetchedAt: time.Now()}
	s.orgPolicyCache.mu.Unlock()
	return policy
}

// ── Provider catalog & config management ─────────────────────────────────────

var providerCatalog = []ProviderCatalogEntry{
	{Name: "tavily", Label: "Tavily", Description: "AI-powered search API — high-quality results", RequiresAPIKey: true, Priority: 10},
	{Name: "exa", Label: "Exa", Description: "Neural search engine for AI applications", RequiresAPIKey: true, Priority: 20},
	{Name: "jina", Label: "Jina AI", Description: "AI-native search with reader API", RequiresAPIKey: true, Priority: 30},
	{Name: "langsearch", Label: "LangSearch", Description: "Free API key, AI-optimised results", RequiresAPIKey: true, Priority: 35},
	{Name: "searxng", Label: "SearXNG", Description: "Self-hosted privacy-focused meta-search", RequiresBaseURL: true, DefaultBaseURL: "http://localhost:8080", Priority: 40},
}

func catalogByName(name string) *ProviderCatalogEntry {
	for i := range providerCatalog {
		if providerCatalog[i].Name == name {
			return &providerCatalog[i]
		}
	}
	return nil
}

func (s *Service) ListProviders(ctx context.Context, principal *backendauth.Principal) ([]ProviderStatus, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	if s.providerConfigs == nil {
		return nil, bkerr.Unavailable("search provider config store not configured", nil)
	}

	rows, err := s.providerConfigs.ListByUserID(ctx, principal.User.ID)
	if err != nil {
		return nil, bkerr.Internal("list search provider configs: "+err.Error(), err)
	}

	// index by provider name for quick lookup
	configured := make(map[string]db.SearchProviderConfig, len(rows))
	for _, r := range rows {
		configured[r.Provider] = r
	}

	result := make([]ProviderStatus, 0, len(providerCatalog))
	for _, cat := range providerCatalog {
		status := ProviderStatus{
			Provider:        cat.Name,
			Label:           cat.Label,
			RequiresAPIKey:  cat.RequiresAPIKey,
			RequiresBaseURL: cat.RequiresBaseURL,
			DefaultBaseURL:  cat.DefaultBaseURL,
			Priority:        cat.Priority,
		}
		if row, ok := configured[cat.Name]; ok {
			status.Enabled = row.Enabled
			status.HasAPIKey = row.HasAPIKey
			status.BaseURL = row.BaseURL
			status.AuthUsername = row.AuthUsername
			status.UpdatedAt = row.UpdatedAt
		} else {
			// No config row yet: providers that need no credentials are enabled by default
			status.Enabled = !cat.RequiresAPIKey && !cat.RequiresBaseURL
			if cat.DefaultBaseURL != "" {
				status.BaseURL = cat.DefaultBaseURL
			}
		}
		result = append(result, status)
	}

	if s.cloudClient != nil {
		skip := make(map[string]bool, len(configured))
		for name, row := range configured {
			if row.Enabled {
				skip[name] = true
			}
		}
		for _, cand := range s.resolveCloudProviders(ctx, principal.AuthSession.ID, principal.OrganizationID(), skip) {
			for i := range result {
				if result[i].Provider != cand.provider {
					continue
				}
				result[i].Enabled = true
				result[i].HasAPIKey = cand.resolved.APIKey != ""
				result[i].BaseURL = cand.resolved.BaseURL
				result[i].AuthUsername = cand.resolved.AuthUsername
				result[i].Source = cand.resolved.Source
				break
			}
		}
	}
	return result, nil
}

func (s *Service) UpsertProvider(ctx context.Context, principal *backendauth.Principal, providerName string, params UpsertProviderParams) (*ProviderStatus, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	if s.providerConfigs == nil {
		return nil, bkerr.Unavailable("search provider config store not configured", nil)
	}
	cat := catalogByName(normalizeSearchProvider(providerName))
	if cat == nil {
		return nil, bkerr.InvalidInput(fmt.Sprintf("unknown search provider %q", providerName), nil)
	}
	// Clearing an API key is allowed even when the provider requires one — just store empty.

	row, err := s.providerConfigs.Upsert(ctx, db.UpsertSearchProviderConfigParams{
		UserID:       principal.User.ID,
		Provider:     cat.Name,
		Enabled:      params.Enabled,
		APIKey:       params.APIKey,
		BaseURL:      params.BaseURL,
		AuthUsername: params.AuthUsername,
	})
	if err != nil {
		return nil, bkerr.Internal("upsert search provider config: "+err.Error(), err)
	}

	status := &ProviderStatus{
		Provider:        cat.Name,
		Label:           cat.Label,
		Enabled:         row.Enabled,
		HasAPIKey:       row.HasAPIKey,
		BaseURL:         row.BaseURL,
		AuthUsername:    row.AuthUsername,
		RequiresAPIKey:  cat.RequiresAPIKey,
		RequiresBaseURL: cat.RequiresBaseURL,
		DefaultBaseURL:  cat.DefaultBaseURL,
		Priority:        cat.Priority,
		UpdatedAt:       row.UpdatedAt,
	}
	return status, nil
}

func (s *Service) TestProvider(ctx context.Context, principal *backendauth.Principal, providerName string) (*ProviderTestResult, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	if s.providerConfigs == nil {
		return nil, bkerr.Unavailable("search provider config store not configured", nil)
	}
	cat := catalogByName(normalizeSearchProvider(providerName))
	if cat == nil {
		return nil, bkerr.InvalidInput(fmt.Sprintf("unknown search provider %q", providerName), nil)
	}

	apiKey := ""
	baseURL := cat.DefaultBaseURL
	authUsername := ""
	if row, err := s.providerConfigs.GetByUserAndProvider(ctx, principal.User.ID, cat.Name); err == nil {
		baseURL = row.BaseURL
		authUsername = row.AuthUsername
		if row.HasAPIKey {
			apiKey, _ = s.providerConfigs.GetDecryptedAPIKey(ctx, principal.User.ID, cat.Name)
		}
	}

	runCfg := SearchRunProvider{
		Provider:     cat.Name,
		BaseURL:      baseURL,
		Secret:       apiKey,
		AuthUsername: authUsername,
	}
	provider, err := providerFromRunConfig(runCfg)
	if err != nil {
		return &ProviderTestResult{OK: false, Error: err.Error()}, nil
	}

	start := time.Now()
	_, err = provider.Search(searchproviders.SearchInput{Query: "test"})
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return &ProviderTestResult{OK: false, LatencyMs: latency, Error: err.Error()}, nil
	}
	return &ProviderTestResult{OK: true, LatencyMs: latency}, nil
}

func (s *Service) GetSettings(ctx context.Context, principal *backendauth.Principal) (*Settings, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	if s == nil || s.settings == nil || s.providers == nil {
		return nil, bkerr.Unavailable("web search settings store not configured", nil)
	}
	var result *Settings
	row, err := s.settings.GetByUserID(ctx, principal.User.ID)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "not found") {
			result = defaultSettings(principal.User.ID)
		} else {
			return nil, bkerr.Internal("get web search settings: "+err.Error(), err)
		}
	} else {
		result = settingsFromDB(*row)
	}

	// Org domain policy merge: blocked domains are always applied on top of
	// the user's own list (not user-removable locally), allowed domains are
	// additive. Any failure (offline, no policy set, etc.) silently keeps
	// the local-only policy — this is enrichment, never a hard dependency.
	if s.cloudClient != nil && principal.OrganizationID() != "" {
		if policy := s.getOrgPolicy(ctx, principal.AuthSession.ID, principal.OrganizationID()); policy != nil {
			result.OrgBlockedDomains = normalizeDomains(policy.BlockedDomains)
			result.OrgAllowedDomains = normalizeDomains(policy.AllowedDomains)
			result.BlockedDomains = unionDomains(result.BlockedDomains, result.OrgBlockedDomains)
			result.AllowedDomains = unionDomains(result.AllowedDomains, result.OrgAllowedDomains)
		}
	}
	return result, nil
}

func (s *Service) UpdateSettings(ctx context.Context, principal *backendauth.Principal, params UpdateSettingsParams) (*Settings, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	if s == nil || s.settings == nil {
		return nil, bkerr.Unavailable("web search settings store not configured", nil)
	}
	if params.MaxQueriesPerDay < 0 {
		return nil, bkerr.InvalidInput("max_queries_per_day cannot be negative", nil)
	}
	providerSettingIDs := normalizeStringSlice(params.ProviderSettingIDs)
	for _, settingID := range providerSettingIDs {
		setting, err := s.providers.Get(ctx, principal, settingID)
		if err != nil {
			return nil, err
		}
		if !isSupportedSearchProvider(setting.Provider) {
			return nil, bkerr.InvalidInput(fmt.Sprintf("provider setting %s uses unsupported search provider %s", settingID, setting.Provider), nil)
		}
	}
	row, err := s.settings.Upsert(ctx, db.UpsertWebSearchSettingParams{
		UserID:             principal.User.ID,
		Enabled:            params.Enabled,
		ProviderSettingIDs: providerSettingIDs,
		AllowEnvFallback:   params.AllowEnvFallback,
		AllowedDomains:     normalizeDomains(params.AllowedDomains),
		BlockedDomains:     normalizeDomains(params.BlockedDomains),
		MaxQueriesPerDay:   params.MaxQueriesPerDay,
	})
	if err != nil {
		return nil, bkerr.Internal("update web search settings: "+err.Error(), err)
	}
	return settingsFromDB(*row), nil
}

func (s *Service) Search(ctx context.Context, principal *backendauth.Principal, params SearchParams) (*SearchResponse, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	if s == nil || s.settings == nil || s.logs == nil || s.providers == nil || s.runner == nil {
		return nil, bkerr.Unavailable("web search service not configured", nil)
	}
	if strings.TrimSpace(params.Query) == "" {
		return nil, bkerr.InvalidInput("query is required", nil)
	}

	currentSettings, err := s.GetSettings(ctx, principal)
	if err != nil {
		return nil, err
	}
	if !currentSettings.Enabled {
		_ = s.logAttempt(ctx, principal.User.ID, "", "", params.Query, LogStatusBlocked, "web search is disabled", nil, nil, 0, 0)
		return nil, bkerr.Forbidden("web search is disabled", nil)
	}

	allowedDomains, blockedDomains, err := applyPolicy(currentSettings, params)
	if err != nil {
		_ = s.logAttempt(ctx, principal.User.ID, "", "", params.Query, LogStatusBlocked, err.Error(), allowedDomains, blockedDomains, 0, 0)
		return nil, err
	}

	quotaUsed, quotaRemaining, err := s.quotaState(ctx, principal.User.ID, currentSettings.MaxQueriesPerDay)
	if err != nil {
		return nil, err
	}
	if currentSettings.MaxQueriesPerDay > 0 && quotaRemaining <= 0 {
		_ = s.logAttempt(ctx, principal.User.ID, "", "", params.Query, LogStatusQuotaExceeded, "daily web search quota exceeded", allowedDomains, blockedDomains, 0, 0)
		return nil, bkerr.RateLimit("daily web search quota exceeded", nil)
	}

	providerConfigs, err := s.resolveProviders(ctx, principal, currentSettings, strings.TrimSpace(params.ProviderSettingID))
	if err != nil {
		_ = s.logAttempt(ctx, principal.User.ID, "", "", params.Query, LogStatusFailed, err.Error(), allowedDomains, blockedDomains, 0, 0)
		return nil, err
	}

	start := time.Now()
	result, err := s.runner.Search(ctx, SearchRunRequest{
		Query:            strings.TrimSpace(params.Query),
		AllowedDomains:   allowedDomains,
		BlockedDomains:   blockedDomains,
		Providers:        providerConfigs,
		AllowEnvFallback: currentSettings.AllowEnvFallback,
	})
	durationMillis := time.Since(start).Milliseconds()
	if err != nil {
		_ = s.logAttempt(ctx, principal.User.ID, "", "", params.Query, LogStatusFailed, err.Error(), allowedDomains, blockedDomains, 0, durationMillis)
		return nil, bkerr.Internal("web search failed: "+err.Error(), err)
	}

	_ = s.logAttempt(ctx, principal.User.ID, result.ProviderSettingID, result.Provider, params.Query, LogStatusSuccess, "", allowedDomains, blockedDomains, len(result.Results), durationMillis)

	quotaUsed++
	quotaRemaining = remainingQuota(currentSettings.MaxQueriesPerDay, quotaUsed)
	return &SearchResponse{
		Query:             strings.TrimSpace(params.Query),
		Provider:          result.Provider,
		ProviderSettingID: result.ProviderSettingID,
		AllowedDomains:    allowedDomains,
		BlockedDomains:    blockedDomains,
		Results:           result.Results,
		DurationSeconds:   result.DurationSeconds,
		QuotaLimit:        currentSettings.MaxQueriesPerDay,
		QuotaUsed:         quotaUsed,
		QuotaRemaining:    quotaRemaining,
	}, nil
}

func (s *Service) ListLogs(ctx context.Context, principal *backendauth.Principal, limit int) ([]SearchLog, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	if s == nil || s.logs == nil {
		return nil, bkerr.Unavailable("web search log store not configured", nil)
	}
	rows, err := s.logs.ListByUserID(ctx, principal.User.ID, limit)
	if err != nil {
		return nil, bkerr.Internal("list web search logs: "+err.Error(), err)
	}
	result := make([]SearchLog, 0, len(rows))
	for _, row := range rows {
		result = append(result, *logFromDB(row))
	}
	return result, nil
}

func (s *Service) resolveProviders(ctx context.Context, principal *backendauth.Principal, currentSettings *Settings, explicitSettingID string) ([]SearchRunProvider, error) {
	// Primary path: use the new per-user search_provider_configs table.
	if s.providerConfigs != nil && explicitSettingID == "" {
		rows, err := s.providerConfigs.ListByUserID(ctx, principal.User.ID)
		if err == nil {
			var configs []SearchRunProvider
			personallyEnabled := make(map[string]bool, len(rows))
			for _, row := range rows {
				if !row.Enabled {
					continue
				}
				personallyEnabled[row.Provider] = true
				cat := catalogByName(row.Provider)
				baseURL := row.BaseURL
				if baseURL == "" && cat != nil {
					baseURL = cat.DefaultBaseURL
				}
				apiKey := ""
				if row.HasAPIKey {
					apiKey, _ = s.providerConfigs.GetDecryptedAPIKey(ctx, principal.User.ID, row.Provider)
				}
				configs = append(configs, SearchRunProvider{
					Provider:     row.Provider,
					BaseURL:      strings.TrimSpace(baseURL),
					Secret:       strings.TrimSpace(apiKey),
					AuthUsername: row.AuthUsername,
				})
			}
			if s.cloudClient != nil {
				for _, cand := range s.resolveCloudProviders(ctx, principal.AuthSession.ID, principal.OrganizationID(), personallyEnabled) {
					configs = append(configs, SearchRunProvider{
						Provider:     cand.provider,
						BaseURL:      strings.TrimSpace(cand.resolved.BaseURL),
						Secret:       strings.TrimSpace(cand.resolved.APIKey),
						AuthUsername: cand.resolved.AuthUsername,
					})
				}
			}
			if len(configs) > 0 {
				// Sort by catalog priority so higher-priority providers are tried first.
				sort.SliceStable(configs, func(i, j int) bool {
					pi, pj := 999, 999
					if ci := catalogByName(configs[i].Provider); ci != nil {
						pi = ci.Priority
					}
					if cj := catalogByName(configs[j].Provider); cj != nil {
						pj = cj.Priority
					}
					return pi < pj
				})
				return configs, nil
			}
		}
	}

	// Legacy path: use provider_setting_ids from web_search_settings.
	var settingIDs []string
	if explicitSettingID != "" {
		settingIDs = []string{explicitSettingID}
	} else {
		settingIDs = append([]string(nil), currentSettings.ProviderSettingIDs...)
	}

	configs := make([]SearchRunProvider, 0, len(settingIDs))
	for _, settingID := range settingIDs {
		cfg, err := s.providers.ResolveRuntimeConfig(ctx, principal, settingID)
		if err != nil {
			if explicitSettingID != "" {
				return nil, err
			}
			continue
		}
		if !isSupportedSearchProvider(cfg.Provider) {
			if explicitSettingID != "" {
				return nil, bkerr.InvalidInput(fmt.Sprintf("provider %s is not supported for web search", cfg.Provider), nil)
			}
			continue
		}
		configs = append(configs, SearchRunProvider{
			SettingID: cfg.SettingID,
			Provider:  normalizeSearchProvider(cfg.Provider),
			BaseURL:   strings.TrimSpace(cfg.BaseURL),
			Secret:    strings.TrimSpace(cfg.Secret),
		})
	}

	if len(configs) == 0 && !currentSettings.AllowEnvFallback {
		if explicitSettingID != "" {
			return nil, bkerr.InvalidInput("selected provider setting is not usable for web search", nil)
		}
		return nil, bkerr.InvalidInput("no usable web search provider settings configured", nil)
	}
	return configs, nil
}

func (s *Service) quotaState(ctx context.Context, userID string, limit int) (int, int, error) {
	if limit <= 0 {
		return 0, 0, nil
	}
	since := time.Now().UTC().Truncate(24 * time.Hour)
	count, err := s.logs.CountByUserIDSince(ctx, userID, since)
	if err != nil {
		return 0, 0, bkerr.Internal("count web search quota: "+err.Error(), err)
	}
	used := int(count)
	return used, remainingQuota(limit, used), nil
}

func remainingQuota(limit, used int) int {
	if limit <= 0 {
		return 0
	}
	remaining := limit - used
	if remaining < 0 {
		return 0
	}
	return remaining
}

func (s *Service) logAttempt(ctx context.Context, userID, providerSettingID, provider, query, status, errMsg string, allowedDomains, blockedDomains []string, resultCount int, durationMillis int64) error {
	if s == nil || s.logs == nil {
		return nil
	}
	_, err := s.logs.Create(ctx, db.CreateWebSearchLogParams{
		UserID:            userID,
		ProviderSettingID: providerSettingID,
		Provider:          provider,
		Query:             query,
		Status:            status,
		ErrorMessage:      errMsg,
		AllowedDomains:    allowedDomains,
		BlockedDomains:    blockedDomains,
		ResultCount:       resultCount,
		DurationMillis:    durationMillis,
	})
	return err
}

func settingsFromDB(row db.WebSearchSetting) *Settings {
	return &Settings{
		ID:                 row.ID,
		UserID:             row.UserID,
		Enabled:            row.Enabled,
		ProviderSettingIDs: append([]string(nil), row.ProviderSettingIDs...),
		AllowEnvFallback:   row.AllowEnvFallback,
		AllowedDomains:     append([]string(nil), row.AllowedDomains...),
		BlockedDomains:     append([]string(nil), row.BlockedDomains...),
		MaxQueriesPerDay:   row.MaxQueriesPerDay,
		CreatedAt:          row.CreatedAt,
		UpdatedAt:          row.UpdatedAt,
	}
}

func logFromDB(row db.WebSearchLog) *SearchLog {
	return &SearchLog{
		ID:                row.ID,
		UserID:            row.UserID,
		ProviderSettingID: row.ProviderSettingID,
		Provider:          row.Provider,
		Query:             row.Query,
		Status:            row.Status,
		ErrorMessage:      row.ErrorMessage,
		AllowedDomains:    append([]string(nil), row.AllowedDomains...),
		BlockedDomains:    append([]string(nil), row.BlockedDomains...),
		ResultCount:       row.ResultCount,
		DurationMillis:    row.DurationMillis,
		CreatedAt:         row.CreatedAt,
	}
}

func defaultSettings(userID string) *Settings {
	return &Settings{
		UserID:           userID,
		Enabled:          true,
		AllowEnvFallback: true,
	}
}

func normalizeDomains(values []string) []string {
	seen := make(map[string]bool, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(strings.ToLower(value))
		value = strings.TrimPrefix(value, "https://")
		value = strings.TrimPrefix(value, "http://")
		value = strings.TrimPrefix(value, "www.")
		value = strings.Trim(value, "/")
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}

func normalizeStringSlice(values []string) []string {
	seen := make(map[string]bool, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}

func applyPolicy(settings *Settings, params SearchParams) ([]string, []string, error) {
	requestAllowed := normalizeDomains(params.AllowedDomains)
	requestBlocked := normalizeDomains(params.BlockedDomains)
	policyAllowed := normalizeDomains(settings.AllowedDomains)
	policyBlocked := normalizeDomains(settings.BlockedDomains)

	var allowed []string
	switch {
	case len(policyAllowed) == 0:
		allowed = requestAllowed
	case len(requestAllowed) == 0:
		allowed = policyAllowed
	default:
		allowed = intersectDomains(requestAllowed, policyAllowed)
		if len(allowed) == 0 {
			return nil, nil, bkerr.Forbidden("requested domains are outside the allowed policy", nil)
		}
	}

	blocked := unionDomains(policyBlocked, requestBlocked)
	if len(allowed) > 0 {
		allowed = subtractDomains(allowed, blocked)
		if len(allowed) == 0 {
			return nil, nil, bkerr.Forbidden("all requested domains are blocked by policy", nil)
		}
	}
	return allowed, blocked, nil
}

func intersectDomains(left, right []string) []string {
	rightSet := make(map[string]bool, len(right))
	for _, value := range right {
		rightSet[value] = true
	}
	result := make([]string, 0, len(left))
	for _, value := range left {
		if rightSet[value] {
			result = append(result, value)
		}
	}
	return result
}

func unionDomains(values ...[]string) []string {
	var result []string
	seen := make(map[string]bool)
	for _, group := range values {
		for _, value := range group {
			if value == "" || seen[value] {
				continue
			}
			seen[value] = true
			result = append(result, value)
		}
	}
	return result
}

func subtractDomains(values, blocked []string) []string {
	blockedSet := make(map[string]bool, len(blocked))
	for _, value := range blocked {
		blockedSet[value] = true
	}
	result := make([]string, 0, len(values))
	for _, value := range values {
		if !blockedSet[value] {
			result = append(result, value)
		}
	}
	return result
}

func isSupportedSearchProvider(provider string) bool {
	switch normalizeSearchProvider(provider) {
	case "tavily", "exa", "jina", "langsearch", "searxng", "ddg":
		return true
	default:
		return false
	}
}

// ResolveKeysForUserID returns whether web search is enabled for the user and
// the decrypted API keys for all configured search providers.
// Intended for internal daemon callbacks — bypasses principal checks.
func (s *Service) ResolveKeysForUserID(ctx context.Context, userID string) (enabled bool, keys map[string]string, err error) {
	if s == nil || s.settings == nil || userID == "" {
		return false, nil, nil
	}
	row, err := s.settings.GetByUserID(ctx, userID)
	if err != nil || row == nil {
		return false, nil, err
	}
	enabled = row.Enabled

	configs, err := s.providerConfigs.ListByUserID(ctx, userID)
	if err != nil {
		return enabled, nil, err
	}
	keys = make(map[string]string)
	for _, cfg := range configs {
		if !cfg.Enabled {
			continue
		}
		apiKey, _ := s.providerConfigs.GetDecryptedAPIKey(ctx, userID, cfg.Provider)
		if apiKey != "" {
			keys[cfg.Provider] = apiKey
		}
	}
	return enabled, keys, nil
}
