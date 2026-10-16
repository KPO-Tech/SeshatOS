package settings

import (
	"strings"
	"testing"

	audioproviders "github.com/KPO-Tech/seshat-runtime/pkg/audio/providers"
)

// The audio capability follows the runtime's own catalog. This test states
// that property against the catalog rather than repeating its provider list,
// so a provider added or removed upstream moves both together.
func TestSupportsCapabilityAudioFollowsRuntimeCatalog(t *testing.T) {
	profiles := audioproviders.Profiles()
	if len(profiles) == 0 {
		t.Fatal("expected the runtime's audio catalog to be non-empty")
	}

	for _, profile := range profiles {
		want := profile.STT != nil || profile.TTS != nil
		if got := SupportsCapability(profile.ID, CapabilityAudio); got != want {
			t.Fatalf("SupportsCapability(%q, audio) = %v, want %v", profile.ID, got, want)
		}
		if got := SupportsCapability(strings.ToUpper(profile.ID), CapabilityAudio); got != want {
			t.Fatalf("expected the audio capability lookup to be case-insensitive for %q", profile.ID)
		}
	}
}

// The regression this guards: audio used to be hardcoded to openai, so a
// user whose only configured provider was Groq, Mistral or ElevenLabs could
// not dictate.
func TestSupportsCapabilityAudioAcceptsEveryCatalogProvider(t *testing.T) {
	for _, provider := range []string{"openai", "groq", "mistral", "elevenlabs"} {
		if !SupportsCapability(provider, CapabilityAudio) {
			t.Fatalf("expected %s to support audio", provider)
		}
	}
	for _, provider := range []string{"ollama", "gemini", "z-ai"} {
		if SupportsCapability(provider, CapabilityAudio) {
			t.Fatalf("expected %s not to support audio: it is not in the audio catalog", provider)
		}
	}
}

func TestSupportsCapabilityUnchangedForImageAndEmbeddings(t *testing.T) {
	if !SupportsCapability("openai", CapabilityImage) || !SupportsCapability("gemini", CapabilityImage) {
		t.Fatal("expected openai and gemini to support image generation")
	}
	if SupportsCapability("groq", CapabilityImage) {
		t.Fatal("expected groq not to support image generation")
	}

	if !SupportsCapability("mistral", CapabilityEmbeddings) {
		t.Fatal("expected mistral to support embeddings")
	}
	if SupportsCapability("ollama", CapabilityEmbeddings) {
		t.Fatal("expected embeddings to follow embedderDefaultsByProvider")
	}
}
