// Package cloudskillregistry fetches an organization's curated skill-repo
// registry from seshat-server, to enrich seshat-backend's own local
// skill-repo catalog (internal/api/skills_repos.go). Unlike auth/settings/
// preferences, this is purely additive — the local catalog stays the
// authoritative, always-available source; the org registry is one more
// entry source merged in per-request, not a Provider that replaces anything
// (see helps/seshat-architecture-target.md §3, "Skills").
package cloudskillregistry

// SkillRepo mirrors seshat-server's skillregistry.SkillRepo.
type SkillRepo struct {
	Name        string `json:"name"`
	URL         string `json:"url"`
	Description string `json:"description,omitempty"`
}

type listResponse struct {
	SkillRepos []SkillRepo `json:"skill_repos"`
}
