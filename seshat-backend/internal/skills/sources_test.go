package skills

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	publicskills "github.com/KPO-Tech/seshat-runtime/pkg/skills"
)

func writeSkillWithBody(t *testing.T, root, name, body string) {
	t.Helper()
	dir := filepath.Join(root, name)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	text := "---\nname: " + name + "\ndescription: a test skill\n---\n\n" + body + "\n"
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

func writeSkillDir(t *testing.T, root, name string) {
	t.Helper()
	writeSkillWithBody(t, root, name, "Instructions.")
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

func availableNames(t *testing.T) map[string]bool {
	t.Helper()
	all, _ := publicskills.AllForUser(t.TempDir(), "u")
	names := map[string]bool{}
	for _, sk := range all {
		names[sk.Name] = true
	}
	return names
}

func scanned(t *testing.T, s *Service, key string) map[string]ScanSkill {
	t.Helper()
	result, err := s.Scan(key)
	if err != nil {
		t.Fatalf("scan %s: %v", key, err)
	}
	out := map[string]ScanSkill{}
	for _, sk := range result.Skills {
		out[sk.Name] = sk
	}
	return out
}

func TestNothingIsImportedUntilThePersonValidates(t *testing.T) {
	claudeSkills, _ := isolate(t)
	writeSkillDir(t, claudeSkills, "from-claude")
	s := NewService()

	view := s.SourcesView()
	if !view.Tools[0].Detected || view.Tools[0].Count != 1 || view.Tools[0].Selected != 0 {
		t.Fatalf("claude code is found, holds one skill and nothing is used yet: %+v", view.Tools[0])
	}
	if view.Tools[1].Detected {
		t.Errorf("codex is not installed here: %+v", view.Tools[1])
	}
	s.ApplySources()
	if availableNames(t)["from-claude"] {
		t.Fatal("a skill of another tool must not reach the agent before the person validates")
	}
	// Scanning only reads.
	_ = scanned(t, s, SourceClaudeCode)
	if availableNames(t)["from-claude"] {
		t.Fatal("scanning must not import anything")
	}

	if _, err := s.SaveSources(SourcesConfig{Selection: map[string][]string{SourceClaudeCode: {"from-claude"}}}); err != nil {
		t.Fatalf("save: %v", err)
	}
	var found bool
	all, _ := publicskills.AllForUser(t.TempDir(), "u")
	for _, sk := range all {
		if sk.Name == "from-claude" && string(sk.LoadedFrom) == "claudeCode" {
			found = true
		}
	}
	if !found {
		t.Fatal("once validated, the skill must be available, read in place")
	}
	if got := s.SourcesView().Tools[0].Selected; got != 1 {
		t.Errorf("the tool must report one skill used, got %d", got)
	}

	// The choice survives a restart: a new service applies what was stored.
	publicskills.SetExternalDirs("", nil)
	NewService().ApplySources()
	if !availableNames(t)["from-claude"] {
		t.Error("the stored choice must be applied at start")
	}
}

func TestScanChecksEverythingExceptWhatDependsOnTheOtherToolsApps(t *testing.T) {
	claudeSkills, _ := isolate(t)
	writeSkillDir(t, claudeSkills, "generic-skill")
	writeSkillWithBody(t, claudeSkills, "mentions-claude-code", "Add the rule to CLAUDE.md like any Claude Code project does.")
	writeSkillWithBody(t, claudeSkills, "chrome-skill", "Drive the page with mcp__Claude_in_Chrome__navigate.")
	writeSkillWithBody(t, claudeSkills, "artifact-skill", "Build a claude.ai artifact and save it under /mnt/user-data/outputs.")
	writeSkillDir(t, filepath.Join(claudeSkills, "synced", "org_user"), "pdf")
	writeSkillDir(t, filepath.Join(claudeSkills, ".trash", "1792149802225-1-x"), "deleted-skill")
	s := NewService()

	found := scanned(t, s, SourceClaudeCode)
	if !found["generic-skill"].Selected || !found["mentions-claude-code"].Selected {
		t.Errorf("generic skills (even ones that mention CLAUDE.md) are checked: %+v", found)
	}
	for _, name := range []string{"chrome-skill", "artifact-skill", "synced:org_user:pdf"} {
		sk, ok := found[name]
		if !ok || sk.Selected || sk.Flag == "" {
			t.Errorf("%s must be listed, unchecked, with the reason: %+v (found %v)", name, sk, ok)
		}
	}
	if found["synced:org_user:pdf"].Title != "pdf" {
		t.Errorf("the title drops the folder prefix: %q", found["synced:org_user:pdf"].Title)
	}
	for name := range found {
		if strings.Contains(name, "deleted-skill") {
			t.Error("the .trash folder holds deleted skills and must not be listed")
		}
	}
	if got := s.SourcesView().Tools[0].Count; got != 4 {
		t.Errorf("the count agrees with what is read, not the trash or the synced copies: %d", got)
	}
}

func TestOnlyTheValidatedSkillsReachTheAgentAndTheChoiceIsRemembered(t *testing.T) {
	claudeSkills, _ := isolate(t)
	writeSkillDir(t, claudeSkills, "keep-a")
	writeSkillDir(t, claudeSkills, "keep-b")
	writeSkillDir(t, claudeSkills, "unchecked")
	s := NewService()

	if _, err := s.SaveSources(SourcesConfig{Selection: map[string][]string{SourceClaudeCode: {"keep-b", "keep-a", "keep-a", " "}}}); err != nil {
		t.Fatalf("save: %v", err)
	}
	names := availableNames(t)
	if !names["keep-a"] || !names["keep-b"] || names["unchecked"] {
		t.Errorf("only the validated skills reach the agent: %v", names)
	}

	// A second scan shows exactly what was validated, so the person can adjust it.
	again := scanned(t, s, SourceClaudeCode)
	if !again["keep-a"].Selected || !again["keep-b"].Selected || again["unchecked"].Selected {
		t.Errorf("a new scan reflects the earlier choice: %+v", again)
	}

	// A skill added to the folder later is listed but not taken in by itself.
	writeSkillDir(t, claudeSkills, "added-later")
	if availableNames(t)["added-later"] {
		t.Error("a skill added later must not be imported by itself")
	}
	if scanned(t, s, SourceClaudeCode)["added-later"].Selected {
		t.Error("and it is unchecked in the next scan of a source that was validated before")
	}

	// Validating nothing stops using the source.
	if _, err := s.SaveSources(SourcesConfig{Selection: map[string][]string{SourceClaudeCode: {}}}); err != nil {
		t.Fatalf("save: %v", err)
	}
	if names := availableNames(t); names["keep-a"] {
		t.Error("an empty validation gives the agent nothing")
	}
}

func TestLocalFoldersAreValidatedScannedAndOnlyUsedOnceValidated(t *testing.T) {
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
	if len(view.Folders) != 1 || !view.Folders[0].Exists || view.Folders[0].Count != 2 || view.Folders[0].Selected != 0 {
		t.Fatalf("one folder with two skills, none used yet (a duplicate is dropped): %+v", view.Folders)
	}
	if names := availableNames(t); names["mine"] {
		t.Fatal("an added folder gives nothing until the person validates it")
	}
	if _, err := s.Scan(filepath.Join(folder, "elsewhere")); err == nil {
		t.Error("only the folders that were added can be scanned")
	}
	found := scanned(t, s, folder)
	if !found["mine"].Selected || !found["also-mine"].Selected {
		t.Errorf("a first scan checks everything: %+v", found)
	}

	if _, err := s.SaveSources(SourcesConfig{Folders: []string{folder}, Selection: map[string][]string{folder: {"mine"}}}); err != nil {
		t.Fatalf("validate: %v", err)
	}
	if names := availableNames(t); !names["mine"] || names["also-mine"] {
		t.Errorf("only the validated skill of the folder is used: %v", names)
	}
}

func TestRemovingAFolderDropsWhatWasValidatedFromIt(t *testing.T) {
	isolate(t)
	s := NewService()
	folder := t.TempDir()
	writeSkillDir(t, folder, "mine")
	if _, err := s.SaveSources(SourcesConfig{Folders: []string{folder}, Selection: map[string][]string{folder: {"mine"}}}); err != nil {
		t.Fatalf("save: %v", err)
	}
	saved, err := s.SaveSources(SourcesConfig{})
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if len(saved.Selection) != 0 || availableNames(t)["mine"] {
		t.Errorf("a removed folder must leave nothing behind: %+v", saved)
	}
}

func TestCountSkillsIgnoresDotFolders(t *testing.T) {
	root := t.TempDir()
	writeSkillDir(t, root, "plain")
	writeSkillDir(t, filepath.Join(root, ".system"), "bundled-by-the-tool")
	if got := CountSkills(root); got != 1 {
		t.Errorf("CountSkills = %d, want 1 (the plain one; .system is not read)", got)
	}
}
