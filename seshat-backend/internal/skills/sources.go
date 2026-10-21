package skills

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	publicskills "github.com/KPO-Tech/seshat-runtime/pkg/skills"
)

// Where the skills of other tools come from. They are read where they lie, never copied: a skill the person edits in Claude Code's
// folder is the skill the agent uses at its next turn, and there is one copy of each.
const (
	SourceClaudeCode = "claude_code"
	SourceCodex      = "codex"
	sourcesFile      = "external-sources.json"
)

// SourcesConfig is what the person chose. Nothing is on by default: a skill folder of another tool is only made available to the
// agent when the person turns it on.
type SourcesConfig struct {
	ClaudeCode bool     `json:"claude_code"`
	Codex      bool     `json:"codex"`
	Folders    []string `json:"folders"`
}

// SourceStatus is one known tool, as the settings page shows it.
type SourceStatus struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Path     string `json:"path"`
	Detected bool   `json:"detected"`
	Count    int    `json:"skill_count"`
	Enabled  bool   `json:"enabled"`
}

// FolderStatus is one folder the person added.
type FolderStatus struct {
	Path   string `json:"path"`
	Exists bool   `json:"exists"`
	Count  int    `json:"skill_count"`
}

// SourcesView is the response of the settings endpoints.
type SourcesView struct {
	Tools   []SourceStatus `json:"tools"`
	Folders []FolderStatus `json:"folders"`
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

// CountSkills counts the skills of a folder: each sub-folder holding a SKILL.md, one level down (a folder starting with a dot, such
// as Codex's .system, is looked into too, since its skills are the tool's own), plus a SKILL.md at the root.
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
		sub := filepath.Join(root, e.Name())
		if hasSkillFile(sub) {
			count++
			continue
		}
		if strings.HasPrefix(e.Name(), ".") {
			count += CountSkills(sub)
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

// LoadSources reads the person's choice. A missing or unreadable file is the default: nothing on.
func (s *Service) LoadSources() SourcesConfig {
	sourcesMu.Lock()
	defer sourcesMu.Unlock()
	return readSources()
}

func readSources() SourcesConfig {
	var cfg SourcesConfig
	raw, err := os.ReadFile(sourcesPath())
	if err != nil {
		return cfg
	}
	if json.Unmarshal(raw, &cfg) != nil {
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

// SaveSources validates and stores the person's choice, then applies it to the runtime.
func (s *Service) SaveSources(cfg SourcesConfig) (SourcesConfig, error) {
	folders := make([]string, 0, len(cfg.Folders))
	seen := map[string]bool{}
	for _, raw := range cfg.Folders {
		clean, err := ValidateFolder(raw)
		if err != nil {
			return SourcesConfig{}, err
		}
		if seen[clean] {
			continue
		}
		seen[clean] = true
		folders = append(folders, clean)
	}
	cfg.Folders = folders

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
	var dirs []publicskills.ExternalDir
	if cfg.ClaudeCode {
		dirs = append(dirs, publicskills.ExternalDir{Path: toolSkillsDir(SourceClaudeCode), Source: "claudeCode"})
	}
	if cfg.Codex {
		dirs = append(dirs, publicskills.ExternalDir{Path: toolSkillsDir(SourceCodex), Source: "codex"})
	}
	for _, folder := range cfg.Folders {
		dirs = append(dirs, publicskills.ExternalDir{Path: folder, Source: "localFolder"})
	}
	publicskills.SetExternalDirs("", dirs)
}

// SourcesView describes the known tools and the added folders, with what each holds.
func (s *Service) SourcesView() SourcesView {
	cfg := s.LoadSources()
	view := SourcesView{Tools: []SourceStatus{}, Folders: []FolderStatus{}}
	for _, tool := range []struct {
		id, label string
		enabled   bool
	}{
		{SourceClaudeCode, "Claude Code", cfg.ClaudeCode},
		{SourceCodex, "Codex", cfg.Codex},
	} {
		path := toolSkillsDir(tool.id)
		info, err := os.Stat(path)
		detected := err == nil && info.IsDir()
		status := SourceStatus{ID: tool.id, Label: tool.label, Path: path, Detected: detected, Enabled: tool.enabled}
		if detected {
			status.Count = CountSkills(path)
		}
		view.Tools = append(view.Tools, status)
	}
	folders := append([]string(nil), cfg.Folders...)
	sort.Strings(folders)
	for _, folder := range folders {
		info, err := os.Stat(folder)
		exists := err == nil && info.IsDir()
		status := FolderStatus{Path: folder, Exists: exists}
		if exists {
			status.Count = CountSkills(folder)
		}
		view.Folders = append(view.Folders, status)
	}
	return view
}
