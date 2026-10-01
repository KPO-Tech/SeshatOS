// Package hooks lets a connected seshat-backend device pick up an
// organization's shared PreToolUse hooks - see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 7. Unlike
// internal/mcp, there is no local hook concept to merge in: a hook is
// always org-defined, so this package is entirely about resolving the org
// catalog, cross-referencing this installation's local approvals, and
// pushing the approved set to the SDK runtime - never auto-run without
// that explicit local approval, since a hook fires automatically before
// every matching tool call (more implicit than an MCP stdio server's
// one-time spawn).
package hooks

import (
	"context"
	"strings"
	"sync"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	cloudhooks "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/hooks"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat/pkg/sdk"
)

// RuntimeReloader is the subset of the query runtime needed to push a hook
// set live. *backendquery.SDKRuntime satisfies this interface.
type RuntimeReloader interface {
	ReloadPreToolHooks(hooks []sdk.PreToolHookConfig) error
}

// OrgHookStatus is one org-catalog hook, cross-referenced with this
// installation's local approval state.
type OrgHookStatus struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Matcher     string `json:"matcher,omitempty"`
	Command     string `json:"command"`
	TimeoutSecs int    `json:"timeout_secs"`
	Approved    bool   `json:"approved"`
}

type ServiceConfig struct {
	Runtime RuntimeReloader // nil = reload not available (e.g. workflows' own client)
	// CloudClient/Approvals are nil in standalone mode, same convention as
	// mcp.ServiceConfig.
	CloudClient *cloudhooks.Client
	Approvals   *db.HookOrgApprovalStore
}

type Service struct {
	runtime     RuntimeReloader
	cloudClient *cloudhooks.Client
	approvals   *db.HookOrgApprovalStore

	mu            sync.Mutex
	cachedCatalog []cloudhooks.HookConfig
	reloadOnce    sync.Once
}

func NewService(cfg ServiceConfig) *Service {
	return &Service{runtime: cfg.Runtime, cloudClient: cfg.CloudClient, approvals: cfg.Approvals}
}

// NoteRequestToken triggers a one-off Reload the first time it's called
// after process start (in connected mode), so any org hooks already
// approved in a previous session resume without the user having to click
// "reload" manually - same reasoning as mcp.Service.NoteRequestToken (no
// reliable bearer token available at raw process boot).
func (s *Service) NoteRequestToken(ctx context.Context, token, organizationID string) {
	if s == nil || token == "" || s.cloudClient == nil || organizationID == "" {
		return
	}
	s.reloadOnce.Do(func() {
		_ = s.Reload(ctx, token, organizationID)
	})
}

// ListOrgCatalog fetches the connected org's shared hook catalog and
// cross-references it with this installation's local approvals. Returns an
// empty list (not an error) in standalone mode or on any network failure —
// this is enrichment, never a hard dependency.
func (s *Service) ListOrgCatalog(ctx context.Context, token, organizationID string) ([]OrgHookStatus, error) {
	if s == nil || s.cloudClient == nil || organizationID == "" {
		return []OrgHookStatus{}, nil
	}
	catalog, err := s.cloudClient.ResolveHookConfigs(ctx, token, organizationID)
	if err != nil {
		return []OrgHookStatus{}, nil
	}
	s.mu.Lock()
	s.cachedCatalog = catalog
	s.mu.Unlock()
	approved := map[string]bool{}
	if s.approvals != nil {
		approved, err = s.approvals.ListApprovedIDs(ctx)
		if err != nil {
			return nil, bkerr.Internal(err.Error(), err)
		}
	}
	out := make([]OrgHookStatus, 0, len(catalog))
	for _, c := range catalog {
		out = append(out, OrgHookStatus{
			ID: c.ID, Name: c.Name, Matcher: c.Matcher, Command: c.Command,
			TimeoutSecs: c.TimeoutSecs, Approved: approved[c.ID],
		})
	}
	return out, nil
}

// ApproveOrgHook records local approval for one org-catalog hook and
// immediately reloads so it takes effect without a separate manual reload.
func (s *Service) ApproveOrgHook(ctx context.Context, orgHookID, token, organizationID string) error {
	if s == nil || s.approvals == nil {
		return bkerr.Unavailable("hook org approvals not available", nil)
	}
	if strings.TrimSpace(orgHookID) == "" {
		return bkerr.InvalidInput("org hook id is required", nil)
	}
	if err := s.approvals.Approve(ctx, orgHookID); err != nil {
		return bkerr.Internal(err.Error(), err)
	}
	return s.Reload(ctx, token, organizationID)
}

// RevokeOrgHookApproval removes local approval for one org-catalog hook and
// immediately reloads so it stops running.
func (s *Service) RevokeOrgHookApproval(ctx context.Context, orgHookID, token, organizationID string) error {
	if s == nil || s.approvals == nil {
		return bkerr.Unavailable("hook org approvals not available", nil)
	}
	if err := s.approvals.Revoke(ctx, orgHookID); err != nil {
		return bkerr.Internal(err.Error(), err)
	}
	return s.Reload(ctx, token, organizationID)
}

// Reload fetches the org catalog live (using the caller's own bearer
// token), filters to this installation's approved hooks, and pushes them
// to the SDK runtime via ReloadPreToolHooks. Best-effort: any failure
// (offline, standalone mode, no token, runtime unavailable) degrades
// silently to "no hooks this reload" rather than blocking anything - same
// philosophy as mcp.Service.Reload.
func (s *Service) Reload(ctx context.Context, token, organizationID string) error {
	if s == nil || s.runtime == nil {
		return nil
	}
	approved := s.approvedOrgHooks(ctx, token, organizationID)
	cfgs := make([]sdk.PreToolHookConfig, 0, len(approved))
	for _, h := range approved {
		cfgs = append(cfgs, sdk.PreToolHookConfig{Matcher: h.Matcher, Command: h.Command, Timeout: h.TimeoutSecs})
	}
	return s.runtime.ReloadPreToolHooks(cfgs)
}

// approvedOrgHooks fetches the org catalog live and filters to approved
// entries. Any failure degrades silently to "no org hooks this reload" -
// never blocks a local reload.
func (s *Service) approvedOrgHooks(ctx context.Context, token, organizationID string) []cloudhooks.HookConfig {
	if s.cloudClient == nil || organizationID == "" || s.approvals == nil || token == "" {
		return nil
	}
	approved, err := s.approvals.ListApprovedIDs(ctx)
	if err != nil || len(approved) == 0 {
		return nil
	}
	catalog, err := s.cloudClient.ResolveHookConfigs(ctx, token, organizationID)
	if err != nil {
		return nil
	}
	s.mu.Lock()
	s.cachedCatalog = catalog
	s.mu.Unlock()
	out := make([]cloudhooks.HookConfig, 0, len(approved))
	for _, c := range catalog {
		if approved[c.ID] {
			out = append(out, c)
		}
	}
	return out
}
