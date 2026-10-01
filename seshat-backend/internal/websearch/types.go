package websearch

import (
	"context"
	"time"

	webcore "github.com/KPO-Tech/seshat/pkg/web"
)

// ProviderCatalogEntry describes a search provider type and its requirements.
type ProviderCatalogEntry struct {
	Name            string
	Label           string
	Description     string
	RequiresAPIKey  bool
	RequiresBaseURL bool
	DefaultBaseURL  string
	Priority        int
}

// ProviderStatus is the runtime state of a configured provider.
type ProviderStatus struct {
	Provider        string
	Label           string
	Enabled         bool
	HasAPIKey       bool
	BaseURL         string
	AuthUsername    string
	RequiresAPIKey  bool
	RequiresBaseURL bool
	DefaultBaseURL  string
	Priority        int
	UpdatedAt       time.Time
	// Source is "organization"/"platform" when this provider isn't
	// personally configured but was resolved from a connected seshat-server
	// (see cloudwebsearch); empty for personally configured/unconfigured
	// entries.
	Source string
}

// UpsertProviderParams is the input for creating/updating a provider config.
type UpsertProviderParams struct {
	Enabled      bool
	APIKey       *string // nil = keep existing (used as Basic Auth password for SearXNG)
	BaseURL      string
	AuthUsername *string // nil = keep existing; ptr-to-"" = clear
}

// ProviderTestResult is returned by the test endpoint.
type ProviderTestResult struct {
	OK        bool
	LatencyMs int64
	Error     string
}

const (
	LogStatusSuccess       = "success"
	LogStatusFailed        = "failed"
	LogStatusBlocked       = "blocked"
	LogStatusQuotaExceeded = "quota_exceeded"
)

type Settings struct {
	ID                 string
	UserID             string
	Enabled            bool
	ProviderSettingIDs []string
	AllowEnvFallback   bool
	AllowedDomains     []string
	BlockedDomains     []string
	MaxQueriesPerDay   int
	CreatedAt          time.Time
	UpdatedAt          time.Time
	// OrgAllowedDomains/OrgBlockedDomains are the subset of
	// AllowedDomains/BlockedDomains contributed by the connected
	// seshat-server's org policy (already merged into the two fields
	// above) — exposed separately only so the UI can show a "your
	// organization blocks N domains" note; empty in standalone mode.
	OrgAllowedDomains []string
	OrgBlockedDomains []string
}

type UpdateSettingsParams struct {
	Enabled            bool
	ProviderSettingIDs []string
	AllowEnvFallback   bool
	AllowedDomains     []string
	BlockedDomains     []string
	MaxQueriesPerDay   int
}

type SearchParams struct {
	Query             string
	ProviderSettingID string
	AllowedDomains    []string
	BlockedDomains    []string
}

type SearchResponse struct {
	Query             string
	Provider          string
	ProviderSettingID string
	AllowedDomains    []string
	BlockedDomains    []string
	Results           []webcore.SearchResult
	DurationSeconds   float64
	QuotaLimit        int
	QuotaUsed         int
	QuotaRemaining    int
}

type SearchLog struct {
	ID                string
	UserID            string
	ProviderSettingID string
	Provider          string
	Query             string
	Status            string
	ErrorMessage      string
	AllowedDomains    []string
	BlockedDomains    []string
	ResultCount       int
	DurationMillis    int64
	CreatedAt         time.Time
}

type SearchRunProvider struct {
	SettingID    string
	Provider     string
	BaseURL      string
	Secret       string
	AuthUsername string
}

type SearchRunRequest struct {
	Query            string
	AllowedDomains   []string
	BlockedDomains   []string
	Providers        []SearchRunProvider
	AllowEnvFallback bool
}

type SearchRunResult struct {
	Provider          string
	ProviderSettingID string
	Results           []webcore.SearchResult
	DurationSeconds   float64
}

type Runner interface {
	Search(ctx context.Context, request SearchRunRequest) (*SearchRunResult, error)
}
