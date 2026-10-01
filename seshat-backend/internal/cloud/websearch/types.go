// Package cloudwebsearch fetches an organization's web-search provider
// credentials and domain policy from seshat-server, to enrich
// seshat-backend's own local provider resolution chain
// (internal/websearch.Service.resolveProviders). Like cloudskillregistry,
// this is purely additive — the local, personally-configured providers stay
// authoritative, the org/platform config is one more candidate source
// merged in per-request, never a Provider that replaces anything (see
// helps/seshat-architecture-target.md §3, "Web search").
package cloudwebsearch

// ResolvedProviderSetting mirrors seshat-server's
// websearchsettings.ResolvedWebSearchProviderSetting.
type ResolvedProviderSetting struct {
	Provider     string `json:"provider"`
	BaseURL      string `json:"base_url,omitempty"`
	AuthUsername string `json:"auth_username,omitempty"`
	APIKey       string `json:"api_key"`
	Source       string `json:"source"` // "organization" | "platform"
}

// OrgPolicy mirrors seshat-server's websearchsettings.OrgPolicy (only the
// fields relevant to enrichment — id/audit fields aren't needed locally).
type OrgPolicy struct {
	AllowedDomains []string `json:"allowed_domains"`
	BlockedDomains []string `json:"blocked_domains"`
}
