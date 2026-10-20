package settings

import "testing"

func TestCanonicalProviderMapsFormerBuiltInNames(t *testing.T) {
	for in, want := range map[string]string{
		"workers-ai":  "cloudflare-workers-ai",
		" Workers-AI": "cloudflare-workers-ai",
		"workers_ai":  "cloudflare-workers-ai",
		"cloudflare":  "cloudflare-workers-ai",
		"Anthropic":   "anthropic",
		"my-llm":      "my-llm",
		"":            "",
	} {
		if got := CanonicalProvider(in); got != want {
			t.Errorf("CanonicalProvider(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestCatalogListsMainProvidersFirstThenTheSortedCatalog(t *testing.T) {
	entries := Catalog()
	seenMore := false
	for _, e := range entries {
		if e.Main && seenMore {
			t.Fatalf("main provider %s comes after the catalog ones", e.ID)
		}
		if !e.Main {
			seenMore = true
		}
	}
	if !seenMore || entries[0].ID == "" || !entries[0].Main {
		t.Fatalf("unexpected list start: %+v", entries[0])
	}
}

func TestVerifiedCatalogProvidersAreRecognised(t *testing.T) {
	for _, name := range []string{"groq", "togetherai", "fireworks-ai", "Workers-AI"} {
		if !IsVerifiedCatalogProvider(name) {
			t.Errorf("%s should be a verified catalog provider", name)
		}
	}
	for _, name := range []string{"anthropic", "my-llm", ""} {
		if IsVerifiedCatalogProvider(name) {
			t.Errorf("%q must not be taken for a catalog provider", name)
		}
	}
	if IsUnverifiedCatalogProvider("groq") {
		t.Error("an embedded provider is verified")
	}
}
