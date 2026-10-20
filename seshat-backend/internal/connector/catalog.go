package connector

import (
	"fmt"
	"net/url"
	"strings"
)

// AuthMethod is how a person proves to the vendor that an agent may act for them.
type AuthMethod string

// AuthAPIKey is a key the person creates in the vendor's own settings and pastes once. SeshatOS embeds no OAuth client secret, so every
// connector of the local catalog authenticates this way (or with a client the person registers themselves, which no v1 connector does).
const AuthAPIKey AuthMethod = "api_key"

// Definition is one connector of the local catalog: a hosted MCP server of the vendor that an agent reaches with the person's own key.
// The backend, not the desktop, owns this list, so the desktop never offers a connector the backend cannot connect.
type Definition struct {
	Kind        Kind
	Label       string
	Description string
	Category    string
	Auth        AuthMethod
	// CredentialLabel names the key as the vendor does ("Personal access token").
	CredentialLabel string
	// CredentialURL is where the person creates the key; DocsURL is the vendor's page about its MCP server.
	CredentialURL string
	DocsURL       string
	// MCPURL is the vendor-hosted MCP endpoint (Streamable HTTP) the connector's tools come from.
	MCPURL string
}

// ServerName is the name of the connector's MCP server in the runtime, which prefixes the names of its tools.
func (d Definition) ServerName() string { return "connector-" + string(d.Kind) }

// Validate is the admission rule, kept in code so a connector cannot join the catalog without meeting it:
//
//  1. authentication works on this machine without a secret that Seshat embeds: the person's own key (a Definition has no field
//     that could carry a client secret);
//  2. the agent gets tools from it: an https MCP endpoint of the vendor;
//  3. it is tested end to end: the catalog test connects every definition through the gateway to a vendor stand-in and calls a tool.
//
// The third point is a test (gateway/catalog_e2e_test.go), the first two are checked here.
func (d Definition) Validate() error {
	if strings.TrimSpace(string(d.Kind)) == "" || strings.TrimSpace(d.Label) == "" || strings.TrimSpace(d.Description) == "" {
		return fmt.Errorf("connector %q: kind, label and description are required", d.Kind)
	}
	if d.Auth != AuthAPIKey {
		return fmt.Errorf("connector %q: auth must be %q, got %q", d.Kind, AuthAPIKey, d.Auth)
	}
	if strings.TrimSpace(d.CredentialLabel) == "" {
		return fmt.Errorf("connector %q: the credential needs a label", d.Kind)
	}
	parsed, err := url.Parse(d.MCPURL)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" {
		return fmt.Errorf("connector %q: the MCP endpoint must be an https URL, got %q", d.Kind, d.MCPURL)
	}
	if parsed.User != nil {
		return fmt.Errorf("connector %q: the MCP endpoint must not carry credentials", d.Kind)
	}
	return nil
}

// localCatalog is the v1 list. A vendor joins it only once its hosted MCP server takes a person's own key as a bearer token (checked
// against the vendor's documentation) and the end-to-end test passes for it. The other connectors of the shared catalog need an OAuth
// application registered by an organization, which is SeshatCloud's job.
var localCatalog = []Definition{
	{
		Kind:            "github",
		Label:           "GitHub",
		Description:     "Search repositories, read code and manage issues and pull requests.",
		Category:        "productivity",
		Auth:            AuthAPIKey,
		CredentialLabel: "Personal access token",
		CredentialURL:   "https://github.com/settings/personal-access-tokens/new",
		DocsURL:         "https://docs.github.com/en/copilot/how-tos/context/model-context-protocol/using-the-github-mcp-server",
		MCPURL:          "https://api.githubcopilot.com/mcp/",
	},
	{
		Kind:            "linear",
		Label:           "Linear",
		Description:     "Find, create and update Linear issues and projects.",
		Category:        "productivity",
		Auth:            AuthAPIKey,
		CredentialLabel: "Personal API key",
		CredentialURL:   "https://linear.app/settings/api",
		DocsURL:         "https://linear.app/docs/mcp",
		MCPURL:          "https://mcp.linear.app/mcp",
	},
	{
		Kind:            "airtable",
		Label:           "Airtable",
		Description:     "Read and write records in your Airtable bases.",
		Category:        "productivity",
		Auth:            AuthAPIKey,
		CredentialLabel: "Personal access token",
		CredentialURL:   "https://airtable.com/create/tokens",
		DocsURL:         "https://airtable.com/developers/agents/mcp/other",
		MCPURL:          "https://mcp.airtable.com/mcp",
	},
	{
		Kind:            "stripe",
		Label:           "Stripe",
		Description:     "Look up customers, payments and subscriptions in Stripe.",
		Category:        "payments",
		Auth:            AuthAPIKey,
		CredentialLabel: "Restricted API key",
		CredentialURL:   "https://dashboard.stripe.com/apikeys",
		DocsURL:         "https://docs.stripe.com/mcp",
		MCPURL:          "https://mcp.stripe.com",
	},
}

// LocalCatalog returns the connectors a person can connect on this machine, in display order.
func LocalCatalog() []Definition {
	return append([]Definition(nil), localCatalog...)
}

// LookupLocal finds a connector of the local catalog by kind.
func LookupLocal(kind string) (Definition, bool) {
	for _, d := range localCatalog {
		if string(d.Kind) == kind {
			return d, true
		}
	}
	return Definition{}, false
}
