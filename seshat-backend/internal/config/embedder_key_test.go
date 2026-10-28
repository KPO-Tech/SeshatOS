package config

import "testing"

func TestTheLinkedKeyIsOnlyUsedByTheProviderItBelongsTo(t *testing.T) {
	cases := []struct {
		name                  string
		saved, embedder       string
		linkedKind, linkedKey string
		linked                bool
		want                  string
	}{
		{"a link to the same provider wins", "own", "mistral", "mistral", "linked", true, "linked"},
		{"a link left for another provider is not used", "own", "openrouter", "mistral", "linked", true, "own"},
		{"no link keeps the saved key", "own", "openrouter", "", "", false, "own"},
		{"google is gemini", "own", "gemini", "google", "linked", true, "linked"},
		{"kinds compare without case", "own", "OpenRouter", "openrouter", "linked", true, "linked"},
	}
	for _, c := range cases {
		if got := embedderAPIKey(c.saved, c.embedder, c.linkedKind, c.linkedKey, c.linked); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}
