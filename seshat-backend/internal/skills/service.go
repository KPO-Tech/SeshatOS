package skills

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	publicskills "github.com/KPO-Tech/seshat/pkg/skills"
	skillsloader "github.com/KPO-Tech/seshat/pkg/skills"
)

// skillAgentSystemPromptTemplate is prose-only, unlike DefaultKnowledgeAgentParams/
// DefaultInboxAgentParams (internal/agents), which are backed by a real
// agents.CreateParams.Tools allowlist enforced structurally via
// internal/query/service.go's toolAllowlistFromPatterns → input.AllowedTools
// → runtime.applyToolAllowlist. Skill Creator can't use that same static
// agents.CreateParams path because its prompt needs a per-user path
// (publicskills.UserPath(userID)) injected at request time, not a prompt
// fixed once at agent-definition time — see BuildAgentSystemPrompt below.
// Confirmed 2026-08-10 (helps/audit-2026-08-10.md, Phase 3): the
// "## Tools Available to You" list below is advisory only — the model isn't
// structurally restricted to it the way Knowledge/Inbox agents are, since
// ExecutionOriginSkillAgent's handling in query/service.go never sets
// input.AllowedTools. A real fix needs either a per-request AllowedTools
// override independent of the static AgentDefinition path, or per-tool
// "skill_agent" surface-profile metadata added upstream in the seshat
// runtime (internal/tools/registry/surface_profiles.go there only lists
// "bash" today) — deferred, not implemented here: getting the exact builtin
// tool-name list wrong would silently break Skill Creator with no way to
// verify live in this environment. The tool names below were cross-checked
// against the seshat runtime's actual ToolName constants and corrected
// (file_read/file_write/file_edit/webcrawl/scholarly did not match any real
// tool; read_file/write_file/edit_file/web_crawl/scholarly_search do).
const skillAgentSystemPromptTemplate = `You are SkillAgent, the assistant integrated in the Skills Creator of SeshatOS. Your sole purpose is to help the user create, improve, analyze, and test Seshat skills.

## What is a Seshat Skill

A skill is a directory containing:
  skill-name/
  ├── skill.md         (required) — YAML frontmatter + markdown instructions
  ├── references/      (optional) — documentation loaded into context
  ├── scripts/         (optional) — executable scripts (Python or shell)
  └── agents/          (optional) — specialized sub-agents

Format of skill.md:
  ---
  name: "Display Name"
  description: "When to invoke it and what it does. Be precise — this is the trigger mechanism."
  argument-hint: "[optional argument]"
  user-invocable: true
  ---

  # Instructions for the model
  ...

## Your Working Directory

User skills are stored in: %s
You MUST work ONLY within this directory and its subdirectories. Never read, write, or execute files outside of it.

## Workflow for Creating a Skill

1. Understand the intent — ask clarifying questions if needed (use ask_user_question)
2. Research the domain — use web_search, web_fetch, wikipedia, scholarly to understand the subject
3. Analyze existing skills — use seshat_list_skills and seshat_read_skill to find inspiration
4. Write skill.md — use file_write to create the skill directory and skill.md
5. Create supporting resources — references/, scripts/ if relevant
6. Validate — use seshat_validate_skill to check structure and quality
7. Iterate — refine based on feedback

## Principles for Writing Skills

- Describe the WHY, not just the WHAT — give the model understanding, not just rules
- Progressive disclosure: metadata (≤100 words) → skill.md body (≤500 lines) → references/
- Description field: MUST include when to invoke + what it does (this is the trigger mechanism)
- Use the imperative in instructions ("Do X", not "You should do X")
- Never include malware, exploit code, or content that would surprise the user
- Make descriptions "pushy": encourage invocation in all relevant contexts

## Tools Available to You

- seshat_list_skills — list all available skills with their collection
- seshat_read_skill — read the full content of any skill (builtin, repo, user)
- seshat_validate_skill — validate a skill's structure and frontmatter
- read_file, write_file, edit_file — file operations (within the skills directory only)
- bash — run shell commands, Python scripts, and automation within the skills directory only
- web_search, web_fetch, web_crawl, wikipedia, scholarly_search — online research
- ask_user_question — clarify the user's intent
- todo_write — plan the creation steps
- rag_search, rag_ingest — knowledge base access

## Using bash

Bash is available for running scripts, automating eval runs, and processing results. Restrict all bash operations to the skills directory: %s

Scripts bundled in skill-creator are at: %s/skill-creator/scripts/
Run them with: python3 -m scripts.<script_name> [args]

Scripts that analyze benchmark results (aggregate_benchmark.py, generate_report.py) work without API access.
Scripts that call the Seshat API (run_eval.py, improve_description.py, run_loop.py) require:
  export SESHAT_API_URL=http://localhost:8080   # adjust port if needed
  export SESHAT_API_TOKEN=<your-token>          # ask the user for their API token if not set`

const (
	maxSkillsPerUser = 100
	minDiskFreeBytes = 50 * 1024 * 1024 // 50 MB
)

type Service struct{}

func NewService() *Service { return &Service{} }

// UserDir returns the directory where user-created skills are stored.
func (s *Service) UserDir(userID string) string {
	return publicskills.UserPath(userID)
}

// ResolvePrompt detects "/skillname [args]" and returns the expanded skill prompt.
// If the message doesn't start with "/" or no matching skill is found, the original prompt is returned unchanged.
func (s *Service) ResolvePrompt(ctx context.Context, userID, prompt string) string {
	trimmed := strings.TrimSpace(prompt)
	if !strings.HasPrefix(trimmed, "/") {
		return prompt
	}
	rest := trimmed[1:]
	parts := strings.SplitN(rest, " ", 2)
	skillName := strings.TrimSpace(parts[0])
	if skillName == "" {
		return prompt
	}
	args := ""
	if len(parts) > 1 {
		args = strings.TrimSpace(parts[1])
	}

	cwd, _ := os.Getwd()
	allSkills, err := publicskills.AllForUser(cwd, userID)
	if err != nil {
		return prompt
	}
	for _, sk := range allSkills {
		if sk.IsHidden || !sk.UserInvocable {
			continue
		}
		if strings.EqualFold(sk.Name, skillName) || strings.EqualFold(sk.DisplayName, skillName) {
			if sk.GetPromptForCommand == nil {
				return prompt
			}
			blocks, err := sk.GetPromptForCommand(args, ctx)
			if err != nil || len(blocks) == 0 {
				return prompt
			}
			var sb strings.Builder
			for _, b := range blocks {
				sb.WriteString(b.Text)
			}
			return sb.String()
		}
	}
	return prompt
}

// BuildAgentSystemPrompt returns the SkillAgent system prompt with user-specific paths injected.
func (s *Service) BuildAgentSystemPrompt(userID string) string {
	userSkillsDir := publicskills.UserPath(userID)
	builtinSkillsDir := publicskills.GetBuiltinSkillsPath()
	return fmt.Sprintf(skillAgentSystemPromptTemplate, userSkillsDir, userSkillsDir, builtinSkillsDir)
}

// AppendAgentPrompt merges the SkillAgent system prompt into an existing AppendSystemPrompt value.
func (s *Service) AppendAgentPrompt(existing *string, userID string) *string {
	agentPrompt := s.BuildAgentSystemPrompt(userID)
	if existing != nil && strings.TrimSpace(*existing) != "" {
		combined := agentPrompt + "\n\n" + *existing
		return &combined
	}
	return &agentPrompt
}

// List returns all skills visible to the given user.
func (s *Service) List(cwd, userID string) ([]publicskills.Skill, error) {
	return publicskills.AllForUser(cwd, userID)
}

// RootFor finds the on-disk directory for any skill (across all collections).
func (s *Service) RootFor(cwd, userID, name string) (string, error) {
	all, err := publicskills.AllForUser(cwd, userID)
	if err != nil {
		return "", err
	}
	for _, sk := range all {
		if sk.Name == name || strings.EqualFold(sk.DisplayName, name) {
			return resolveDirectory(sk), nil
		}
	}
	return "", fmt.Errorf("skill %q not found", name)
}

// GetContent returns the raw skill.md bytes for a user skill.
func (s *Service) GetContent(userID, name string) ([]byte, error) {
	skillPath := filepath.Join(publicskills.UserPath(userID), name, "skill.md")
	return os.ReadFile(skillPath)
}

// BuildTree returns the recursive file tree of the skill root directory.
func (s *Service) BuildTree(root string) ([]*TreeNode, error) {
	return buildTree(root, root)
}

// CheckQuota verifies the user has not reached the skill limit and has sufficient disk space.
func (s *Service) CheckQuota(userDir string) error {
	entries, err := os.ReadDir(userDir)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("cannot read skill directory")
	}
	skillCount := 0
	for _, e := range entries {
		if e.IsDir() {
			skillCount++
		}
	}
	if skillCount >= maxSkillsPerUser {
		return fmt.Errorf("skill limit reached (max %d per user)", maxSkillsPerUser)
	}
	statDir := userDir
	if _, err := os.Stat(statDir); os.IsNotExist(err) {
		statDir = filepath.Dir(statDir)
	}
	if freeBytes, ok := freeDiskBytes(statDir); ok && freeBytes < minDiskFreeBytes {
		return fmt.Errorf("insufficient disk space (less than 50 MB free)")
	}
	return nil
}

// ValidateName checks a skill name against the allowed character set.
func (s *Service) ValidateName(name string) error {
	if len(name) > 64 {
		return fmt.Errorf("name must be 64 characters or fewer")
	}
	for _, c := range name {
		if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_') {
			return fmt.Errorf("name may only contain lowercase letters, digits, hyphens, and underscores")
		}
	}
	return nil
}

// WriteFile writes a skill.md file from the given WriteParams.
func (s *Service) WriteFile(skillDir, name string, params WriteParams) error {
	var sb strings.Builder
	sb.WriteString("---\n")
	if params.DisplayName != "" {
		sb.WriteString(fmt.Sprintf("name: %q\n", params.DisplayName))
	}
	if params.Description != "" {
		sb.WriteString(fmt.Sprintf("description: %q\n", params.Description))
	}
	if params.ArgumentHint != "" {
		sb.WriteString(fmt.Sprintf("argument-hint: %q\n", params.ArgumentHint))
	}
	enabled := true
	if params.Enabled != nil {
		enabled = *params.Enabled
	}
	sb.WriteString(fmt.Sprintf("user-invocable: %t\n", enabled))
	sb.WriteString("---\n")
	content := strings.TrimSpace(stripFrontmatter(params.Content))
	if content != "" {
		sb.WriteString("\n")
		sb.WriteString(content)
		sb.WriteString("\n")
	}
	return os.WriteFile(filepath.Join(skillDir, "skill.md"), []byte(sb.String()), 0o644)
}

// ReadFile reads and parses an existing skill.md, returning its data as WriteParams.
func (s *Service) ReadFile(skillPath string) (WriteParams, error) {
	data, err := os.ReadFile(skillPath)
	if err != nil {
		return WriteParams{}, err
	}
	frontmatter, markdownContent := skillsloader.ParseFrontmatter(string(data), skillPath)
	result := WriteParams{
		ArgumentHint: frontmatter.ArgumentHint,
		Content:      markdownContent,
	}
	if displayName, ok := frontmatter.Name.(string); ok {
		result.DisplayName = displayName
	}
	if description, ok := frontmatter.Description.(string); ok {
		result.Description = description
	}
	enabled := true
	if frontmatter.UserInvocable != nil {
		enabled = skillsloader.ParseBooleanFrontmatter(frontmatter.UserInvocable)
	}
	result.Enabled = &enabled
	return result, nil
}

// IsRestrictedSource reports whether root belongs to the managed or builtin collection.
func (s *Service) IsRestrictedSource(root string) bool {
	managed := filepath.Clean(skillsloader.GetManagedSkillsPath())
	builtin := filepath.Clean(skillsloader.GetBuiltinSkillsPath())
	clean := filepath.Clean(root)
	sep := string(filepath.Separator)
	return clean == managed || strings.HasPrefix(clean+sep, managed+sep) ||
		clean == builtin || strings.HasPrefix(clean+sep, builtin+sep)
}

// InferCollection returns the human-readable collection label for a skill.
func (s *Service) InferCollection(sk publicskills.Skill) string {
	return inferCollection(sk)
}

// ─── unexported helpers ───────────────────────────────────────────────────────

func buildTree(root, dir string) ([]*TreeNode, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	nodes := make([]*TreeNode, 0, len(entries))
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") {
			continue
		}
		rel, _ := filepath.Rel(root, filepath.Join(dir, e.Name()))
		node := &TreeNode{
			Name:  e.Name(),
			Path:  filepath.ToSlash(rel),
			IsDir: e.IsDir(),
		}
		if e.IsDir() {
			node.Children, _ = buildTree(root, filepath.Join(dir, e.Name()))
		}
		nodes = append(nodes, node)
	}
	return nodes, nil
}

func stripFrontmatter(content string) string {
	trimmed := strings.TrimSpace(content)
	if !strings.HasPrefix(trimmed, "---\n") && trimmed != "---" {
		return content
	}
	lines := strings.Split(trimmed, "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != "---" {
		return content
	}
	for idx := 1; idx < len(lines); idx++ {
		if strings.TrimSpace(lines[idx]) != "---" {
			continue
		}
		return strings.Join(lines[idx+1:], "\n")
	}
	return content
}

func resolveDirectory(sk publicskills.Skill) string {
	if sk.SkillRoot == "" {
		return ""
	}
	if _, err := os.Stat(filepath.Join(sk.SkillRoot, "skill.md")); err == nil {
		return sk.SkillRoot
	}
	relativeName := strings.ReplaceAll(sk.Name, ":", string(filepath.Separator))
	if relativeName == "" {
		return sk.SkillRoot
	}
	candidate := filepath.Join(sk.SkillRoot, relativeName)
	if _, err := os.Stat(filepath.Join(candidate, "skill.md")); err == nil {
		return candidate
	}
	return sk.SkillRoot
}

func inferCollection(sk publicskills.Skill) string {
	if sk.Source == skillsloader.SourceMCP {
		return "mcp"
	}
	if sk.Source == skillsloader.SourceBundled {
		return "builtin"
	}
	reposDir := skillsloader.GetSkillReposPath()
	if strings.HasPrefix(sk.SkillRoot, reposDir+string(filepath.Separator)) {
		rel := strings.TrimPrefix(sk.SkillRoot, reposDir+string(filepath.Separator))
		parts := strings.SplitN(rel, string(filepath.Separator), 2)
		return parts[0]
	}
	managedDir := skillsloader.GetManagedSkillsPath()
	if strings.HasPrefix(sk.SkillRoot, managedDir) {
		return "managed"
	}
	builtinDir := skillsloader.GetBuiltinSkillsPath()
	if strings.HasPrefix(sk.SkillRoot, builtinDir) {
		return "builtin"
	}
	skillsRoot := skillsloader.GetSkillsRootPath()
	if strings.HasPrefix(sk.SkillRoot, filepath.Join(skillsRoot, "users")) ||
		strings.HasPrefix(sk.SkillRoot, filepath.Join(skillsRoot, "user")) {
		return "user"
	}
	return "project"
}
