package skills

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	publicskills "github.com/KPO-Tech/seshat/pkg/skills"
)

// ─── ValidateName ─────────────────────────────────────────────────────────────

func TestValidateNameValid(t *testing.T) {
	svc := NewService()
	valid := []string{
		"my-skill",
		"my_skill",
		"skill42",
		"a",
		"code-reviewer",
		"abc_123-def",
	}
	for _, name := range valid {
		if err := svc.ValidateName(name); err != nil {
			t.Errorf("expected %q to be valid, got: %v", name, err)
		}
	}
}

func TestValidateNameInvalid(t *testing.T) {
	svc := NewService()
	invalid := []string{
		"My-Skill", // uppercase
		"my skill", // space
		"my.skill", // dot
		"SKILL",    // all uppercase
		"skill!",   // special char
		"αskill",   // non-ASCII
	}
	for _, name := range invalid {
		if err := svc.ValidateName(name); err == nil {
			t.Errorf("expected %q to be invalid", name)
		}
	}
}

func TestValidateNameMaxLength(t *testing.T) {
	svc := NewService()
	long := strings.Repeat("a", 65)
	if err := svc.ValidateName(long); err == nil {
		t.Error("expected 65-char name to be invalid")
	}
	exactly64 := strings.Repeat("a", 64)
	if err := svc.ValidateName(exactly64); err != nil {
		t.Errorf("expected 64-char name to be valid, got: %v", err)
	}
}

// ─── stripFrontmatter ─────────────────────────────────────────────────────────

func TestStripFrontmatterNoFrontmatter(t *testing.T) {
	input := "# Some content\n\nHello world."
	got := stripFrontmatter(input)
	if got != input {
		t.Errorf("expected unchanged input, got %q", got)
	}
}

func TestStripFrontmatterRemovesFrontmatter(t *testing.T) {
	input := "---\nname: \"My Skill\"\ndescription: \"Does things\"\n---\n\n# Content here"
	got := stripFrontmatter(input)
	if strings.Contains(got, "name:") {
		t.Error("frontmatter should have been stripped")
	}
	if !strings.Contains(got, "# Content here") {
		t.Error("content after frontmatter should be preserved")
	}
}

func TestStripFrontmatterOnlyFrontmatter(t *testing.T) {
	input := "---\nname: \"Test\"\n---"
	got := stripFrontmatter(input)
	if strings.TrimSpace(got) != "" {
		t.Errorf("expected empty body, got %q", got)
	}
}

func TestStripFrontmatterPassThroughIfNotClosed(t *testing.T) {
	// A "---" start without a closing "---" should be returned as-is.
	input := "---\nname: \"Unclosed\"\nno closing fence"
	got := stripFrontmatter(input)
	if got != input {
		t.Errorf("expected unchanged input for unclosed frontmatter, got %q", got)
	}
}

// ─── inferCollection ──────────────────────────────────────────────────────────

func TestInferCollectionMCP(t *testing.T) {
	sk := publicskills.Skill{Source: publicskills.SourceMCP}
	if got := inferCollection(sk); got != "mcp" {
		t.Errorf("expected mcp, got %q", got)
	}
}

func TestInferCollectionBundled(t *testing.T) {
	sk := publicskills.Skill{Source: publicskills.SourceBundled}
	if got := inferCollection(sk); got != "builtin" {
		t.Errorf("expected builtin, got %q", got)
	}
}

func TestInferCollectionUnknownPathFallsToProject(t *testing.T) {
	sk := publicskills.Skill{SkillRoot: "/completely/random/path/my-skill"}
	got := inferCollection(sk)
	// Should not panic and must return a non-empty string.
	if got == "" {
		t.Error("expected non-empty collection label")
	}
}

func TestInferCollectionRepoPath(t *testing.T) {
	reposDir := publicskills.GetSkillReposPath()
	sk := publicskills.Skill{SkillRoot: filepath.Join(reposDir, "my-repo", "skill-name")}
	got := inferCollection(sk)
	if got != "my-repo" {
		t.Errorf("expected repo name 'my-repo', got %q", got)
	}
}

// ─── IsRestrictedSource ───────────────────────────────────────────────────────

func TestIsRestrictedSourceRandomPath(t *testing.T) {
	svc := NewService()
	if svc.IsRestrictedSource("/tmp/some-random-skill-dir") {
		t.Error("random path should not be restricted")
	}
}

func TestIsRestrictedSourceManagedPath(t *testing.T) {
	svc := NewService()
	managedDir := publicskills.GetManagedSkillsPath()
	childPath := filepath.Join(managedDir, "some-skill")
	if !svc.IsRestrictedSource(childPath) {
		t.Errorf("path under managed dir (%s) should be restricted", childPath)
	}
}

func TestIsRestrictedSourceBuiltinPath(t *testing.T) {
	svc := NewService()
	builtinDir := publicskills.GetBuiltinSkillsPath()
	childPath := filepath.Join(builtinDir, "some-skill")
	if !svc.IsRestrictedSource(childPath) {
		t.Errorf("path under builtin dir (%s) should be restricted", childPath)
	}
}

// ─── BuildAgentSystemPrompt ───────────────────────────────────────────────────

func TestBuildAgentSystemPromptContainsUserPath(t *testing.T) {
	svc := NewService()
	userID := "usr_testuser123"
	prompt := svc.BuildAgentSystemPrompt(userID)
	if !strings.Contains(prompt, "SkillAgent") {
		t.Error("prompt should contain SkillAgent identity")
	}
	userPath := publicskills.UserPath(userID)
	if !strings.Contains(prompt, userPath) {
		t.Errorf("prompt should contain user path %q", userPath)
	}
}

// ─── AppendAgentPrompt ────────────────────────────────────────────────────────

func TestAppendAgentPromptNilExisting(t *testing.T) {
	svc := NewService()
	result := svc.AppendAgentPrompt(nil, "usr_test")
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if !strings.Contains(*result, "SkillAgent") {
		t.Error("result should contain SkillAgent prompt")
	}
}

func TestAppendAgentPromptEmptyExisting(t *testing.T) {
	svc := NewService()
	empty := ""
	result := svc.AppendAgentPrompt(&empty, "usr_test")
	if result == nil || !strings.Contains(*result, "SkillAgent") {
		t.Error("expected SkillAgent prompt for empty existing string")
	}
}

func TestAppendAgentPromptPrependsToExisting(t *testing.T) {
	svc := NewService()
	custom := "## Custom section"
	result := svc.AppendAgentPrompt(&custom, "usr_test")
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if !strings.Contains(*result, "SkillAgent") {
		t.Error("result should contain SkillAgent prompt")
	}
	if !strings.Contains(*result, custom) {
		t.Error("result should preserve existing content")
	}
	// SkillAgent prompt should appear BEFORE existing content.
	agentIdx := strings.Index(*result, "SkillAgent")
	customIdx := strings.Index(*result, custom)
	if agentIdx > customIdx {
		t.Error("agent prompt should appear before existing content")
	}
}

// ─── ResolvePrompt (fast paths) ───────────────────────────────────────────────

func TestResolvePromptNoSlashPrefix(t *testing.T) {
	svc := NewService()
	input := "tell me about Go generics"
	got := svc.ResolvePrompt(nil, "usr_test", input)
	if got != input {
		t.Errorf("expected unchanged prompt, got %q", got)
	}
}

func TestResolvePromptEmptySkillName(t *testing.T) {
	svc := NewService()
	// "/" with nothing after → skill name is empty, return as-is.
	input := "/ "
	got := svc.ResolvePrompt(nil, "usr_test", input)
	if got != input {
		t.Errorf("expected unchanged prompt for empty skill name, got %q", got)
	}
}

func TestResolvePromptUnknownSkillReturnsOriginal(t *testing.T) {
	svc := NewService()
	input := "/totally-nonexistent-skill-xyz args here"
	got := svc.ResolvePrompt(nil, "usr_test", input)
	if got != input {
		t.Errorf("expected unchanged prompt for unknown skill, got %q", got)
	}
}

// ─── CheckQuota ───────────────────────────────────────────────────────────────

func TestCheckQuotaEmptyDir(t *testing.T) {
	svc := NewService()
	dir := t.TempDir()
	if err := svc.CheckQuota(dir); err != nil {
		t.Errorf("expected no error for empty dir, got: %v", err)
	}
}

func TestCheckQuotaNonExistentDir(t *testing.T) {
	svc := NewService()
	dir := filepath.Join(t.TempDir(), "nonexistent-user-dir")
	// Non-existent dir is handled gracefully (0 skills).
	if err := svc.CheckQuota(dir); err != nil {
		t.Errorf("expected no error for non-existent dir, got: %v", err)
	}
}

func TestCheckQuotaAtLimit(t *testing.T) {
	svc := NewService()
	dir := t.TempDir()
	for i := 0; i < maxSkillsPerUser; i++ {
		subDir := filepath.Join(dir, "skill-"+strings.Repeat("a", 1)+string(rune('a'+i%26))+strings.Repeat("b", i/26))
		if err := os.MkdirAll(subDir, 0o755); err != nil {
			t.Fatalf("failed to create test dir: %v", err)
		}
	}
	// Exactly at the limit should be rejected.
	err := svc.CheckQuota(dir)
	if err == nil {
		t.Error("expected quota error at limit")
	}
	if !strings.Contains(err.Error(), "limit") {
		t.Errorf("error should mention limit, got: %v", err)
	}
}

// ─── WriteFile + ReadFile round-trip ─────────────────────────────────────────

func TestWriteFileReadFileRoundTrip(t *testing.T) {
	svc := NewService()
	dir := t.TempDir()

	enabled := true
	params := WriteParams{
		DisplayName:  "My Test Skill",
		Description:  "Does something useful",
		ArgumentHint: "[optional args]",
		Content:      "# Instructions\n\nDo the thing.",
		Enabled:      &enabled,
	}

	if err := svc.WriteFile(dir, "my-skill", params); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	skillPath := filepath.Join(dir, "skill.md")
	if _, err := os.Stat(skillPath); err != nil {
		t.Fatalf("skill.md not created: %v", err)
	}

	got, err := svc.ReadFile(skillPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if got.DisplayName != params.DisplayName {
		t.Errorf("DisplayName: want %q, got %q", params.DisplayName, got.DisplayName)
	}
	if got.Description != params.Description {
		t.Errorf("Description: want %q, got %q", params.Description, got.Description)
	}
	if got.ArgumentHint != params.ArgumentHint {
		t.Errorf("ArgumentHint: want %q, got %q", params.ArgumentHint, got.ArgumentHint)
	}
	if got.Enabled == nil || *got.Enabled != true {
		t.Error("expected Enabled=true")
	}
	if !strings.Contains(got.Content, "Do the thing.") {
		t.Errorf("Content: expected 'Do the thing.', got %q", got.Content)
	}
}

func TestWriteFileStripsFrontmatterFromContent(t *testing.T) {
	svc := NewService()
	dir := t.TempDir()

	// Content that itself has a frontmatter block should be stripped before writing.
	content := "---\nname: \"inner\"\n---\n\n# The real content"
	if err := svc.WriteFile(dir, "strip-test", WriteParams{Content: content}); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dir, "skill.md"))
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	// The embedded frontmatter should be stripped; only the outer one remains.
	occurrences := strings.Count(string(data), "---")
	if occurrences > 2 {
		t.Errorf("expected at most 2 '---' delimiters (outer frontmatter only), got %d", occurrences)
	}
}

// ─── BuildTree ────────────────────────────────────────────────────────────────

func TestBuildTreeEmpty(t *testing.T) {
	svc := NewService()
	dir := t.TempDir()
	tree, err := svc.BuildTree(dir)
	if err != nil {
		t.Fatalf("BuildTree: %v", err)
	}
	if len(tree) != 0 {
		t.Errorf("expected empty tree, got %d nodes", len(tree))
	}
}

func TestBuildTreeSkipsHiddenFiles(t *testing.T) {
	svc := NewService()
	dir := t.TempDir()
	// Create a visible file and a hidden file.
	if err := os.WriteFile(filepath.Join(dir, "skill.md"), []byte("content"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".gitignore"), []byte("*.log"), 0o644); err != nil {
		t.Fatal(err)
	}
	tree, err := svc.BuildTree(dir)
	if err != nil {
		t.Fatalf("BuildTree: %v", err)
	}
	for _, node := range tree {
		if strings.HasPrefix(node.Name, ".") {
			t.Errorf("hidden file %q should be excluded", node.Name)
		}
	}
	if len(tree) != 1 {
		t.Errorf("expected 1 visible node, got %d", len(tree))
	}
}

func TestBuildTreeSubdirectories(t *testing.T) {
	svc := NewService()
	dir := t.TempDir()
	subdir := filepath.Join(dir, "references")
	if err := os.MkdirAll(subdir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(subdir, "doc.md"), []byte("ref content"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "skill.md"), []byte("skill content"), 0o644); err != nil {
		t.Fatal(err)
	}

	tree, err := svc.BuildTree(dir)
	if err != nil {
		t.Fatalf("BuildTree: %v", err)
	}
	if len(tree) != 2 {
		t.Errorf("expected 2 top-level nodes, got %d", len(tree))
	}
	var refsNode *TreeNode
	for _, n := range tree {
		if n.Name == "references" {
			refsNode = n
		}
	}
	if refsNode == nil {
		t.Fatal("references directory not found in tree")
	}
	if !refsNode.IsDir {
		t.Error("references should be marked as IsDir")
	}
	if len(refsNode.Children) != 1 || refsNode.Children[0].Name != "doc.md" {
		t.Errorf("expected doc.md as child of references, got %v", refsNode.Children)
	}
}

func TestBuildTreePathsAreSlashSeparated(t *testing.T) {
	svc := NewService()
	dir := t.TempDir()
	subdir := filepath.Join(dir, "scripts")
	if err := os.MkdirAll(subdir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(subdir, "run.sh"), []byte("#!/bin/sh"), 0o755); err != nil {
		t.Fatal(err)
	}

	tree, err := svc.BuildTree(dir)
	if err != nil {
		t.Fatalf("BuildTree: %v", err)
	}
	for _, node := range tree {
		if node.IsDir && len(node.Children) > 0 {
			for _, child := range node.Children {
				if strings.Contains(child.Path, "\\") {
					t.Errorf("path %q contains backslash (expected forward slash)", child.Path)
				}
			}
		}
	}
}

// ─── GetContent ───────────────────────────────────────────────────────────────

func TestGetContentReturnsRawBytes(t *testing.T) {
	svc := NewService()
	// GetContent reads from publicskills.UserPath(userID) + name + "skill.md".
	// We can't control UserPath in tests, so we test the not-found case instead.
	_, err := svc.GetContent("usr_nonexistent_user_xyz", "nonexistent-skill")
	if err == nil {
		t.Error("expected error for non-existent skill")
	}
}
