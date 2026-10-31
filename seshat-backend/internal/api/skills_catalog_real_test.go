package api

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/skillinstall"
)

// TestFeaturedReposAgainstRealClones checks the catalog against clones of the real repositories, when SESHAT_SKILL_CLONES points to a folder
// that holds them (named like the catalog entries, or "skills" for remotion). It is a check to run by hand when the catalog changes.
func TestFeaturedReposAgainstRealClones(t *testing.T) {
	root := os.Getenv("SESHAT_SKILL_CLONES")
	if root == "" {
		t.Skip("SESHAT_SKILL_CLONES is not set")
	}
	dirName := map[string]string{"remotion-skills": "skills"}
	for _, entry := range DefaultFeaturedRepos {
		dir := entry.Name
		if other, ok := dirName[entry.Name]; ok {
			dir = other
		}
		repo := filepath.Join(root, dir)
		plan := skillinstall.Detect(repo, skillSpec(&entry, nil))
		data, _ := json.Marshal(plan)
		t.Logf("%s: %s", entry.Name, data)
		missing := skillinstall.MissingSkills(repo, entry.Skills)
		if len(missing) > 0 {
			t.Errorf("%s: skills listed in the catalog that the repository does not hold: %v", entry.Name, missing)
		}
	}
}

func TestFeaturedReposAreWellFormed(t *testing.T) {
	names := map[string]bool{}
	for _, entry := range DefaultFeaturedRepos {
		if entry.Name == "" || entry.Description == "" || entry.Category == "" {
			t.Errorf("%q: name, description and category are required", entry.Name)
		}
		if names[entry.Name] {
			t.Errorf("%q is listed twice", entry.Name)
		}
		names[entry.Name] = true
		if err := validateSkillRepoURL(entry.URL, nil); err != nil {
			t.Errorf("%s: %v", entry.Name, err)
		}
		seen := map[string]bool{}
		for _, skill := range entry.Skills {
			if seen[skill] {
				t.Errorf("%s: skill %q is chosen twice", entry.Name, skill)
			}
			seen[skill] = true
		}
	}
	if names["gstack"] {
		t.Error("gstack was removed from the catalog: it is written for Claude Code")
	}
}
