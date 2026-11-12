package preferences

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/KPO-Tech/seshat-runtime/pkg/types"
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
	// MemoryEnabled reports whether the user opted in to long-term memory (extraction and recall). Off by default.
	MemoryEnabled bool
	// RichAnswersDisabled is true when the user turned off structured components (tables, figures, steps) in answers.
	// It is an opt-out so that the zero value, which is also what a user who never chose reads back, means on.
	RichAnswersDisabled bool
	// RichFamilies holds the families of components the person forced: family -> "on" or "off". A family that is not in it is
	// automatic. Only valid entries are kept.
	RichFamilies map[string]string
	// NaturalWriting asks the agent for plain prose without the stock phrases of machine-written text. Off by default.
	NaturalWriting bool
	UpdatedAt      time.Time
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
	MemoryEnabled             bool
	RichAnswersDisabled       bool
	// RichFamilies is stored whole: the caller sends back the families it wants forced, and an empty map makes them all automatic.
	RichFamilies   map[string]string
	NaturalWriting bool
}

// The families of components a person may force, and the modes they may give them.
var (
	RichFamilyNames = []string{"architecture", "charts", "forms", "design", "diagrams"}
	richFamilyModes = map[string]bool{"auto": true, "on": true, "off": true}
)

// CleanRichFamilies keeps the known families with a known mode other than auto, and says what it dropped.
func CleanRichFamilies(in map[string]string) (clean map[string]string, invalid string) {
	clean = map[string]string{}
	for family, mode := range in {
		known := false
		for _, name := range RichFamilyNames {
			if name == family {
				known = true
			}
		}
		if !known {
			return nil, "unknown family " + family
		}
		if !richFamilyModes[mode] {
			return nil, "unknown mode " + mode + " for " + family
		}
		if mode != "auto" {
			clean[family] = mode
		}
	}
	return clean, ""
}

// EncodeRichFamilies is the text stored for a map of families: empty when none is forced.
func EncodeRichFamilies(families map[string]string) string {
	if len(families) == 0 {
		return ""
	}
	raw, err := json.Marshal(families)
	if err != nil {
		return ""
	}
	return string(raw)
}

// DecodeRichFamilies reads what EncodeRichFamilies wrote, keeping only valid entries: a stored text that cannot be read means automatic.
func DecodeRichFamilies(text string) map[string]string {
	if strings.TrimSpace(text) == "" {
		return map[string]string{}
	}
	var raw map[string]string
	if err := json.Unmarshal([]byte(text), &raw); err != nil {
		return map[string]string{}
	}
	clean, invalid := CleanRichFamilies(raw)
	if invalid != "" {
		return map[string]string{}
	}
	return clean
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
