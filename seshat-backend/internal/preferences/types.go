package preferences

import (
	"strings"
	"time"

	"github.com/KPO-Tech/seshat/pkg/types"
)

type UserPreferences struct {
	UserID                    string
	PreferredName             string
	Profession                string
	About                     string
	WorkingStyle              string
	ResponseStyle             string
	ExtraContext              string
	InteractivePermissionMode string
	AutomationPermissionMode  string
	// MaxSubAgentDepth overrides the server default (3) when > 0. Range: 1–5.
	MaxSubAgentDepth int
	UpdatedAt        time.Time
}

type UpsertParams struct {
	PreferredName             string
	Profession                string
	About                     string
	WorkingStyle              string
	ResponseStyle             string
	ExtraContext              string
	InteractivePermissionMode string
	AutomationPermissionMode  string
	MaxSubAgentDepth          int
}

// BuildSystemPromptBlock renders the preferences as a system prompt injection
// block. Returns empty string if there is nothing meaningful to inject. Lives
// on the public DTO (not the DB model) so it works identically regardless of
// whether the data came from LocalProvider or a connected seshat-server.
func (p *UserPreferences) BuildSystemPromptBlock() string {
	if p == nil {
		return ""
	}
	var parts []string

	name := strings.TrimSpace(p.PreferredName)
	profession := strings.TrimSpace(p.Profession)
	about := strings.TrimSpace(p.About)
	workingStyle := strings.TrimSpace(p.WorkingStyle)
	responseStyle := strings.TrimSpace(p.ResponseStyle)
	extra := strings.TrimSpace(p.ExtraContext)

	if name == "" && profession == "" && about == "" && workingStyle == "" && responseStyle == "" && extra == "" {
		return ""
	}

	parts = append(parts, "## User Preferences")
	parts = append(parts, "")
	if name != "" {
		parts = append(parts, "The user's preferred name is: "+name+".")
	}
	if profession != "" {
		parts = append(parts, "Their profession/role: "+profession+".")
	}
	if about != "" {
		parts = append(parts, "About them: "+about)
	}
	if workingStyle != "" {
		parts = append(parts, "Their working style: "+workingStyle)
	}
	if responseStyle != "" {
		parts = append(parts, "How they prefer responses: "+responseStyle)
	}
	if extra != "" {
		parts = append(parts, "Additional context: "+extra)
	}

	return strings.Join(parts, "\n")
}

func (p *UserPreferences) PreferredInteractivePermissionMode() types.PermissionMode {
	if p == nil {
		return types.PermissionModeOnRequest
	}
	return types.NormalizePermissionModeOrDefault(types.PermissionMode(strings.TrimSpace(p.InteractivePermissionMode)), types.PermissionModeOnRequest)
}

func (p *UserPreferences) PreferredAutomationPermissionMode() types.PermissionMode {
	if p == nil {
		return types.PermissionModeNever
	}
	return types.NormalizePermissionModeOrDefault(types.PermissionMode(strings.TrimSpace(p.AutomationPermissionMode)), types.PermissionModeNever)
}
