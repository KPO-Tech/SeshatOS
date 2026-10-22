package skills

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"

	publicskills "github.com/KPO-Tech/seshat-runtime/pkg/skills"
)

// Where the skills of other tools come from. They are read where they lie, never copied: a skill the person edits in Claude Code's
// folder is the skill the agent uses at its next turn, and there is one copy of each.
//
// Nothing is imported until the person asks: they pick a source (Claude Code, Codex, a folder of their own), the backend lists
// what it finds with everything checked, they uncheck what they do not want and validate. Only the validated skills reach the agent.
const (
	SourceClaudeCode = "claude_code"
	SourceCodex      = "codex"
	sourcesFile      = "external-sources.json"
)

// SourcesConfig is what the person validated.
type SourcesConfig struct {
	// Folders are the folders of skills the person added themselves.
	Folders []string `json:"folders"`
	// Selection maps a source (claude_code, codex, or the path of an added folder) to the names of the skills validated from it. A
	// source with no entry, or an empty one, gives the agent nothing.
	Selection map[string][]string `json:"selection"`
}

// SourceStatus is one known tool, as the settings page shows it.
type SourceStatus struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Path     string `json:"path"`
	Detected bool   `json:"detected"`
	Count    int    `json:"skill_count"`
	// Selected is how many of its skills the agent uses.
	Selected int `json:"selected"`
}

// FolderStatus is one folder the person added.
type FolderStatus struct {
	Path     string `json:"path"`
	Exists   bool   `json:"exists"`
	Count    int    `json:"skill_count"`
	Selected int    `json:"selected"`
}

// SourcesView is the response of the settings endpoints.
type SourcesView struct {
	Tools   []SourceStatus `json:"tools"`
	Folders []FolderStatus `json:"folders"`
}

// ScanSkill is one skill found in a source.
type ScanSkill struct {
	// Name identifies the skill in the source; Title is how it reads.
	Name        string `json:"name"`
	Title       string `json:"title"`
	Description string `json:"description"`
	// Selected is whether it is checked: what the person validated before, or, for a first scan, everything but the flagged ones.
	Selected bool `json:"selected"`
	// Flag says why a skill is unchecked by default (it depends on the other tool's own apps), or is empty.
	Flag string `json:"flag,omitempty"`
}

// ScanResult is what a source holds.
type ScanResult struct {
	Source string      `json:"source"`
	Skills []ScanSkill `json:"skills"`
}

// What marks a skill as tied to another tool's own apps and so useless here: the name of one of its MCP connector tools, Claude's
// own apps, or the sandbox folders Claude's apps give a skill. Generic mentions (CLAUDE.md, "Claude Code") are not enough: a good
// part of the skills people share carry those and work anywhere.
var toolSpecificMarkers = []struct {
	re     *regexp.Regexp
	reason string
}{
	{regexp.MustCompile(`mcp__[A-Za-z0-9]`), "calls the connector tools of another app (mcp__...)"},
	{regexp.MustCompile(`(?i)claude in chrome|claude\.ai|\bcowork\b|claude desktop`), "needs Claude's own apps"},
	{regexp.MustCompile(`/mnt/(skills|user-data|outputs)`), "expects the sandbox folders of Claude's apps"},
}

// ToolSpecificReason says why a skill only makes sense inside the tool it comes from, or "" when it looks generic.
func ToolSpecificReason(sk publicskills.Skill) string {
	// Claude's desktop app keeps copies of the skills of the person's claude.ai account in a folder named synced (one per account, so
	// often twice): they are managed by Claude, not written by the person, and made for its own sandbox.
	if strings.HasPrefix(sk.Name, "synced:") {
		return "a copy of a claude.ai account skill, managed by Claude"
	}
	text := sk.Description + "\n" + sk.WhenToUse + "\n" + sk.Content
	for _, marker := range toolSpecificMarkers {
		if marker.re.MatchString(text) {
			return marker.reason
		}
	}
	return ""
}

var sourcesMu sync.Mutex

func sourcesPath() string {
	return filepath.Join(publicskills.GetSkillsRootPath(), sourcesFile)
}

// toolSkillsDir is where a tool keeps its skills: Claude Code's configuration directory (CLAUDE_CONFIG_DIR, else ~/.claude) and
// Codex's home (CODEX_HOME, else ~/.codex), each with a skills folder.
func toolSkillsDir(id string) string {
	home, _ := os.UserHomeDir()
	switch id {
	case SourceClaudeCode:
		if dir := strings.TrimSpace(os.Getenv("CLAUDE_CONFIG_DIR")); dir != "" {
			return filepath.Join(dir, "skills")
		}
		return filepath.Join(home, ".claude", "skills")
	case SourceCodex:
		if dir := strings.TrimSpace(os.Getenv("CODEX_HOME")); dir != "" {
			return filepath.Join(dir, "skills")
		}
		return filepath.Join(home, ".codex", "skills")
	}
	return ""
}

// sourceDir is the folder a source key stands for, and the label its skills carry (LoadedFrom).
func sourceDir(key string) (dir, label string) {
	switch key {
	case SourceClaudeCode:
		return toolSkillsDir(SourceClaudeCode), "claudeCode"
	case SourceCodex:
		return toolSkillsDir(SourceCodex), "codex"
	}
	return key, "localFolder"
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// CountSkills counts the skills of a folder: each sub-folder holding a SKILL.md, one level down, plus a SKILL.md at the root. A
// folder starting with a dot (.trash, .system) is not read: it holds what the tool deleted or bundles, and the loader leaves it
// out too.
func CountSkills(root string) int {
	entries, err := os.ReadDir(root)
	if err != nil {
		return 0
	}
	count := 0
	for _, e := range entries {
		if !e.IsDir() {
			if strings.EqualFold(e.Name(), "skill.md") {
				count++
			}
			continue
		}
		if strings.HasPrefix(e.Name(), ".") {
			continue
		}
		if hasSkillFile(filepath.Join(root, e.Name())) {
			count++
		}
	}
	return count
}

func hasSkillFile(dir string) bool {
	children, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, c := range children {
		if !c.IsDir() && strings.EqualFold(c.Name(), "skill.md") {
			return true
		}
	}
	return false
}

// LoadSources reads what the person validated. A missing or unreadable file is the default: nothing imported.
func (s *Service) LoadSources() SourcesConfig {
	sourcesMu.Lock()
	defer sourcesMu.Unlock()
	return readSources()
}

func readSources() SourcesConfig {
	var cfg SourcesConfig
	raw, err := os.ReadFile(sourcesPath())
	if err != nil || json.Unmarshal(raw, &cfg) != nil {
		return SourcesConfig{}
	}
	return cfg
}

// ValidateFolder checks a folder the person wants to add: an absolute path to a folder that exists.
func ValidateFolder(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", fmt.Errorf("the folder path is empty")
	}
	if !filepath.IsAbs(path) {
		return "", fmt.Errorf("%q is not an absolute path", path)
	}
	clean := filepath.Clean(path)
	info, err := os.Stat(clean)
	if err != nil {
		return "", fmt.Errorf("%q does not exist", clean)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("%q is not a folder", clean)
	}
	return clean, nil
}

func uniqueNames(names []string) []string {
	out := make([]string, 0, len(names))
	seen := map[string]bool{}
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name != "" && !seen[name] {
			seen[name] = true
			out = append(out, name)
		}
	}
	sort.Strings(out)
	return out
}

// SaveSources validates and stores what the person chose, then applies it to the runtime.
func (s *Service) SaveSources(cfg SourcesConfig) (SourcesConfig, error) {
	folders := make([]string, 0, len(cfg.Folders))
	known := map[string]bool{SourceClaudeCode: true, SourceCodex: true}
	for _, raw := range cfg.Folders {
		clean, err := ValidateFolder(raw)
		if err != nil {
			return SourcesConfig{}, err
		}
		if known[clean] {
			continue
		}
		known[clean] = true
		folders = append(folders, clean)
	}
	cfg.Folders = folders

	// What was validated for a source that is no longer there is dropped.
	selection := map[string][]string{}
	for key, names := range cfg.Selection {
		clean := key
		if key != SourceClaudeCode && key != SourceCodex {
			clean = filepath.Clean(key)
		}
		if !known[clean] {
			continue
		}
		if names = uniqueNames(names); len(names) > 0 {
			selection[clean] = names
		}
	}
	cfg.Selection = selection

	sourcesMu.Lock()
	defer sourcesMu.Unlock()
	if err := os.MkdirAll(filepath.Dir(sourcesPath()), 0o755); err != nil {
		return SourcesConfig{}, fmt.Errorf("cannot store the choice: %w", err)
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return SourcesConfig{}, err
	}
	if err := os.WriteFile(sourcesPath(), data, 0o644); err != nil {
		return SourcesConfig{}, fmt.Errorf("cannot store the choice: %w", err)
	}
	applySources(cfg)
	return cfg, nil
}

// ApplySources hands the stored choice to the runtime. Call it at start.
func (s *Service) ApplySources() {
	sourcesMu.Lock()
	defer sourcesMu.Unlock()
	applySources(readSources())
}

func applySources(cfg SourcesConfig) {
	keys := []string{SourceClaudeCode, SourceCodex}
	keys = append(keys, cfg.Folders...)
	var dirs []publicskills.ExternalDir
	for _, key := range keys {
		names := cfg.Selection[key]
		if len(names) == 0 {
			continue
		}
		chosen := map[string]bool{}
		for _, name := range names {
			chosen[name] = true
		}
		dir, _ := sourceDir(key)
		// Only what the person validated reaches the agent; a skill added to the folder later is not taken in by itself.
		skip := func(sk publicskills.Skill) bool { return !chosen[sk.Name] }
		// The label is a constant of the runtime's own type, so it is named here and not passed as a variable.
		switch key {
		case SourceClaudeCode:
			dirs = append(dirs, publicskills.ExternalDir{Path: dir, Source: "claudeCode", Skip: skip})
		case SourceCodex:
			dirs = append(dirs, publicskills.ExternalDir{Path: dir, Source: "codex", Skip: skip})
		default:
			dirs = append(dirs, publicskills.ExternalDir{Path: dir, Source: "localFolder", Skip: skip})
		}
	}
	publicskills.SetExternalDirs("", dirs)
}

// SourcesView describes the known tools and the added folders, with what each holds and how much of it the agent uses.
func (s *Service) SourcesView() SourcesView {
	cfg := s.LoadSources()
	view := SourcesView{Tools: []SourceStatus{}, Folders: []FolderStatus{}}
	for _, tool := range []struct{ id, label string }{{SourceClaudeCode, "Claude Code"}, {SourceCodex, "Codex"}} {
		path := toolSkillsDir(tool.id)
		status := SourceStatus{ID: tool.id, Label: tool.label, Path: path, Detected: dirExists(path), Selected: len(cfg.Selection[tool.id])}
		if status.Detected {
			status.Count = CountSkills(path)
		}
		view.Tools = append(view.Tools, status)
	}
	folders := append([]string(nil), cfg.Folders...)
	sort.Strings(folders)
	for _, folder := range folders {
		status := FolderStatus{Path: folder, Exists: dirExists(folder), Selected: len(cfg.Selection[folder])}
		if status.Exists {
			status.Count = CountSkills(folder)
		}
		view.Folders = append(view.Folders, status)
	}
	return view
}

// Scan lists what a source holds, for the person to review: everything checked except what depends on the other tool's own apps,
// or, if they validated this source before, exactly what they had chosen.
func (s *Service) Scan(key string) (ScanResult, error) {
	cfg := s.LoadSources()
	known := key == SourceClaudeCode || key == SourceCodex
	for _, folder := range cfg.Folders {
		if folder == key {
			known = true
		}
	}
	if !known {
		return ScanResult{}, fmt.Errorf("unknown skill source %q", key)
	}
	dir, label := sourceDir(key)
	if !dirExists(dir) {
		return ScanResult{}, fmt.Errorf("%q does not exist", dir)
	}
	loaded, err := publicskills.LoadExternalDir(dir, label)
	if err != nil {
		return ScanResult{}, fmt.Errorf("cannot read %q: %w", dir, err)
	}
	previous, validatedBefore := cfg.Selection[key]
	was := map[string]bool{}
	for _, name := range previous {
		was[name] = true
	}
	result := ScanResult{Source: key, Skills: make([]ScanSkill, 0, len(loaded))}
	for _, sk := range loaded {
		flag := ToolSpecificReason(sk)
		selected := flag == ""
		if validatedBefore {
			selected = was[sk.Name]
		}
		title := sk.Name
		if i := strings.LastIndex(title, ":"); i >= 0 {
			title = title[i+1:]
		}
		result.Skills = append(result.Skills, ScanSkill{Name: sk.Name, Title: title, Description: sk.Description, Selected: selected, Flag: flag})
	}
	sort.Slice(result.Skills, func(i, j int) bool {
		if result.Skills[i].Title != result.Skills[j].Title {
			return result.Skills[i].Title < result.Skills[j].Title
		}
		return result.Skills[i].Name < result.Skills[j].Name
	})
	return result, nil
}
