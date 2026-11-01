package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/skillregistry"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/skillinstall"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/tasks"
	"github.com/KPO-Tech/seshat-runtime/pkg/runtimepath"
	skillsloader "github.com/KPO-Tech/seshat-runtime/pkg/skills"
	"github.com/KPO-Tech/seshat-runtime/pkg/skills/skillrepos"
)

// FeaturedSkillRepo describes a curated skill repository shown in the install catalog.
type FeaturedSkillRepo struct {
	Name        string `json:"name"`
	URL         string `json:"url"`
	Description string `json:"description"`
	// Category is a short label for the kind of work the skills do ("Presentations", "Security").
	Category string `json:"category,omitempty"`
	// Skills are the skills chosen from the repository, by folder name; empty means every skill it holds.
	Skills []string `json:"skills,omitempty"`
	// SkillCount is how many skills the repository holds when the entry does not choose, as checked when it was written.
	SkillCount int `json:"skill_count,omitempty"`
	// Needs lists what the skills use beyond the agent itself ("Python 3.10+", "Docker"), so that the person knows before installing.
	Needs []string `json:"needs,omitempty"`
	// PythonMinimum is the oldest Python the skills accept, "3.10" when empty.
	PythonMinimum string `json:"-"`
	// PythonPackages are packages the skills use and the repository does not list in a requirements file.
	PythonPackages []string `json:"-"`
}

// DefaultSeshatSkillsRepo is the official Seshat skills collection. Left empty
// for now: some of its skills (e.g. pdf) shadow the SDK's own better-suited
// built-in tools (document-reader-backed Read) for tasks the skill's description
// claims too broadly, causing worse agent behavior than not having it at all.
// Re-enable once the individual skill descriptions are scoped tightly enough
// to stop competing with built-in tools. Operators can still opt in with
// SESHAT_DEFAULT_SKILL_REPO.
const DefaultSeshatSkillsRepo = ""

// defaultAllowedSkillRepoHosts is the curated allowlist of git hosting services accepted
// when installing a skill repo via the HTTP API. Operators may override with SESHAT_SKILL_REPO_HOSTS.
var defaultAllowedSkillRepoHosts = []string{
	"github.com",
	"gitlab.com",
	"bitbucket.org",
	"codeberg.org",
}

// validateSkillRepoURL enforces that a repo URL uses HTTPS and comes from an allowed host.
// If allowedHosts is empty, defaultAllowedSkillRepoHosts is used.
func validateSkillRepoURL(raw string, allowedHosts []string) error {
	if !strings.HasPrefix(raw, "https://") {
		scheme := strings.SplitN(raw, "://", 2)[0]
		return fmt.Errorf("skill repo URL must use https:// — %q scheme is not allowed", scheme+"://")
	}
	u, err := url.Parse(raw)
	if err != nil || strings.TrimSpace(u.Host) == "" {
		return fmt.Errorf("skill repo URL is not a valid HTTPS URL")
	}
	hosts := allowedHosts
	if len(hosts) == 0 {
		hosts = defaultAllowedSkillRepoHosts
	}
	host := strings.ToLower(strings.TrimPrefix(u.Host, "www."))
	for _, allowed := range hosts {
		if strings.ToLower(strings.TrimPrefix(allowed, "www.")) == host {
			return nil
		}
	}
	return fmt.Errorf("host %q is not in the allowed skill repo hosts list (allowed: %s) — set SESHAT_SKILL_REPO_HOSTS to add it",
		u.Host, strings.Join(hosts, ", "))
}

// ParseSkillRepoHosts parses a comma-separated list of allowed git hosting domains.
func ParseSkillRepoHosts(raw string) []string {
	var hosts []string
	for _, h := range strings.Split(raw, ",") {
		h = strings.TrimSpace(strings.ToLower(h))
		if h != "" {
			hosts = append(hosts, h)
		}
	}
	return hosts
}

// countSkillsInRepo counts skills found in repoRoot. It handles two layouts:
//   - multi-skill repos: each subdirectory containing a skill.md is one skill
//   - single-skill repos: a skill.md directly at the repo root counts as one skill
func countSkillsInRepo(repoRoot string) int {
	entries, err := os.ReadDir(repoRoot)
	if err != nil {
		return 0
	}
	count := 0
	for _, e := range entries {
		if e.IsDir() {
			if dirHasSkillFile(filepath.Join(repoRoot, e.Name())) {
				count++
			}
		} else if strings.EqualFold(e.Name(), "skill.md") {
			count++ // root-level single-skill repo
		}
	}
	return count
}

// dirHasSkillFile reports whether dir contains a file named skill.md
// (case-insensitive) at its top level.
func dirHasSkillFile(dir string) bool {
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

// installedRepoNames returns the names of repos currently cloned under reposDir.
func installedRepoNames() map[string]struct{} {
	reposDir := skillsloader.GetSkillReposPath()
	entries, err := os.ReadDir(reposDir)
	if err != nil {
		return nil
	}
	names := make(map[string]struct{}, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		// A repository whose installation was not finished is not installed: its skills are not offered yet.
		if install, ok := skillsloader.LoadRepoInstall(filepath.Join(reposDir, e.Name())); ok && install.Pending {
			continue
		}
		names[e.Name()] = struct{}{}
	}
	return names
}

// ─── HTTP handlers ────────────────────────────────────────────────────────────

// handleSkillRepos dispatches GET and POST on /api/v1/skills/repos.
func (a *App) handleSkillRepos(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		a.handleSkillReposList(w, r)
	case http.MethodPost:
		a.handleSkillRepoInstall(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// GET /api/v1/skills/repos
// Returns:
//
//	{
//	  "installed": [{"name","url","skill_count"}],
//	  "catalog":   [{"name","url","description","installed"}]
//	}
func (a *App) handleSkillReposList(w http.ResponseWriter, r *http.Request) {
	reposDir := skillsloader.GetSkillReposPath()
	installedNames := installedRepoNames()

	type installedEntry struct {
		Name       string `json:"name"`
		URL        string `json:"url,omitempty"`
		SkillCount int    `json:"skill_count"`
	}
	type catalogEntry struct {
		Name        string   `json:"name"`
		URL         string   `json:"url"`
		Description string   `json:"description"`
		Installed   bool     `json:"installed"`
		Category    string   `json:"category,omitempty"`
		SkillCount  int      `json:"skill_count,omitempty"`
		Needs       []string `json:"needs,omitempty"`
		// Source is "organization" for entries pulled from a connected
		// seshat-server's registry, omitted for the built-in/operator-configured
		// featured repos — see internal/cloudskillregistry.
		Source string `json:"source,omitempty"`
	}

	// Build installed list (never nil so JSON serializes as [] not null).
	installed := make([]installedEntry, 0)
	for name := range installedNames {
		repoRoot := filepath.Join(reposDir, name)
		// Try to read the remote URL from git config for display purposes.
		url := readGitRemoteURL(repoRoot)
		installed = append(installed, installedEntry{
			Name:       name,
			URL:        url,
			SkillCount: countSkillsInRepo(repoRoot),
		})
	}

	// Build catalog from featured repos (never nil so JSON serializes as [] not null).
	catalog := make([]catalogEntry, 0)
	seen := make(map[string]bool)
	for _, fr := range a.featuredRepos {
		_, isInstalled := installedNames[fr.Name]
		catalog = append(catalog, catalogEntry{
			Name:        fr.Name,
			URL:         fr.URL,
			Description: fr.Description,
			Installed:   isInstalled,
			Category:    fr.Category,
			SkillCount:  featuredSkillCount(fr),
			Needs:       fr.Needs,
		})
		seen[fr.Name] = true
	}

	// Additive enrichment: the organization's curated registry, fetched live
	// per-request using the caller's own token (this handler is already
	// admin-gated locally via requireRole("admin")). Never a hard dependency
	// — any failure just means "nothing to add," never an error response.
	if a.connectedServerURL != "" {
		if principal, ok := authPrincipalFromContext(r.Context()); ok {
			client := cloudskillregistry.NewClient(a.connectedServerURL)
			orgRepos, err := client.ListSkillRepos(r.Context(), principal.AuthSession.ID, principal.OrganizationID())
			if err == nil {
				for _, or := range orgRepos {
					if seen[or.Name] {
						continue
					}
					_, isInstalled := installedNames[or.Name]
					catalog = append(catalog, catalogEntry{
						Name:        or.Name,
						URL:         or.URL,
						Description: or.Description,
						Installed:   isInstalled,
						Source:      "organization",
					})
					seen[or.Name] = true
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"installed": installed,
		"catalog":   catalog,
	})
}

// POST /api/v1/skills/repos
// Body: {"url": "https://github.com/..."}
func (a *App) handleSkillRepoInstall(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeBackendError(w, bkerr.InvalidInput("invalid JSON body", err))
		return
	}
	url := strings.TrimSpace(body.URL)
	if url == "" {
		writeBackendError(w, bkerr.InvalidInput("url is required", nil))
		return
	}
	if err := validateSkillRepoURL(url, a.allowedSkillRepoHosts); err != nil {
		writeBackendError(w, bkerr.InvalidInput(err.Error(), err))
		return
	}

	repo := skillrepos.RepoFromURL(url)
	featured := a.featuredByURL(url)
	if featured != nil {
		repo.Name = featured.Name
	}
	if !validSkillRepoName(repo.Name) {
		writeBackendError(w, bkerr.InvalidInput("the address does not name a repository", nil))
		return
	}
	reposDir := skillsloader.GetSkillReposPath()

	// Check it's not already installed. An installation the person left unfinished (they did not agree to the plan) is started again.
	target := filepath.Join(reposDir, repo.Name)
	if a.skillInstallRunning(repo.Name) {
		writeBackendError(w, bkerr.Conflict(fmt.Sprintf("repo %q is being installed", repo.Name), nil))
		return
	}
	if pending, _ := skillsloader.LoadRepoInstall(target); pending.Pending {
		_ = os.RemoveAll(target)
		_ = os.RemoveAll(skillEnvironmentDir(repo.Name))
	}
	if _, err := os.Stat(filepath.Join(target, ".git")); err == nil {
		writeBackendError(w, bkerr.Conflict(fmt.Sprintf("repo %q is already installed", repo.Name), nil))
		return
	}

	// The download goes on in the background, with a context of its own: a large repository takes minutes, and the request must not wait for
	// it. When it ends, what the skills need is read and the plan is ready to be shown (see handleSkillRepoPlan); nothing of the repository is
	// run, and its skills stay out of the agent's reach until the person has agreed to the installation (see handleSkillRepoEnvironment).
	task, _ := a.taskManager().Start(skillCloneTask, repo.Name, "Downloading "+repo.Name, func(ctx context.Context, report *tasks.Reporter) error {
		report.Step(1, 2, "Downloading the skills")
		if err := skillinstall.CloneInto(ctx, repo.URL, skillCloneStaging(repo.Name), target, report); err != nil {
			return err
		}
		report.Step(2, 2, "Reading what they need")
		spec := skillSpec(featured, nil)
		plan := skillinstall.Detect(target, spec)
		if len(spec.Include) > 0 || !plan.Empty() {
			if err := skillinstall.WriteInstall(target, skillsloader.RepoInstall{Include: spec.Include, Pending: !plan.Empty()}); err != nil {
				_ = os.RemoveAll(target)
				return fmt.Errorf("could not record the installation: %w", err)
			}
		}
		return nil
	})
	writeJSON(w, http.StatusAccepted, map[string]any{"name": repo.Name, "task": task})
}

// GET /api/v1/skills/repos/{name}/plan
// What the skills of a downloaded repository need, for the person to agree to. needs_environment is false when nothing has to be installed.
func (a *App) handleSkillRepoPlan(w http.ResponseWriter, r *http.Request, name string) {
	target := filepath.Join(skillsloader.GetSkillReposPath(), name)
	if _, err := os.Stat(filepath.Join(target, ".git")); err != nil {
		writeBackendError(w, bkerr.NotFound(fmt.Sprintf("repo %q is not installed", name), err))
		return
	}
	recorded, _ := skillsloader.LoadRepoInstall(target)
	spec := skillSpec(a.featuredByName(name), recorded.Include)
	plan := skillinstall.Detect(target, spec)
	count := countSkillsInRepo(target)
	if len(spec.Include) > 0 {
		count = len(spec.Include)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"name":              name,
		"skill_count":       count,
		"plan":              plan,
		"needs_environment": recorded.Pending && !plan.Empty(),
	})
}

// featuredByURL finds the catalog entry of a repository address, ignoring a trailing ".git", a trailing slash and the case.
func (a *App) featuredByURL(raw string) *FeaturedSkillRepo {
	clean := func(u string) string {
		return strings.ToLower(strings.TrimSuffix(strings.TrimSuffix(strings.TrimSpace(u), "/"), ".git"))
	}
	for i := range a.featuredRepos {
		if clean(a.featuredRepos[i].URL) == clean(raw) {
			return &a.featuredRepos[i]
		}
	}
	return nil
}

func (a *App) featuredByName(name string) *FeaturedSkillRepo {
	for i := range a.featuredRepos {
		if a.featuredRepos[i].Name == name {
			return &a.featuredRepos[i]
		}
	}
	return nil
}

func featuredSkillCount(fr FeaturedSkillRepo) int {
	if len(fr.Skills) > 0 {
		return len(fr.Skills)
	}
	return fr.SkillCount
}

// skillSpec is what the catalog asks of a repository: the skills chosen and the packages the repository does not list itself. A repository
// that is not in the catalog keeps the skills recorded when it was installed, or all of them.
func skillSpec(featured *FeaturedSkillRepo, recorded []string) skillinstall.Spec {
	if featured == nil {
		return skillinstall.Spec{Include: recorded}
	}
	return skillinstall.Spec{Include: featured.Skills, PythonMinimum: featured.PythonMinimum, PythonPackages: featured.PythonPackages}
}

// skillCloneStaging is where a repository is downloaded before it is moved among the others: outside the folder the skills are read from.
func skillCloneStaging(name string) string {
	return runtimepath.Join("", "skill-clones", name)
}

// validSkillRepoName reports whether a name taken from an address can be a folder of its own: not empty, not "." or "..", no separator.
// Without it an address ending in ".." would make the repository the folder of all the others.
func validSkillRepoName(name string) bool {
	return name != "" && name != "." && name != ".." && !strings.ContainsAny(name, `/\`) && !strings.HasPrefix(name, ".")
}

// skillEnvironmentDir is where the environment of a repository lives: outside the repository, so that reading its skills never walks it.
func skillEnvironmentDir(name string) string {
	return runtimepath.Join("", "skill-envs", name)
}

// POST /api/v1/skills/repos/{name}/environment
// Makes the environment shown in the plan returned by the installation, once the person has agreed to it.
func (a *App) handleSkillRepoEnvironment(w http.ResponseWriter, r *http.Request, name string) {
	reposDir := skillsloader.GetSkillReposPath()
	target := filepath.Join(reposDir, name)
	if _, err := os.Stat(filepath.Join(target, ".git")); err != nil {
		writeBackendError(w, bkerr.NotFound(fmt.Sprintf("repo %q is not installed", name), err))
		return
	}
	recorded, _ := skillsloader.LoadRepoInstall(target)
	spec := skillSpec(a.featuredByName(name), recorded.Include)
	plan := skillinstall.Detect(target, spec)
	// The installation goes on in the background, with a context of its own: the request ends at once, and leaving the page or losing the
	// connection does not stop it. The task says where it is, and can be cancelled.
	task, _ := a.taskManager().Start(skillInstallTask, name, "Installing "+name, func(ctx context.Context, report *tasks.Reporter) error {
		return skillinstall.EnvironmentWith(ctx, target, skillEnvironmentDir(name), spec, plan, report)
	})
	writeJSON(w, http.StatusAccepted, map[string]any{"name": name, "task": task})
}

const (
	// skillInstallTask is the kind of the task that makes the environment of a skill repository.
	skillInstallTask = "skill.install"
	// skillCloneTask is the kind of the task that downloads a skill repository.
	skillCloneTask = "skill.clone"
)

// skillInstallRunning reports whether a repository is being downloaded or its environment is being made.
func (a *App) skillInstallRunning(name string) bool {
	for _, task := range a.taskManager().List() {
		if (task.Kind == skillInstallTask || task.Kind == skillCloneTask) && task.Subject == name && task.Status.Active() {
			return true
		}
	}
	return false
}

// handleSkillRepoByNameDispatch routes DELETE /api/v1/skills/repos/{name}.
func (a *App) handleSkillRepoByNameDispatch(w http.ResponseWriter, r *http.Request) {
	// Strip leading "/skills/repos/" prefix.
	trimmed := strings.Trim(strings.TrimPrefix(r.URL.Path, "/skills/repos/"), "/")
	environment := strings.HasSuffix(trimmed, "/environment")
	plan := strings.HasSuffix(trimmed, "/plan")
	name := filepath.Base(strings.TrimSuffix(strings.TrimSuffix(trimmed, "/environment"), "/plan"))
	if name == "" || name == "." || name == ".." {
		writeBackendError(w, bkerr.InvalidInput("invalid repo name", nil))
		return
	}
	switch {
	case environment && r.Method == http.MethodPost:
		a.handleSkillRepoEnvironment(w, r, name)
	case plan && r.Method == http.MethodGet:
		a.handleSkillRepoPlan(w, r, name)
	case !environment && !plan && r.Method == http.MethodDelete:
		a.handleSkillRepoUninstall(w, r, name)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// DELETE /api/v1/skills/repos/{name}
func (a *App) handleSkillRepoUninstall(w http.ResponseWriter, r *http.Request, name string) {
	reposDir := skillsloader.GetSkillReposPath()
	target := filepath.Join(reposDir, name)

	// Prevent path traversal: the cleaned target must still be inside reposDir.
	if !strings.HasPrefix(filepath.Clean(target)+string(filepath.Separator), filepath.Clean(reposDir)+string(filepath.Separator)) {
		writeBackendError(w, bkerr.InvalidInput("invalid repo name", nil))
		return
	}

	if _, err := os.Stat(target); os.IsNotExist(err) {
		writeBackendError(w, bkerr.NotFound(fmt.Sprintf("repo %q is not installed", name), err))
		return
	}
	if a.skillInstallRunning(name) {
		writeBackendError(w, bkerr.Conflict(fmt.Sprintf("%q is being installed: cancel the installation first", name), nil))
		return
	}

	if err := os.RemoveAll(target); err != nil {
		writeBackendError(w, bkerr.Internal("failed to remove repository", err))
		return
	}
	// The environment made for it goes with it.
	_ = os.RemoveAll(skillEnvironmentDir(name))

	w.WriteHeader(http.StatusNoContent)
}

// readGitRemoteURL returns the remote origin URL of a cloned repo, or empty string on error.
func readGitRemoteURL(repoDir string) string {
	data, err := os.ReadFile(filepath.Join(repoDir, ".git", "config"))
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "url = ") {
			return strings.TrimPrefix(line, "url = ")
		}
	}
	return ""
}
