package api

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	backendskills "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/skills"
)

// skillDTO is the serializable view of a skill — excludes function fields.
type skillDTO struct {
	Name          string   `json:"name"`
	DisplayName   string   `json:"display_name"`
	Description   string   `json:"description"`
	ArgumentHint  string   `json:"argument_hint,omitempty"`
	ArgNames      []string `json:"arg_names,omitempty"`
	WhenToUse     string   `json:"when_to_use,omitempty"`
	Version       string   `json:"version,omitempty"`
	Model         string   `json:"model,omitempty"`
	UserInvocable bool     `json:"user_invocable"`
	IsHidden      bool     `json:"is_hidden"`
	Enabled       bool     `json:"enabled"`
	Source        string   `json:"source"`
	Collection    string   `json:"collection"`
}

type skillWriteRequest struct {
	DisplayName  string `json:"display_name"`
	Description  string `json:"description"`
	ArgumentHint string `json:"argument_hint"`
	Content      string `json:"content"`
	Enabled      *bool  `json:"enabled,omitempty"`
}

type skillPatchRequest struct {
	DisplayName  *string `json:"display_name,omitempty"`
	Description  *string `json:"description,omitempty"`
	ArgumentHint *string `json:"argument_hint,omitempty"`
	Content      *string `json:"content,omitempty"`
	Enabled      *bool   `json:"enabled,omitempty"`
}

func principalUserID(r *http.Request) string {
	principal, _ := authPrincipalFromContext(r.Context())
	if principal == nil {
		return ""
	}
	return principal.User.ID
}

// GET /api/v1/skills
func (a *App) handleSkillsList(w http.ResponseWriter, r *http.Request) {
	cwd, _ := os.Getwd()
	allSkills, err := a.backend.Skills.List(cwd, principalUserID(r))
	if err != nil {
		writeBackendError(w, bkerr.Internal(fmt.Sprintf("failed to list skills: %v", err), err))
		return
	}
	dtos := make([]skillDTO, 0, len(allSkills))
	for _, sk := range allSkills {
		dtos = append(dtos, skillDTO{
			Name:          sk.Name,
			DisplayName:   sk.DisplayName,
			Description:   sk.Description,
			ArgumentHint:  sk.ArgumentHint,
			ArgNames:      sk.ArgNames,
			WhenToUse:     sk.WhenToUse,
			Version:       sk.Version,
			Model:         sk.Model,
			UserInvocable: sk.UserInvocable,
			IsHidden:      sk.IsHidden,
			Enabled:       sk.UserInvocable,
			Source:        string(sk.Source),
			Collection:    a.backend.Skills.InferCollection(sk),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"skills": dtos, "count": len(dtos)})
}

// handleSkillsRoot dispatches GET and POST on /api/v1/skills.
func (a *App) handleSkillsRoot(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		a.authMiddleware(http.HandlerFunc(a.handleSkillsList)).ServeHTTP(w, r)
	case http.MethodPost:
		a.authMiddleware(http.HandlerFunc(a.handleSkillCreate)).ServeHTTP(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// POST /api/v1/skills
func (a *App) handleSkillCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Name string `json:"name"`
		skillWriteRequest
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	name := strings.ToLower(strings.TrimSpace(body.Name))
	if name == "" {
		writeBackendError(w, bkerr.InvalidInput("name is required", nil))
		return
	}
	if err := a.backend.Skills.ValidateName(name); err != nil {
		writeBackendError(w, bkerr.InvalidInput(err.Error(), err))
		return
	}
	userDir := a.backend.Skills.UserDir(principalUserID(r))
	if err := a.backend.Skills.CheckQuota(userDir); err != nil {
		writeBackendError(w, bkerr.RateLimit(err.Error(), err))
		return
	}

	skillDir := filepath.Join(userDir, name)
	if _, err := os.Stat(skillDir); err == nil {
		writeBackendError(w, bkerr.Conflict(fmt.Sprintf("skill %q already exists", name), nil))
		return
	}
	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		writeBackendError(w, bkerr.Internal("failed to create skill directory", err))
		return
	}
	if err := a.backend.Skills.WriteFile(skillDir, name, toWriteParams(body.skillWriteRequest)); err != nil {
		writeBackendError(w, bkerr.Internal("failed to write skill file", err))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"name": name, "path": filepath.Join(skillDir, "skill.md")})
}

// handleSkillsDispatch routes /skills/* sub-paths.
func (a *App) handleSkillsDispatch(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/skills/")
	trimmed = strings.Trim(trimmed, "/")
	parts := strings.SplitN(trimmed, "/", 2)

	name := filepath.Base(parts[0])
	if len(parts) == 2 {
		switch parts[1] {
		case "content":
			a.handleSkillContent(w, r, name)
			return
		case "tree":
			a.handleSkillTree(w, r, name)
			return
		case "file":
			a.handleSkillFile(w, r, name)
			return
		}
	}
	a.handleSkillByName(w, r, name)
}

// handleSkillByName handles PUT and DELETE for /api/v1/skills/{name}.
func (a *App) handleSkillByName(w http.ResponseWriter, r *http.Request, name string) {
	if name == "" || name == "." || name == ".." {
		writeBackendError(w, bkerr.InvalidInput("invalid skill name", nil))
		return
	}
	skillDir := filepath.Join(a.backend.Skills.UserDir(principalUserID(r)), name)
	skillPath := filepath.Join(skillDir, "skill.md")

	switch r.Method {
	case http.MethodPut:
		var patch skillPatchRequest
		if !decodeJSONBody(w, r, &patch) {
			return
		}
		if _, err := os.Stat(skillDir); os.IsNotExist(err) {
			writeBackendError(w, bkerr.NotFound(fmt.Sprintf("skill %q not found", name), err))
			return
		}
		existing, err := a.backend.Skills.ReadFile(skillPath)
		if err != nil {
			writeBackendError(w, bkerr.Internal("failed to read existing skill file", err))
			return
		}
		if patch.DisplayName != nil {
			existing.DisplayName = strings.TrimSpace(*patch.DisplayName)
		}
		if patch.Description != nil {
			existing.Description = strings.TrimSpace(*patch.Description)
		}
		if patch.ArgumentHint != nil {
			existing.ArgumentHint = strings.TrimSpace(*patch.ArgumentHint)
		}
		if patch.Content != nil {
			existing.Content = *patch.Content
		}
		if patch.Enabled != nil {
			enabled := *patch.Enabled
			existing.Enabled = &enabled
		}
		if err := a.backend.Skills.WriteFile(skillDir, name, existing); err != nil {
			writeBackendError(w, bkerr.Internal("failed to write skill file", err))
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"name": name})

	case http.MethodDelete:
		if _, err := os.Stat(skillDir); os.IsNotExist(err) {
			writeBackendError(w, bkerr.NotFound(fmt.Sprintf("skill %q not found", name), err))
			return
		}
		if err := os.RemoveAll(skillDir); err != nil {
			writeBackendError(w, bkerr.Internal("failed to delete skill", err))
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// GET /api/v1/skills/{name}/content
func (a *App) handleSkillContent(w http.ResponseWriter, r *http.Request, name string) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	data, err := a.backend.Skills.GetContent(principalUserID(r), name)
	if err != nil {
		if os.IsNotExist(err) {
			writeBackendError(w, bkerr.NotFound(fmt.Sprintf("skill %q not found", name), err))
			return
		}
		writeBackendError(w, bkerr.Internal("failed to read skill", err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"name": name, "content": string(data)})
}

// GET /api/v1/skills/{name}/tree
func (a *App) handleSkillTree(w http.ResponseWriter, r *http.Request, name string) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	cwd, _ := os.Getwd()
	principal, _ := authPrincipalFromContext(r.Context())
	root, err := a.backend.Skills.RootFor(cwd, principalUserID(r), name)
	if err != nil || root == "" {
		writeBackendError(w, bkerr.NotFound(fmt.Sprintf("skill %q not found", name), err))
		return
	}
	if a.backend.Skills.IsRestrictedSource(root) {
		if principal == nil || !principal.HasRole("admin") {
			writeBackendError(w, bkerr.Forbidden("reading managed or builtin skill files requires admin role", nil))
			return
		}
	}
	tree, err := a.backend.Skills.BuildTree(root)
	if err != nil {
		writeBackendError(w, bkerr.Internal("failed to read skill directory", err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"name": name, "root": filepath.Base(root), "tree": tree})
}

// GET /api/v1/skills/{name}/file?path=scripts/run.sh
func (a *App) handleSkillFile(w http.ResponseWriter, r *http.Request, name string) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	relPath := r.URL.Query().Get("path")
	if relPath == "" {
		writeBackendError(w, bkerr.InvalidInput("path query parameter is required", nil))
		return
	}

	cwd, _ := os.Getwd()
	principal, _ := authPrincipalFromContext(r.Context())
	root, err := a.backend.Skills.RootFor(cwd, principalUserID(r), name)
	if err != nil || root == "" {
		writeBackendError(w, bkerr.NotFound(fmt.Sprintf("skill %q not found", name), err))
		return
	}
	if a.backend.Skills.IsRestrictedSource(root) {
		if principal == nil || !principal.HasRole("admin") {
			writeBackendError(w, bkerr.Forbidden("reading managed or builtin skill files requires admin role", nil))
			return
		}
	}

	absPath := filepath.Join(root, filepath.FromSlash(relPath))
	cleanRoot := filepath.Clean(root) + string(filepath.Separator)
	if !strings.HasPrefix(filepath.Clean(absPath)+string(filepath.Separator), cleanRoot) &&
		filepath.Clean(absPath) != filepath.Clean(root) {
		writeBackendError(w, bkerr.InvalidInput("invalid path", nil))
		return
	}

	info, err := os.Stat(absPath)
	if err != nil {
		writeBackendError(w, bkerr.NotFound("file not found", err))
		return
	}
	if info.IsDir() {
		writeBackendError(w, bkerr.InvalidInput("path is a directory", nil))
		return
	}
	if info.Size() > 2*1024*1024 {
		writeBackendError(w, bkerr.TooLarge("file too large", nil))
		return
	}

	data, err := os.ReadFile(absPath)
	if err != nil {
		writeBackendError(w, bkerr.Internal("failed to read file", err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"name":    filepath.Base(absPath),
		"path":    filepath.ToSlash(relPath),
		"content": string(data),
	})
}

// toWriteParams converts the HTTP body type to the domain WriteParams.
func toWriteParams(req skillWriteRequest) backendskills.WriteParams {
	return backendskills.WriteParams{
		DisplayName:  req.DisplayName,
		Description:  req.Description,
		ArgumentHint: req.ArgumentHint,
		Content:      req.Content,
		Enabled:      req.Enabled,
	}
}
