package settings

import (
	"sort"
	"strings"

	"github.com/KPO-Tech/seshat-runtime/pkg/config"
	"github.com/KPO-Tech/seshat-runtime/pkg/sdk"
)

// CatalogEntry describes a provider the user can set up: one of the providers built into the runtime (Main), or a generic provider of the
// public models.dev catalog (about 190 of them, called with the OpenAI-compatible client).
type CatalogEntry struct {
	ID          string
	Name        string
	Description string
	// Main is true for the providers built into the runtime. The others come from the catalog and, for the most part, have not been
	// tried with a real key.
	Main     bool
	AuthType string
	// KeyEnvVars are the environment variables that can carry the provider's key, the first one first.
	KeyEnvVars []string
	// BaseURL is the address the catalog gives for a generic provider ("" for a built-in one, whose address the runtime knows).
	BaseURL    string
	ModelCount int
	// Unverified is true for a provider that only a downloaded catalog knows: its address was not reviewed, so the user must confirm
	// the base URL before a key is sent to it.
	Unverified bool
}

// legacyProviderNames maps the names of providers that used to be built into the runtime to their name now. Cloudflare Workers AI is a
// generic provider of the catalog since the runtime v1.11.
var legacyProviderNames = map[string]string{
	"workers-ai": "cloudflare-workers-ai",
	"workers_ai": "cloudflare-workers-ai",
	"workersai":  "cloudflare-workers-ai",
	"cloudflare": "cloudflare-workers-ai",
}

// CanonicalProvider returns the name the runtime uses for a provider the user or an older version of the backend named: lower case,
// trimmed, and with a former built-in name replaced by its current one.
func CanonicalProvider(name string) string {
	canonical := strings.ToLower(strings.TrimSpace(name))
	if current, ok := legacyProviderNames[canonical]; ok {
		return current
	}
	return canonical
}

// Catalog lists the providers a user can set up: the main ones first, in the runtime's order, then the catalog's, sorted by name
// without regard to case. The desktop shows the main ones and offers the rest behind "More providers".
func Catalog() []CatalogEntry {
	var out []CatalogEntry
	for _, p := range config.AvailableProviders() {
		entry := CatalogEntry{
			ID:          string(p.Name),
			Name:        p.DisplayName,
			Description: p.Description,
			Main:        true,
			AuthType:    p.AuthType,
			ModelCount:  len(p.Models),
		}
		for _, field := range p.SetupFields {
			if field.Secret && field.EnvVar != "" {
				entry.KeyEnvVars = append(entry.KeyEnvVars, field.EnvVar)
			}
		}
		out = append(out, entry)
	}
	more := sdk.CatalogProviders()
	sort.SliceStable(more, func(i, j int) bool { return strings.ToLower(more[i].Name) < strings.ToLower(more[j].Name) })
	for _, p := range more {
		out = append(out, CatalogEntry{
			ID:         p.ID,
			Name:       p.Name,
			AuthType:   "api_key",
			KeyEnvVars: append([]string(nil), p.KeyEnvVars...),
			BaseURL:    p.BaseURL,
			ModelCount: p.ModelCount,
			Unverified: p.Unverified,
		})
	}
	return out
}

// catalogProviderEntry returns the generic provider of the catalog with that name.
func catalogProviderEntry(name string) (sdk.CatalogProviderSummary, bool) {
	name = CanonicalProvider(name)
	for _, p := range sdk.CatalogProviders() {
		if p.ID == name {
			return p, true
		}
	}
	return sdk.CatalogProviderSummary{}, false
}

// IsVerifiedCatalogProvider reports whether name is a generic provider of the catalog that ships reviewed with the runtime (its address
// is the one the runtime was built with), as opposed to one that only a downloaded catalog knows.
func IsVerifiedCatalogProvider(name string) bool {
	p, ok := catalogProviderEntry(name)
	return ok && !p.Unverified
}

// IsUnverifiedCatalogProvider reports whether name is a provider that only a downloaded catalog knows.
func IsUnverifiedCatalogProvider(name string) bool {
	p, ok := catalogProviderEntry(name)
	return ok && p.Unverified
}
