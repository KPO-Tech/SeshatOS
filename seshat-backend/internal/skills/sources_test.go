package skills

import (
	"os"
	"path/filepath"
	"testing"

	publicskills "github.com/KPO-Tech/seshat-runtime/pkg/skills"
)

func writeSkillDir(t *testing.T, root, name string) {
	t.Helper()
	dir := filepath.Join(root, name)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	body := "---\nname: " + name + "\ndescription: a test skill\n---\n\nInstructions.\n"
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func isolate(t *testing.T) (claude, codex string) {
	t.Helper()
	t.Setenv("SESHAT_RUNTIME_ROOT", t.TempDir())
	claude, codex = filepath.Join(t.TempDir(), "claude"), filepath.Join(t.TempDir(), "codex")
	t.Setenv("CLAUDE_CONFIG_DIR", claude)
	t.Setenv("CODEX_HOME", codex)
	t.Cleanup(func() { publicskills.SetExternalDirs("", nil) })
	return filepath.Join(claude, "skills"), filepath.Join(codex, "skills")
}

func TestNothingIsOnByDefaultAndAToolIsOnlyReadWhenTurnedOn(t *testing.T) {
	claudeSkills, _ := isolate(t)
	writeSkillDir(t, claudeSkills, "from-claude")
	s := NewService()

	view := s.SourcesView()
	if len(view.Tools) != 2 || view.Tools[0].ID != SourceClaudeCode || !view.Tools[0].Detected || view.Tools[0].Count != 1 || view.Tools[0].Enabled {
		t.Fatalf("claude code must be detected with one skill and off by default: %+v", view.Tools)
	}
	if view.Tools[1].Detected || view.Tools[1].Enabled {
		t.Errorf("codex is not installed here: %+v", view.Tools[1])
	}
	all, _ := publicskills.AllForUser(t.TempDir(), "u")
	for _, sk := range all {
		if sk.Name == "from-claude" {
			t.Fatal("a skill of another tool must not reach the agent before the person turns the tool on")
		}
	}

	if _, err := s.SaveSources(SourcesConfig{ClaudeCode: true}); err != nil {
		t.Fatalf("save: %v", err)
	}
	all, _ = publicskills.AllForUser(t.TempDir(), "u")
	var found bool
	for _, sk := range all {
		if sk.Name == "from-claude" && string(sk.LoadedFrom) == "claudeCode" {
			found = true
		}
	}
	if !found {
		t.Fatal("once turned on, the skill of Claude Code must be available, read in place")
	}

	// The choice survives a restart: a new service applies what was stored.
	publicskills.SetExternalDirs("", nil)
	NewService().ApplySources()
	all, _ = publicskills.AllForUser(t.TempDir(), "u")
	found = false
	for _, sk := range all {
		if sk.Name == "from-claude" {
			found = true
		}
	}
	if !found {
		t.Error("the stored choice must be applied at start")
	}
}

func TestLocalFoldersAreValidatedAndListed(t *testing.T) {
	isolate(t)
	s := NewService()
	folder := t.TempDir()
	writeSkillDir(t, folder, "mine")
	writeSkillDir(t, folder, "also-mine")

	if _, err := s.SaveSources(SourcesConfig{Folders: []string{"relative/path"}}); err == nil {
		t.Error("a relative path must be refused")
	}
	if _, err := s.SaveSources(SourcesConfig{Folders: []string{filepath.Join(folder, "missing")}}); err == nil {
		t.Error("a folder that does not exist must be refused")
	}
	if _, err := s.SaveSources(SourcesConfig{Folders: []string{filepath.Join(folder, "mine", "SKILL.md")}}); err == nil {
		t.Error("a file is not a folder")
	}

	if _, err := s.SaveSources(SourcesConfig{Folders: []string{folder, folder}}); err != nil {
		t.Fatalf("save: %v", err)
	}
	view := s.SourcesView()
	if len(view.Folders) != 1 || !view.Folders[0].Exists || view.Folders[0].Count != 2 {
		t.Fatalf("one folder with two skills expected (a duplicate is dropped): %+v", view.Folders)
	}
	all, _ := publicskills.AllForUser(t.TempDir(), "u")
	names := map[string]bool{}
	for _, sk := range all {
		names[sk.Name] = true
	}
	if !names["mine"] || !names["also-mine"] {
		t.Errorf("the skills of the local folder must be available: %v", names)
	}
}

func TestCountSkillsLooksIntoDotFoldersOfATool(t *testing.T) {
	root := t.TempDir()
	writeSkillDir(t, root, "plain")
	writeSkillDir(t, filepath.Join(root, ".system"), "bundled-by-the-tool")
	if got := CountSkills(root); got != 2 {
		t.Errorf("CountSkills = %d, want 2 (one plain, one in .system)", got)
	}
}
