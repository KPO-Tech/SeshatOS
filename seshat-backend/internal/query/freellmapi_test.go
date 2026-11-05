package query

import (
	"context"
	"testing"
)

// The runtime does not know FreeLLMAPI: it is handed an OpenAI-compatible server at the address the person gave.
func TestFreeLLMAPIIsHandedToTheRuntimeAsOpenAIAtItsAddress(t *testing.T) {
	runtime := newTestSDKRuntime(t)

	cfg := runtime.buildClientConfig(context.Background(), RuntimeProviderConfig{Provider: "freellmapi", ModelID: "auto", Secret: "freellmapi-key", BaseURL: "http://127.0.0.1:3001/v1/"})
	if string(cfg.Model.Provider) != "openai" || cfg.Model.Model != "auto" {
		t.Fatalf("model = %+v", cfg.Model)
	}
	if cfg.ProviderConfig == nil || cfg.ProviderConfig.BaseURL != "http://127.0.0.1:3001/v1" || cfg.ProviderConfig.APIKey != "freellmapi-key" {
		t.Fatalf("provider config = %+v", cfg.ProviderConfig)
	}
}

func TestFreeLLMAPIWithoutAnAddressUsesTheOneOfItsDesktopApplication(t *testing.T) {
	runtime := newTestSDKRuntime(t)

	cfg := runtime.buildClientConfig(context.Background(), RuntimeProviderConfig{Provider: "freellmapi", ModelID: "auto", Secret: "k"})
	if cfg.ProviderConfig == nil || cfg.ProviderConfig.BaseURL != "http://127.0.0.1:31415/v1" {
		t.Fatalf("provider config = %+v", cfg.ProviderConfig)
	}
}

func TestAnotherProviderKeepsItsOwnName(t *testing.T) {
	runtime := newTestSDKRuntime(t)

	cfg := runtime.buildClientConfig(context.Background(), RuntimeProviderConfig{Provider: "anthropic", ModelID: "claude-3-5-sonnet-20241022", Secret: "k"})
	if string(cfg.Model.Provider) != "anthropic" {
		t.Fatalf("model = %+v", cfg.Model)
	}
}
