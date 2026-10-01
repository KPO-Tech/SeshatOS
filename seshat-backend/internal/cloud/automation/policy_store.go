package cloudautomation

import (
	"context"
	"encoding/json"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// Desktop policy codes - must match the literal strings seshat-server's
// iam.desktopPolicyCatalog (internal/server/iam/desktop_policies.go) defines
// on the other side of the wire. There is no shared Go type across these two
// separate modules/repos to enforce this at compile time - keep both lists
// in sync by hand if either changes.
const (
	DesktopPolicyAllowCustomProviders      = "allow_custom_providers"
	DesktopPolicyAllowLocalModels          = "allow_local_models"
	DesktopPolicyAllowMultipleWorkspaces   = "allow_multiple_workspaces"
	DesktopPolicyAllowSettingsModification = "allow_settings_modification"
)

// policyCredentialKey is the single well-known key under which the
// (singleton) desktop policy bundle is stored via the existing generic
// encrypted credential store (internal/db/credentials.go) - same pattern as
// Store's Connection, no dedicated table needed for a per-machine singleton.
const policyCredentialKey = "cloud_automation_desktop_policies"

type storedPolicies struct {
	Policies map[string]bool `json:"policies"`
	SyncedAt time.Time       `json:"synced_at"`
}

// PolicyStore persists the last desktop policy bundle a heartbeat returned
// (see seshat-server's automation.HeartbeatResult and
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 5) - the
// enforcement points in later stages (LocalProvider.Create,
// CreateWorkspace, the settings-write middleware) read from this, not from
// the network directly, so they keep working across a transient outage.
type PolicyStore struct {
	db *db.DB
}

func NewPolicyStore(database *db.DB) *PolicyStore {
	return &PolicyStore{db: database}
}

// Save persists the latest resolved bundle - called after every successful
// heartbeat (both the periodic Worker tick and Service.Connect's own
// initial heartbeat).
func (s *PolicyStore) Save(ctx context.Context, policies map[string]bool) error {
	raw, err := json.Marshal(storedPolicies{Policies: policies, SyncedAt: time.Now().UTC()})
	if err != nil {
		return err
	}
	return s.db.UpsertCredential(ctx, policyCredentialKey, string(raw))
}

// Allowed reports whether code currently allows the action.
//
// Deliberately fail-open: true when this device has never synced a bundle
// at all (first launch, or the credential row was cleared by Clear), and
// true when code itself isn't a key in the last bundle received (an older
// seshat-server that predates a policy this client knows about, or any
// other unexpected gap) - either way, a policy this device has no actual
// signal about must never be treated as a restriction. Only an explicit
// `false` value received from the server blocks anything - see the plan
// doc's "fail-open by default" decision (distinct from a policy's own
// server-side catalog default, which is a separate, server-side concept).
func (s *PolicyStore) Allowed(ctx context.Context, code string) bool {
	raw, ok, err := s.db.GetCredential(ctx, policyCredentialKey)
	if err != nil || !ok {
		return true
	}
	var sp storedPolicies
	if err := json.Unmarshal([]byte(raw), &sp); err != nil {
		return true // corrupt entry - treat like never-synced, not a hard failure
	}
	allowed, known := sp.Policies[code]
	if !known {
		return true
	}
	return allowed
}

// All returns the raw last-synced bundle (empty map if never synced) - for
// callers (the local settings UI) that want to know several codes at once
// rather than call Allowed per code. A code missing from this map must
// still be treated as allowed by the caller, exactly like Allowed's own
// fail-open default for an unknown code.
func (s *PolicyStore) All(ctx context.Context) map[string]bool {
	raw, ok, err := s.db.GetCredential(ctx, policyCredentialKey)
	if err != nil || !ok {
		return map[string]bool{}
	}
	var sp storedPolicies
	if err := json.Unmarshal([]byte(raw), &sp); err != nil {
		return map[string]bool{}
	}
	if sp.Policies == nil {
		return map[string]bool{}
	}
	return sp.Policies
}

// Clear removes the stored bundle (e.g. on Disconnect) - a disconnected
// device has no organization to answer to any more, and Allowed's own
// fail-open default already does the right thing once nothing is stored.
func (s *PolicyStore) Clear(ctx context.Context) error {
	return s.db.DeleteCredential(ctx, policyCredentialKey)
}
