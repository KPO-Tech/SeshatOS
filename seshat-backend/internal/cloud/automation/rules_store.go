package cloudautomation

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	"github.com/KPO-Tech/seshat/pkg/sdk"
)

// rulesCredentialKey is the row holding the organization's rules for agents (decision 0004 in
// SeshatCloud): a text added to every agent's prompt and a list of tools no agent may use.
const rulesCredentialKey = "cloud_organization_rules"

// DeviceRules mirrors seshat-server's automation.DeviceRules, carried by the heartbeat answer.
type DeviceRules struct {
	Instructions   string   `json:"instructions"`
	ForbiddenTools []string `json:"forbidden_tools"`
	Version        string   `json:"version"`
}

type storedRules struct {
	DeviceRules
	SyncedAt time.Time `json:"synced_at"`
}

// RuleStore persists the last organization rules a heartbeat returned. The desktop keeps them
// indefinitely while offline: being offline never relaxes a rule. They are cleared only on
// Disconnect, since a disconnected device has no organization any more.
type RuleStore struct {
	db *db.DB
}

// NewRuleStore builds the store.
func NewRuleStore(database *db.DB) *RuleStore { return &RuleStore{db: database} }

// Save persists the rules of the latest heartbeat. A nil rules value (a server that predates
// organization rules) leaves what is stored alone.
func (s *RuleStore) Save(ctx context.Context, rules *DeviceRules) error {
	if rules == nil {
		return nil
	}
	raw, err := json.Marshal(storedRules{DeviceRules: *rules, SyncedAt: time.Now().UTC()})
	if err != nil {
		return err
	}
	return s.db.UpsertCredential(ctx, rulesCredentialKey, string(raw))
}

// Get returns the stored rules, or nil when none were ever received or the entry is unreadable.
func (s *RuleStore) Get(ctx context.Context) *DeviceRules {
	raw, ok, err := s.db.GetCredential(ctx, rulesCredentialKey)
	if err != nil || !ok {
		return nil
	}
	var stored storedRules
	if err := json.Unmarshal([]byte(raw), &stored); err != nil {
		return nil
	}
	return &stored.DeviceRules
}

// Policy returns the rules as the engine's managed policy, or nil when nothing is imposed.
func (s *RuleStore) Policy(ctx context.Context) *sdk.ManagedPolicy {
	if s == nil {
		return nil
	}
	rules := s.Get(ctx)
	if rules == nil || (strings.TrimSpace(rules.Instructions) == "" && len(rules.ForbiddenTools) == 0) {
		return nil
	}
	return &sdk.ManagedPolicy{Instructions: rules.Instructions, ForbiddenTools: rules.ForbiddenTools}
}

// Clear removes the stored rules (on Disconnect).
func (s *RuleStore) Clear(ctx context.Context) error {
	return s.db.DeleteCredential(ctx, rulesCredentialKey)
}
