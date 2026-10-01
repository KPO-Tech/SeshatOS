// Package cloudconnectors makes seshat-backend a client of seshat-server's
// connector OAuth app registry, for Admin Console's own Connectors tab -
// the desktop-app counterpart of seshat-console's "OAuth apps" modal
// (pages/knowledge/ConnectorsPage.tsx).
package cloudconnectors

// OAuthApp mirrors seshat-server's connectors.OAuthApp - the client secret
// is never returned, only whether one is configured. Subdomain is only
// ever set for kind "zendesk" (see connectors.zendeskKind's doc comment on
// the seshat-server side).
type OAuthApp struct {
	Kind       string `json:"kind"`
	ClientID   string `json:"client_id"`
	Configured bool   `json:"configured"`
	UpdatedAt  string `json:"updated_at"`
	Subdomain  string `json:"subdomain,omitempty"`
}

// ConnectorAccount mirrors the subset of seshat-server's
// connectors.ConnectorAccount the self-service "Workspace → Connections"
// tab needs - not the full DTO (corpus_id/sync fields/s3-only fields are
// knowledge_sync-only concerns, irrelevant to an agent_action account).
type ConnectorAccount struct {
	ID                string `json:"id"`
	Kind              string `json:"kind"`
	DisplayName       string `json:"display_name"`
	ExternalAccountID string `json:"external_account_id,omitempty"`
	Status            string `json:"status"`
	LastError         string `json:"last_error,omitempty"`
	CreatedAt         string `json:"created_at"`
	UpdatedAt         string `json:"updated_at"`
}
