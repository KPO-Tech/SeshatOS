// Package local connects the connectors of the local catalog: it keeps the person's key, tells the agent runtime about the connector, and
// reports whether the connector's tools are really there.
package local

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/KPO-Tech/seshat-runtime/pkg/sdk"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/connector/gateway"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/mcp"
)

// accountKey is the external account id of a connector account made of a pasted key: one such account per person and kind.
const accountKey = "api-key"

const (
	StatusConnected    = "connected"
	StatusError        = "error"
	StatusDisconnected = "disconnected"
)

// Runtime is the part of the MCP service the connectors need.
type Runtime interface {
	// Reload pushes the MCP servers, the connectors' included, to the agent runtime and reports how each connected.
	Reload(ctx context.Context) ([]mcp.ServerStatus, error)
	ToolsByServer() map[string][]mcp.ToolInfo
}

// Tool is a tool a connector gives the agent.
type Tool struct {
	Name        string
	Description string
}

// Entry is a connector of the catalog with where it stands for this person.
type Entry struct {
	Definition connector.Definition
	Status     string
	LastError  string
	Tools      []Tool
}

type Service struct {
	accounts *db.ConnectorAccountStore
	gateway  *gateway.Gateway
	runtime  Runtime
}

func NewService(accounts *db.ConnectorAccountStore, gw *gateway.Gateway) *Service {
	return &Service{accounts: accounts, gateway: gw}
}

// SetRuntime gives the service the MCP service it reloads. It is set after both exist, as the MCP service asks this one for the servers
// to load.
func (s *Service) SetRuntime(runtime Runtime) { s.runtime = runtime }

// Secret is the gateway's resolver: the key of the latest account of a kind.
func (s *Service) Secret(ctx context.Context, kind connector.Kind) (string, bool) {
	account, found, err := s.accounts.LatestByKind(ctx, string(kind))
	if err != nil || !found {
		return "", false
	}
	secret, err := s.accounts.GetSecret(ctx, account.ID)
	if err != nil || strings.TrimSpace(secret.AccessToken) == "" {
		return "", false
	}
	return secret.AccessToken, true
}

// MCPConfigs are the runtime servers of the connected connectors, for the MCP service to load with the others.
func (s *Service) MCPConfigs(ctx context.Context) []sdk.MCPServerConfig {
	var configs []sdk.MCPServerConfig
	for _, definition := range connector.LocalCatalog() {
		if _, connected := s.Secret(ctx, definition.Kind); !connected {
			continue
		}
		config, err := s.gateway.ServerConfig(definition)
		if err != nil {
			continue
		}
		configs = append(configs, config)
	}
	return configs
}

// List is every connector of the catalog with its state.
func (s *Service) List(ctx context.Context) []Entry {
	var tools map[string][]mcp.ToolInfo
	if s.runtime != nil {
		tools = s.runtime.ToolsByServer()
	}
	entries := make([]Entry, 0, len(connector.LocalCatalog()))
	for _, definition := range connector.LocalCatalog() {
		entry := Entry{Definition: definition, Status: StatusDisconnected}
		if account, found, err := s.accounts.LatestByKind(ctx, string(definition.Kind)); err == nil && found {
			entry.Status, entry.LastError = account.Status, account.LastError
			if entry.Status == db.ConnectorAccountStatusPending || entry.Status == db.ConnectorAccountStatusDisconnected {
				entry.Status = StatusDisconnected
			}
			for _, tool := range tools[definition.ServerName()] {
				entry.Tools = append(entry.Tools, Tool{Name: tool.Name, Description: tool.Description})
			}
		}
		entries = append(entries, entry)
	}
	return entries
}

// Connect keeps the key, loads the connector into the runtime and checks that its tools came up. A key the vendor refuses leaves the
// connector in the error state with the reason, so the person can paste another.
func (s *Service) Connect(ctx context.Context, userID, kind, key string) (Entry, error) {
	definition, ok := connector.LookupLocal(kind)
	if !ok {
		return Entry{}, fmt.Errorf("%q is not a connector of the local catalog", kind)
	}
	key = strings.TrimSpace(key)
	if key == "" {
		return Entry{}, fmt.Errorf("the %s is required", strings.ToLower(definition.CredentialLabel))
	}
	if strings.ContainsAny(key, "\r\n") {
		return Entry{}, errors.New("the key must be on one line")
	}

	account, found, err := s.accounts.GetByKindAndExternalID(ctx, userID, kind, accountKey)
	if err != nil {
		return Entry{}, err
	}
	if !found {
		if account, err = s.accounts.Create(ctx, db.CreateConnectorAccountParams{
			UserID: userID, Kind: kind, DisplayName: definition.Label, ExternalAccountID: accountKey,
		}); err != nil {
			return Entry{}, err
		}
	}
	if _, err := s.accounts.UpdateConnected(ctx, db.UpdateConnectorAccountConnectedParams{
		ID: account.ID, DisplayName: definition.Label, ExternalAccountID: accountKey, AccessToken: key,
	}); err != nil {
		return Entry{}, err
	}

	if reason := s.reload(ctx, definition); reason != "" {
		_ = s.accounts.UpdateStatus(ctx, account.ID, db.ConnectorAccountStatusError, reason)
	}
	return s.entry(ctx, definition), nil
}

// Disconnect forgets the key of a connector and takes its tools away.
func (s *Service) Disconnect(ctx context.Context, userID, kind string) error {
	definition, ok := connector.LookupLocal(kind)
	if !ok {
		return fmt.Errorf("%q is not a connector of the local catalog", kind)
	}
	accounts, err := s.accounts.ListByUserID(ctx, userID)
	if err != nil {
		return err
	}
	for _, account := range accounts {
		if account.Kind != kind {
			continue
		}
		if err := s.accounts.Delete(ctx, account.ID); err != nil {
			return err
		}
	}
	_ = s.reload(ctx, definition)
	return nil
}

// reload applies the connectors to the runtime and returns why this connector's server did not come up ("" when it did).
func (s *Service) reload(ctx context.Context, definition connector.Definition) string {
	if s.runtime == nil {
		return ""
	}
	statuses, err := s.runtime.Reload(ctx)
	if err != nil {
		return err.Error()
	}
	for _, status := range statuses {
		if status.Name == definition.ServerName() && !status.OK {
			return friendlyError(definition, status.Error)
		}
	}
	return ""
}

func (s *Service) entry(ctx context.Context, definition connector.Definition) Entry {
	for _, entry := range s.List(ctx) {
		if entry.Definition.Kind == definition.Kind {
			return entry
		}
	}
	return Entry{Definition: definition, Status: StatusDisconnected}
}

// friendlyError turns the runtime's connection error into something a person can act on.
func friendlyError(definition connector.Definition, runtimeError string) string {
	switch {
	case strings.Contains(runtimeError, "401"), strings.Contains(runtimeError, "403"):
		return fmt.Sprintf("%s refused the %s. Check that it is valid and has the access you want to give.", definition.Label, strings.ToLower(definition.CredentialLabel))
	case strings.Contains(runtimeError, "could not be reached"):
		return fmt.Sprintf("%s could not be reached. Check your connection and try again.", definition.Label)
	}
	return runtimeError
}
