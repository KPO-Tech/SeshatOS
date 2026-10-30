package settings

import "testing"

func TestEmbeddingProfilesAreUsable(t *testing.T) {
	seen := map[string]bool{}
	for _, profile := range EmbeddingProfiles() {
		if profile.ID == "" || profile.DisplayName == "" || len(profile.Models) == 0 {
			t.Errorf("profile %+v is incomplete", profile)
		}
		if seen[profile.ID] {
			t.Errorf("provider %q is listed twice", profile.ID)
		}
		seen[profile.ID] = true
		if len(profile.BaseURL) < 9 || profile.BaseURL[:8] != "https://" || profile.BaseURL[len(profile.BaseURL)-1] == '/' {
			t.Errorf("%s: base URL %q must be https and have no trailing slash", profile.ID, profile.BaseURL)
		}
		ids := map[string]bool{}
		for _, model := range profile.Models {
			if model.ID == "" || ids[model.ID] {
				t.Errorf("%s: model %q is empty or listed twice", profile.ID, model.ID)
			}
			ids[model.ID] = true
		}
	}
}

func TestEmbeddingProfileForAgreesWithTheDefaultsOfAChatProvider(t *testing.T) {
	// A chat provider whose key is reused for embeddings starts on the first model of its profile.
	for provider, defaults := range embedderDefaultsByProvider {
		profile, ok := EmbeddingProfileFor(provider)
		if !ok {
			t.Errorf("%s has embedding defaults but no profile", provider)
			continue
		}
		if profile.BaseURL != defaults.BaseURL {
			t.Errorf("%s: profile URL %q differs from the defaults %q", provider, profile.BaseURL, defaults.BaseURL)
		}
		if profile.Models[0].ID != defaults.Model {
			t.Errorf("%s: first model %q differs from the default %q", provider, profile.Models[0].ID, defaults.Model)
		}
	}
	if _, ok := EmbeddingProfileFor(" Voyage "); !ok {
		t.Error("the lookup ignores case and spaces")
	}
}
