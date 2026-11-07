package api

import (
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/skillinstall"
)

// A repository of the catalog is installed at a commit: one that follows its default branch changes under the person, with scripts and
// instructions that the agent follows. An entry added without a Ref would bring that back without anyone seeing it.
func TestEveryRepositoryOfTheCatalogIsInstalledAtACommit(t *testing.T) {
	for _, repo := range DefaultFeaturedRepos {
		if !skillinstall.IsCommit(repo.Ref) {
			t.Errorf("%s: Ref must be a whole commit (40 hexadecimal digits), got %q", repo.Name, repo.Ref)
		}
	}
}

func TestThePinnedRepositoriesAreTheOnesTheAppDoesNotUpdateByItself(t *testing.T) {
	pinned := PinnedSkillRepoNames([]FeaturedSkillRepo{
		{Name: "pinned", Ref: "a2824c67f8b4585c294a8101db9f9f0ad3c643f8"},
		{Name: "following"},
	})
	if !pinned["pinned"] || pinned["following"] || len(pinned) != 1 {
		t.Fatalf("only an entry with a Ref is pinned, got %v", pinned)
	}
}
