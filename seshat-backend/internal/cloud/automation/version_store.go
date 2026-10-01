package cloudautomation

import (
	"context"
	"encoding/json"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// versionCredentialKey is a distinct credential row from policyCredentialKey
// on purpose - app-version restriction is a genuinely separate system from
// desktop policies (see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 5, Étape 8): it
// has its own server-side field (Organization.MinAppVersion, not a
// DesktopPolicyBinding), its own enforcement style (a warning surfaced to
// the user, never something LocalProvider.Create/CreateWorkspace/the
// settings middleware check), and no shared catalog with the four desktop
// policy codes. Reusing PolicyStore's storage would blur that boundary for
// no benefit, since both are trivial wrappers around the same generic
// credential store anyway.
const versionCredentialKey = "cloud_automation_app_version_status"

type storedVersionStatus struct {
	MinAppVersion *string   `json:"min_app_version,omitempty"`
	Outdated      bool      `json:"outdated"`
	SyncedAt      time.Time `json:"synced_at"`
}

// VersionStore persists the last app-version-restriction status a heartbeat
// returned (see seshat-server's automation.HeartbeatResult MinAppVersion/
// AppVersionOutdated fields), so the local status endpoint can surface a
// warning banner without needing a live round trip.
type VersionStore struct {
	db *db.DB
}

func NewVersionStore(database *db.DB) *VersionStore { return &VersionStore{db: database} }

// Save persists the latest resolved app-version status - called after every
// successful heartbeat (both the periodic Worker tick and Service.Connect's
// own initial heartbeat), mirroring PolicyStore.Save.
func (s *VersionStore) Save(ctx context.Context, minAppVersion *string, outdated bool) error {
	raw, err := json.Marshal(storedVersionStatus{MinAppVersion: minAppVersion, Outdated: outdated, SyncedAt: time.Now().UTC()})
	if err != nil {
		return err
	}
	return s.db.UpsertCredential(ctx, versionCredentialKey, string(raw))
}

// Status returns the last-synced app-version status. Deliberately fail-quiet
// (nil, false) when nothing has ever synced or the entry is unreadable -
// warning-only enforcement means "we don't actually know" must never render
// as "you're outdated," same fail-open spirit as PolicyStore.Allowed.
func (s *VersionStore) Status(ctx context.Context) (minAppVersion *string, outdated bool) {
	raw, ok, err := s.db.GetCredential(ctx, versionCredentialKey)
	if err != nil || !ok {
		return nil, false
	}
	var sp storedVersionStatus
	if err := json.Unmarshal([]byte(raw), &sp); err != nil {
		return nil, false
	}
	return sp.MinAppVersion, sp.Outdated
}

// Clear removes the stored status (e.g. on Disconnect) - a disconnected
// device has no organization-configured minimum to answer to any more.
func (s *VersionStore) Clear(ctx context.Context) error {
	return s.db.DeleteCredential(ctx, versionCredentialKey)
}
