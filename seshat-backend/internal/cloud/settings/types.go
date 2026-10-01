// Package cloudsettings makes seshat-backend a real provider-settings client
// of seshat-server's three-tier hierarchy — organization → platform default
// → local personal key (see helps/seshat-architecture-target.md §3). It
// implements settings.Provider, the same interface settings.LocalProvider
// implements for standalone mode.
package cloudsettings

// ResolvedProviderSetting mirrors seshat-server's automation.ResolvedProviderSetting
// — the one response in this domain that includes the decrypted API key,
// since the whole point is for a connected seshat-backend to actually use it.
type ResolvedProviderSetting struct {
	Provider     string `json:"provider"`
	DefaultModel string `json:"default_model"`
	BaseURL      string `json:"base_url,omitempty"`
	APIKey       string `json:"api_key"`
	Source       string `json:"source"` // "organization" | "platform"
}

// OrgProviderSetting mirrors seshat-server's automation.ProviderSetting — the
// organization-wide record, never a per-user one. Used only by the admin
// CRUD methods below (ListOrgProviderSettings and friends), which back
// seshat-backend's own Admin Console rather than Provider/settings.Provider
// (the per-user personal-key interface, unaffected by any of this). Never
// carries an API key: like its seshat-server counterpart, the key is
// caller-supplied on write and never echoed back.
type OrgProviderSetting struct {
	ID              string `json:"id"`
	OrganizationID  string `json:"organization_id"`
	CreatedByUserID string `json:"created_by_user_id"`
	Provider        string `json:"provider"`
	DefaultModel    string `json:"default_model"`
	BaseURL         string `json:"base_url,omitempty"`
	IsDefault       bool   `json:"is_default"`
}
