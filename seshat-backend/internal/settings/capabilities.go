package settings

import (
	"strings"

	audioproviders "github.com/KPO-Tech/seshat-runtime/pkg/audio/providers"
	"github.com/KPO-Tech/seshat-runtime/pkg/sdk"
)

// Capability is a non-chat feature whose credential can be reused from an
// already-configured chat provider (see internal/db/capability_links.go).
// Every provider type implicitly supports "chat" - that's not modeled here.
type Capability string

const (
	CapabilityImage      Capability = "image"
	CapabilityAudio      Capability = "audio"
	CapabilityEmbeddings Capability = "embeddings"
)

func (c Capability) Valid() bool {
	switch c {
	case CapabilityImage, CapabilityAudio, CapabilityEmbeddings:
		return true
	default:
		return false
	}
}

// Which provider_settings.Provider types can serve each non-chat capability, as SupportsCapability answers it, never as a list kept here:
//   - image: the runtime's image catalog (sdk.ImageProviders: OpenAI, Gemini and OpenRouter), the same one initImageGenerator dispatches
//     on, so a provider added there works here without a change in this repo. A provider outside it was checked once and does not fit
//     (Z.ai: its real path has no /v1 segment; Mistral: images only through an agent flow; MiniMax: another shape; Stability: multipart).
//   - audio: defaultTextToSpeechConfig/defaultSpeechToTextConfig. Which
//     provider types can serve audio is no longer a list this file owns: the
//     runtime ships the catalog it dispatches on
//     (github.com/KPO-Tech/seshat-runtime/pkg/audio/providers - OpenAI,
//     Groq, Mistral and ElevenLabs) and builds the right client per profile,
//     an OpenAI-compatible one for the first three and its own ElevenLabs
//     client for the last (pkg/sdk's initSpeechToTextTranscriber and
//     initTextToSpeechGenerator). SupportsCapability asks that catalog
//     instead of repeating it, so a provider added there works here without
//     a change in this repo. This bullet previously read {"openai": true}
//     with a note that the SDK knew only the literal string "openai"; that
//     stopped being true when the catalog landed (v1.8.0), and the note is
//     what kept the restriction alive after its reason was gone.
//   - embeddings: see embedderDefaultsByProvider below - unlike audio, this
//     one DOES have a generic fallthrough in the engine, so any wire-
//     compatible vendor just needs a correct BaseURL+Model, no SDK change.

// EmbedderDefaults is what a compatible chat provider needs for Knowledge's
// embedder_config to work: github.com/KPO-Tech/seshat-runtime/internal/rag/embedder's
// dispatch is `switch provider { case "ollama": ...; default: openai-schema
// POST {baseURL}/embeddings }` - i.e. anything other than the literal
// "ollama" is treated as OpenAI-schema. So any vendor whose /embeddings
// endpoint actually matches OpenAI's request/response shape byte-for-byte
// works here with just the right BaseURL+Model - no dedicated Go client
// needed, unlike image/audio above.
type EmbedderDefaults struct {
	BaseURL string
	Model   string
}

// embedderDefaultsByProvider - verified against live API docs 2026-08-13
// (mirrors seshat-server's provider_embedder_link.go, which independently
// arrived at the same two - openai, mistral - plus gemini here since its
// /v1beta/openai compatibility layer covers embeddings too):
//   - openai: platform.openai.com/docs - the reference shape.
//   - mistral: docs.mistral.ai/api/endpoint/embeddings - confirmed
//     request {model,input} / response {data:[{object,embedding,index}]}
//     match exactly.
//   - gemini: ai.google.dev/gemini-api/docs/openai - the OpenAI-compat
//     layer's /embeddings endpoint, standard shape.
//   - explicitly NOT included after checking: z-ai (no embeddings endpoint
//     at all on the international api.z.ai platform - only exists on the
//     separate China-only bigmodel.cn deployment), minimax (embeddings
//     explicitly excluded from its OpenAI-compatible surface per its own
//     docs), kimi/moonshot (no embeddings endpoint found). openrouter is
//     technically OpenAI-shaped but proxies many underlying providers with
//     inconsistent dimensions/availability - deliberately excluded from
//     auto-configuration; a user can still set it up by hand in Knowledge
//     settings' "Custom" option.
var embedderDefaultsByProvider = map[string]EmbedderDefaults{
	"openai":  {BaseURL: "https://api.openai.com/v1", Model: "text-embedding-3-small"},
	"mistral": {BaseURL: "https://api.mistral.ai/v1", Model: "mistral-embed"},
	"gemini":  {BaseURL: "https://generativelanguage.googleapis.com/v1beta/openai", Model: "gemini-embedding-001"},
}

// EmbedderDefaultsFor returns the BaseURL/Model to use when a chat
// provider's key is reused for Knowledge embeddings, if that provider type
// is a verified match - see embedderDefaultsByProvider.
func EmbedderDefaultsFor(providerType string) (EmbedderDefaults, bool) {
	d, ok := embedderDefaultsByProvider[strings.ToLower(strings.TrimSpace(providerType))]
	return d, ok
}

// SupportsCapability reports whether a configured provider's type is known
// to support reuse for the given non-chat capability.
func SupportsCapability(providerType string, capability Capability) bool {
	switch capability {
	case CapabilityEmbeddings:
		_, ok := EmbedderDefaultsFor(providerType)
		return ok
	case CapabilityAudio:
		// The runtime's audio catalog is the single source of truth for
		// which provider types speak speech-to-text or text-to-speech -
		// see the audio bullet above.
		profile, ok := audioproviders.ProfileFor(providerType)
		return ok && (profile.STT != nil || profile.TTS != nil)
	case CapabilityImage:
		// The runtime's image catalog says which providers draw images, as the audio one does for speech.
		id := strings.ToLower(strings.TrimSpace(providerType))
		for _, provider := range sdk.ImageProviders() {
			if provider.ID == id {
				return true
			}
		}
		return false
	default:
		return false
	}
}
