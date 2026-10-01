package mcp

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/mcp"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	enginemcp "github.com/KPO-Tech/seshat/pkg/mcp"
	"github.com/KPO-Tech/seshat/pkg/sdk"
)

// RuntimeReloader is the subset of the query runtime needed for MCP reload operations.
// *backendquery.SDKRuntime satisfies this interface.
type RuntimeReloader interface {
	ReloadMCPServers(ctx context.Context, servers []sdk.MCPServerConfig) error
	MCPResult() *sdk.MCPIntegrationResult
}

// ServiceConfig holds all dependencies for the MCP service.
type ServiceConfig struct {
	Store   *db.MCPServerStore
	Runtime RuntimeReloader // nil = reload/status not available
	// CloudClient/Approvals are nil in standalone mode. When set (connected
	// mode, see internal/config/bootstrap.go), the org's shared MCP catalog
	// is fetched live and, for each server this installation has explicitly
	// approved (Approvals), merged into the local runtime on Reload — see
	// internal/cloudmcp's package doc for why approval is required rather
	// than auto-loading. The organization itself is resolved fresh per call
	// from the caller's own principal (see api.requestOrganizationID /
	// auth.Principal.OrganizationID), passed as an explicit organizationID
	// parameter to every method below rather than stored here - see
	// agents.Service's doc comment for why.
	CloudClient *cloudmcp.Client
	Approvals   *db.MCPOrgServerApprovalStore
}

type Service struct {
	store       *db.MCPServerStore
	runtime     RuntimeReloader
	cloudClient *cloudmcp.Client
	approvals   *db.MCPOrgServerApprovalStore

	// mu guards cachedOrgCatalog only — the last org catalog fetched by
	// ListOrgCatalog/Reload, kept around so Status() can tag org-sourced
	// entries without an extra network round trip on every status poll.
	mu               sync.Mutex
	cachedOrgCatalog []cloudmcp.ServerConfig
	reloadOnce       sync.Once
}

func NewService(cfg ServiceConfig) *Service {
	return &Service{
		store: cfg.Store, runtime: cfg.Runtime,
		cloudClient: cfg.CloudClient, approvals: cfg.Approvals,
	}
}

// compile-time check: *Service must always be the target of method calls,
// never a nil interface value that bypasses the nil guards below.
var _ = (*Service)(nil)

// NoteRequestToken triggers a one-off Reload the first time it's called
// after process start (in connected mode), so any org servers already
// approved in a previous session resume without the user having to click
// "reload" manually. There is no reliable bearer token available at raw
// process boot (unlike a local, single-request resolve), so this piggybacks
// on the first authenticated request that happens to touch this domain —
// see internal/api/routes.go's mcpRoute wrapper, which calls this for every
// MCP route that doesn't already reload on its own (a route that reloads
// itself, e.g. approve/revoke/reload, satisfies the same "resume approved
// servers" guarantee directly and must not also go through this path, or
// the reload would run twice).
func (s *Service) NoteRequestToken(ctx context.Context, token, organizationID string) {
	if s == nil || token == "" || s.cloudClient == nil || organizationID == "" {
		return
	}
	s.reloadOnce.Do(func() {
		_, _ = s.Reload(ctx, token, organizationID)
	})
}

func (s *Service) List(ctx context.Context) ([]Server, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("mcp server store not available", nil)
	}
	rows, err := s.store.List(ctx)
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	out := make([]Server, 0, len(rows))
	for _, r := range rows {
		out = append(out, fromDB(r))
	}
	return out, nil
}

func (s *Service) ListEnabled(ctx context.Context) ([]Server, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("mcp server store not available", nil)
	}
	rows, err := s.store.ListEnabled(ctx)
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	out := make([]Server, 0, len(rows))
	for _, r := range rows {
		out = append(out, fromDB(r))
	}
	return out, nil
}

func (s *Service) GetByID(ctx context.Context, id string) (*Server, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("mcp server store not available", nil)
	}
	row, err := s.store.GetByID(ctx, id)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return nil, bkerr.NotFound(err.Error(), err)
		}
		return nil, bkerr.Internal(err.Error(), err)
	}
	result := fromDB(*row)
	return &result, nil
}

func (s *Service) Create(ctx context.Context, p CreateParams) (*Server, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("mcp server store not available", nil)
	}
	if strings.TrimSpace(p.Name) == "" {
		return nil, bkerr.InvalidInput("name is required", nil)
	}
	created, err := s.store.Create(ctx, db.CreateMCPServerParams{
		Name:        p.Name,
		DisplayName: p.DisplayName,
		ServerType:  p.ServerType,
		Command:     p.Command,
		Args:        p.Args,
		Env:         p.Env,
		URL:         p.URL,
		Headers:     p.Headers,
		TimeoutSecs: p.TimeoutSecs,
		Icon:        p.Icon,
		Enabled:     p.Enabled,
	})
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	result := fromDB(*created)
	return &result, nil
}

func (s *Service) Update(ctx context.Context, id string, p UpdateParams) (*Server, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("mcp server store not available", nil)
	}
	updated, err := s.store.Update(ctx, id, db.UpdateMCPServerParams{
		DisplayName: p.DisplayName,
		ServerType:  p.ServerType,
		Command:     p.Command,
		Args:        p.Args,
		Env:         p.Env,
		URL:         p.URL,
		Headers:     p.Headers,
		TimeoutSecs: p.TimeoutSecs,
		Icon:        p.Icon,
		Enabled:     p.Enabled,
	})
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return nil, bkerr.NotFound(err.Error(), err)
		}
		return nil, bkerr.Internal(err.Error(), err)
	}
	result := fromDB(*updated)
	return &result, nil
}

func (s *Service) Delete(ctx context.Context, id string) error {
	if s == nil || s.store == nil {
		return bkerr.Unavailable("mcp server store not available", nil)
	}
	if err := s.store.Delete(ctx, id); err != nil {
		if strings.Contains(err.Error(), "not found") {
			return bkerr.NotFound(err.Error(), err)
		}
		return bkerr.Internal(err.Error(), err)
	}
	return nil
}

func (s *Service) ImportFromMcpJSON(ctx context.Context, cfg enginemcp.McpJsonConfig) (int, error) {
	if s == nil || s.store == nil {
		return 0, bkerr.Unavailable("mcp server store not available", nil)
	}
	count, err := s.store.ImportFromMcpJSON(ctx, cfg)
	if err != nil {
		return 0, bkerr.Internal(err.Error(), err)
	}
	return count, nil
}

// Reload reads all enabled MCP servers from the DB, merges in any
// org-catalog servers this installation has approved (connected mode
// only, using the caller's own bearer token to resolve the org catalog),
// pushes them all to the SDK runtime, and returns the per-server
// connection status. token may be empty in standalone mode.
func (s *Service) Reload(ctx context.Context, token, organizationID string) ([]ServerStatus, error) {
	if s == nil || s.runtime == nil {
		return nil, bkerr.Unavailable("mcp runtime not available", nil)
	}
	servers, err := s.ListEnabled(ctx)
	if err != nil {
		return nil, err
	}
	orgNames := make(map[string]bool)
	sdkConfigs := make([]sdk.MCPServerConfig, 0, len(servers))
	for _, srv := range servers {
		sdkConfigs = append(sdkConfigs, srv.ToSDKConfig())
	}
	for _, org := range s.approvedOrgServers(ctx, token, organizationID) {
		sdkConfigs = append(sdkConfigs, orgServerToSDKConfig(org))
		orgNames[org.Name] = true
	}
	// Best-effort: even if reload returns an error some servers may have connected.
	// Status() reads the actual outcome from the runtime.
	_ = s.runtime.ReloadMCPServers(ctx, sdkConfigs)
	return s.status(orgNames), nil
}

// Status returns the current per-server connection status from the runtime
// without triggering a reload.
func (s *Service) Status() []ServerStatus {
	if s == nil {
		return nil
	}
	orgNames := make(map[string]bool)
	if s.cloudClient != nil && s.approvals != nil {
		if approved, err := s.approvals.ListApprovedIDs(context.Background()); err == nil {
			s.mu.Lock()
			catalog := s.cachedOrgCatalog
			s.mu.Unlock()
			for _, org := range catalog {
				if approved[org.ID] {
					orgNames[org.Name] = true
				}
			}
		}
	}
	return s.status(orgNames)
}

func (s *Service) status(orgNames map[string]bool) []ServerStatus {
	if s == nil || s.runtime == nil {
		return nil
	}
	result := s.runtime.MCPResult()
	if result == nil {
		return nil
	}
	out := make([]ServerStatus, 0, len(result.ServerResults))
	for _, sr := range result.ServerResults {
		st := ServerStatus{Name: sr.Name, OK: sr.Error == nil, Tools: sr.ToolsRegistered}
		if sr.Error != nil {
			st.Error = sr.Error.Error()
		}
		if orgNames[sr.Name] {
			st.Source = "organization"
		}
		out = append(out, st)
	}
	return out
}

// ─── Org catalog (connected mode) ──────────────────────────────────────────────

// ListOrgCatalog fetches the connected org's shared MCP server catalog and
// cross-references it with this installation's local approvals. Returns an
// empty list (not an error) in standalone mode or on any network failure —
// this is enrichment, never a hard dependency.
func (s *Service) ListOrgCatalog(ctx context.Context, token, organizationID string) ([]OrgServerStatus, error) {
	if s == nil || s.cloudClient == nil || organizationID == "" {
		return []OrgServerStatus{}, nil
	}
	catalog, err := s.cloudClient.ResolveServerConfigs(ctx, token, organizationID)
	if err != nil {
		return []OrgServerStatus{}, nil
	}
	s.mu.Lock()
	s.cachedOrgCatalog = catalog
	s.mu.Unlock()
	approved := map[string]bool{}
	if s.approvals != nil {
		approved, err = s.approvals.ListApprovedIDs(ctx)
		if err != nil {
			return nil, bkerr.Internal(err.Error(), err)
		}
	}
	out := make([]OrgServerStatus, 0, len(catalog))
	for _, c := range catalog {
		out = append(out, OrgServerStatus{
			ID: c.ID, Name: c.Name, DisplayName: c.DisplayName, ServerType: c.ServerType,
			Command: c.Command, Args: c.Args, URL: c.URL, Icon: c.Icon, Approved: approved[c.ID],
		})
	}
	return out, nil
}

// ApproveOrgServer records local approval for one org-catalog server and
// immediately reloads so it takes effect without a separate manual reload.
func (s *Service) ApproveOrgServer(ctx context.Context, orgServerID, token, organizationID string) ([]ServerStatus, error) {
	if s == nil || s.approvals == nil {
		return nil, bkerr.Unavailable("mcp org server approvals not available", nil)
	}
	if strings.TrimSpace(orgServerID) == "" {
		return nil, bkerr.InvalidInput("org server id is required", nil)
	}
	if err := s.approvals.Approve(ctx, orgServerID); err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	return s.Reload(ctx, token, organizationID)
}

// RevokeOrgServerApproval removes local approval for one org-catalog server
// and immediately reloads so it stops running.
func (s *Service) RevokeOrgServerApproval(ctx context.Context, orgServerID, token, organizationID string) ([]ServerStatus, error) {
	if s == nil || s.approvals == nil {
		return nil, bkerr.Unavailable("mcp org server approvals not available", nil)
	}
	if err := s.approvals.Revoke(ctx, orgServerID); err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	return s.Reload(ctx, token, organizationID)
}

// approvedOrgServers fetches the org catalog live (using the caller's own
// bearer token) and filters to approved entries. Any failure (offline,
// standalone mode, no token, etc.) degrades silently to "no org servers
// this reload" — never blocks a local reload.
func (s *Service) approvedOrgServers(ctx context.Context, token, organizationID string) []cloudmcp.ServerConfig {
	if s == nil || s.cloudClient == nil || organizationID == "" || s.approvals == nil || token == "" {
		return nil
	}
	approved, err := s.approvals.ListApprovedIDs(ctx)
	if err != nil || len(approved) == 0 {
		return nil
	}
	catalog, err := s.cloudClient.ResolveServerConfigs(ctx, token, organizationID)
	if err != nil {
		return nil
	}
	s.mu.Lock()
	s.cachedOrgCatalog = catalog
	s.mu.Unlock()
	out := make([]cloudmcp.ServerConfig, 0, len(approved))
	for _, c := range catalog {
		if approved[c.ID] {
			out = append(out, c)
		}
	}
	return out
}

func orgServerToSDKConfig(c cloudmcp.ServerConfig) sdk.MCPServerConfig {
	return sdk.MCPServerConfig{
		Name:      c.Name,
		Command:   c.Command,
		Args:      c.Args,
		URL:       c.URL,
		Transport: enginemcp.TransportType(c.ServerType),
		Env:       c.Env,
		Headers:   c.Headers,
		Timeout:   time.Duration(c.TimeoutSecs) * time.Second,
	}
}

// ToolsByServer returns the connected tools grouped by server name.
// Tool names follow the pattern mcp__<server>__<tool>; unprefixed tools are
// filed under the server that registered them via the ServerResults index.
func (s *Service) ToolsByServer() map[string][]ToolInfo {
	if s == nil || s.runtime == nil {
		return nil
	}
	result := s.runtime.MCPResult()
	if result == nil {
		return nil
	}
	out := make(map[string][]ToolInfo)
	for _, t := range result.MCPTools {
		def := t.Definition()
		server, tool := parseMCPToolName(def.Name)
		out[server] = append(out[server], ToolInfo{Name: tool, Description: def.Description})
	}
	return out
}

// parseMCPToolName splits "mcp__server__tool" → ("server", "tool").
// Falls back to ("", fullName) for non-prefixed names.
func parseMCPToolName(name string) (server, tool string) {
	parts := strings.SplitN(name, "__", 3)
	if len(parts) == 3 && parts[0] == "mcp" {
		return parts[1], parts[2]
	}
	return "", name
}

func fromDB(s db.MCPServer) Server {
	return Server{
		ID:          s.ID,
		Name:        s.Name,
		DisplayName: s.DisplayName,
		ServerType:  s.ServerType,
		Command:     s.Command,
		Args:        s.Args,
		Env:         s.Env,
		URL:         s.URL,
		Headers:     s.Headers,
		TimeoutSecs: s.TimeoutSecs,
		Icon:        s.Icon,
		Enabled:     s.Enabled,
		Source:      s.Source,
		CreatedAt:   s.CreatedAt,
		UpdatedAt:   s.UpdatedAt,
	}
}
