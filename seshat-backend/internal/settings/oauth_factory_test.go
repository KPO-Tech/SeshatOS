package settings

import (
	"os"
	"testing"
)

// TestDefaultOAuthClientFactoryWorksWithoutClientIDEnvVar is a regression
// test: NewClient used to hard-fail for "openai"/"codex" unless
// OPENAI_CLIENT_ID was set, even though oauth.DefaultOpenAIConfig already
// carries a working public ClientID for the OAuth device flow. The env var
// is meant to be an optional override for operators running their own
// registered OAuth app, not a requirement.
func TestDefaultOAuthClientFactoryWorksWithoutClientIDEnvVar(t *testing.T) {
	t.Setenv("OPENAI_CLIENT_ID", "")
	os.Unsetenv("OPENAI_CLIENT_ID")

	factory := defaultOAuthClientFactory{}
	for _, provider := range []string{"openai", "codex", "OpenAI", "CODEX"} {
		if _, err := factory.NewClient(provider); err != nil {
			t.Fatalf("NewClient(%q) with no OPENAI_CLIENT_ID set: unexpected error: %v", provider, err)
		}
	}
}

func TestDefaultOAuthClientFactoryRejectsUnknownProvider(t *testing.T) {
	factory := defaultOAuthClientFactory{}
	if _, err := factory.NewClient("anthropic"); err == nil {
		t.Fatal("expected an error for an unsupported OAuth provider")
	}
}
