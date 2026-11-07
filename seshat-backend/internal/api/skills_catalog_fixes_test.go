package api

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/skillinstall"
)

// TestCatalogCorrectionsStillFitTheirSkills runs the corrections of the catalog on a real checkout of each skill repository that has some, when
// SESHAT_TEST_SKILL_CHECKOUTS names a folder holding the checkouts under the names of the catalog entries (ui-ux-pro-max-skill/...). It is the
// way to learn that a skill changed upstream in a way that makes a correction stop applying.
func TestCatalogCorrectionsStillFitTheirSkills(t *testing.T) {
	base := os.Getenv("SESHAT_TEST_SKILL_CHECKOUTS")
	if base == "" {
		t.Skip("SESHAT_TEST_SKILL_CHECKOUTS is not set")
	}
	for _, repo := range DefaultFeaturedRepos {
		if len(repo.Expose) == 0 {
			continue
		}
		checkout := filepath.Join(base, repo.Name)
		if _, err := os.Stat(checkout); err != nil {
			continue
		}
		work := t.TempDir()
		if err := os.CopyFS(work, os.DirFS(checkout)); err != nil {
			t.Fatal(err)
		}
		if warnings := skillinstall.Prepare(work, skillSpec(&repo, nil)); len(warnings) != 0 {
			t.Fatalf("%s: %v", repo.Name, warnings)
		}
		for _, item := range repo.Expose {
			text, err := os.ReadFile(filepath.Join(work, item.To, "SKILL.md"))
			if err != nil {
				t.Fatalf("%s: %v", repo.Name, err)
			}
			if strings.Contains(string(text), "CLAUDE_PLUGIN_ROOT") {
				t.Fatalf("%s: the path of a Claude plugin is still in %s", repo.Name, item.To)
			}
		}
	}
}
