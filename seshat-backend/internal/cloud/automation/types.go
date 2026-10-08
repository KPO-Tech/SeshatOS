// Package cloudautomation links seshat-backend to a seshat-server as a paired
// device: the connection (a one-time device token), the periodic heartbeat that
// brings back the organization's desktop policies and minimum app version, and
// the self-service device registration. It runs no jobs: automation lives in
// SeshatCloud only, and this package neither claims nor executes runs.
//
// The name is historical: the package grew out of the automation device client
// and still holds the policy and version stores, which are governance and not
// automation.
package cloudautomation

import "time"

// Connection is this machine's pairing to one seshat-server organization,
// established by pasting a one-time device token generated in
// seshat-console → Devices → Register device. Persisted encrypted via the
// existing generic credential store (internal/db/credentials.go) — no
// dedicated table needed for a singleton value.
type Connection struct {
	ServerURL         string
	DeviceID          string
	DeviceName        string
	DeviceToken       string
	ConnectedByUserID string
	ConnectedAt       time.Time
}

// Status is the redacted view returned to seshat-ui — never includes DeviceToken.
type Status struct {
	Connected         bool       `json:"connected"`
	ServerURL         string     `json:"server_url,omitempty"`
	DeviceID          string     `json:"device_id,omitempty"`
	DeviceName        string     `json:"device_name,omitempty"`
	ConnectedByUserID string     `json:"connected_by_user_id,omitempty"`
	ConnectedAt       *time.Time `json:"connected_at,omitempty"`
	// Policies is this device's last-synced desktop policy bundle (see
	// PolicyStore) - empty (never nil) when never connected/never synced.
	// A code missing from this map must be treated as allowed, same as
	// PolicyStore.Allowed's own fail-open default.
	Policies map[string]bool `json:"policies"`
	// MinAppVersion/AppVersionOutdated are this device's last-synced
	// app-version-restriction status (see VersionStore) - nil/false when
	// never connected/never synced or when the organization has no minimum
	// configured. Warning-only: nothing reads this to block anything, it
	// exists purely for the UI to show a banner.
	MinAppVersion      *string `json:"min_app_version,omitempty"`
	AppVersionOutdated bool    `json:"app_version_outdated"`
}

// Device mirrors seshat-server's Device schema — only the fields this
// package actually uses. Policies is only ever populated on the response to
// POST /device/heartbeat (seshat-server's automation.HeartbeatResult) - it's
// nil/empty on responses from the other endpoints this package calls that
// also happen to return a Device (register), since desktop policies were
// only ever intended to be delivered on that one already-periodic call.
// MinAppVersion/AppVersionOutdated mirror seshat-server's
// automation.HeartbeatResult fields - like Policies, only ever populated on
// a heartbeat response (see version_store.go for why this is tracked
// separately from desktop policies).
type Device struct {
	ID                 string          `json:"id"`
	Name               string          `json:"name"`
	Platform           string          `json:"platform,omitempty"`
	Status             string          `json:"status"`
	LastSeenAt         string          `json:"last_seen_at,omitempty"`
	Policies           map[string]bool `json:"policies,omitempty"`
	MinAppVersion      *string         `json:"min_app_version,omitempty"`
	AppVersionOutdated bool            `json:"app_version_outdated,omitempty"`
}

// registerDeviceParams/registerDeviceResult mirror seshat-server's
// automation.RegisterDeviceParams/RegisterDeviceResult (POST /api/v1/devices),
// the self-service, user-session-authenticated registration call, distinct
// from the device-token-authenticated protocol Client wraps.
type registerDeviceParams struct {
	OrganizationID string `json:"organization_id"`
	Name           string `json:"name"`
	Platform       string `json:"platform"`
	AppVersion     string `json:"app_version"`
}

type registerDeviceResult struct {
	Device Device `json:"device"`
	Token  string `json:"token"`
}
