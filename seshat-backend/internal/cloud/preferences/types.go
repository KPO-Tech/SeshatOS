// Package cloudpreferences makes seshat-backend a real preferences client of
// seshat-server in "connected" mode. It implements preferences.Provider, the
// same interface preferences.LocalProvider implements for standalone mode.
// Unlike provider settings, there is no org/platform hierarchy here —
// preferences are strictly personal, so "connected" simply means "stored on
// the server instead of locally" (see helps/seshat-architecture-target.md §3).
package cloudpreferences

import "time"

// remotePreferences mirrors seshat-server's preferences.UserPreferences.
type remotePreferences struct {
	UserID                    string    `json:"user_id"`
	PreferredName             string    `json:"preferred_name"`
	Profession                string    `json:"profession"`
	About                     string    `json:"about"`
	WorkingStyle              string    `json:"working_style"`
	ResponseStyle             string    `json:"response_style"`
	ExtraContext              string    `json:"extra_context"`
	InteractivePermissionMode string    `json:"interactive_permission_mode"`
	AutomationPermissionMode  string    `json:"automation_permission_mode"`
	MaxSubAgentDepth          int       `json:"max_sub_agent_depth"`
	UpdatedAt                 time.Time `json:"updated_at"`
}
