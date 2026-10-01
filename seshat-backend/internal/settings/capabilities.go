package settings

import "strings"

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

// capableProviders lists, for each capability, which provider_settings.Provider
// type strings this app actually has integration code for on that capability
// today - deliberately not a speculative full matrix:
//   - image: internal/config/bootstrap.go's defaultImageGenerationConfig.
//     github.com/KPO-Tech/seshat/pkg/sdk's initImageGenerator has a real Go
//     client for exactly two vendors ("openai", "gemini") - a hard SDK
//     limit, not a config choice. Investigated adding z-ai (2026-08-13:
//     GLM-image's /images/generations request/response shape is close
//     enough to OpenAI's to reuse the SDK's openai client) but ruled it
//     out: the SDK's ensureOpenAIBaseURL always appends "/v1" to a BaseURL
//     that doesn't already end in it, so pointing the openai client at
//     Z.ai's real host (https://api.z.ai/api/paas/v4, no /v1 segment
//     anywhere in its API - confirmed via docs.z.ai and
//     seshat-ui/.../ProvidersView.tsx's own default URL for z-ai) produces
//     .../v4/v1/images/generations instead of the real
//     .../v4/images/generations - a 404, not a working integration. No
//     BaseURL value satisfies both "survives ensureOpenAIBaseURL unchanged"
//     and "matches Z.ai's real path" at once, and that function lives in
//     the external seshat module (no local replace directive, see
//     AGENTS.md) - not fixable from here. Also checked and ruled out for
//     the same "no compatible endpoint" reason: mistral (image gen only
//     via an agent tool-call flow, no direct REST images endpoint),
//     minimax (incompatible path/shape), kimi (no image API at all),
//     openrouter (incompatible path, inconsistent shape per underlying
//     model), stability ai (not in this app's provider catalog at all, and
//     its API is multipart/form-data rather than JSON - would need a whole
//     new image.Generation client, not a config-only fix).
//   - audio: defaultTextToSpeechConfig/defaultSpeechToTextConfig. The SDK's
//     initTextToSpeechGenerator/initSpeechToTextTranscriber switch on the
//     literal string "openai" only (default: nil) - unlike embeddings below,
//     there's no vendor-agnostic fallthrough, so a second vendor could only
//     be added by also passing Provider:"openai" with that vendor's own
//     BaseURL (protocol tag, not identity) - not done, because verification
//     (2026-08-13, WebSearch against live docs) found no other configured
//     provider type (mistral, z-ai, gemini, minimax, kimi) exposes an
//     OpenAI-schema-identical /audio/speech or /audio/transcriptions
//     endpoint. Revisit if that changes.
//   - embeddings: see embedderDefaultsByProvider below - unlike audio, this
//     one DOES have a generic fallthrough in the engine, so any wire-
//     compatible vendor just needs a correct BaseURL+Model, no SDK change.
var capableProviders = map[Capability]map[string]bool{
	CapabilityImage: {"openai": true, "gemini": true},
	CapabilityAudio: {"openai": true},
}

// EmbedderDefaults is what a compatible chat provider needs for Knowledge's
// embedder_config to work: github.com/KPO-Tech/seshat/internal/rag/embedder's
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
	if capability == CapabilityEmbeddings {
		_, ok := EmbedderDefaultsFor(providerType)
		return ok
	}
	return capableProviders[capability][strings.ToLower(strings.TrimSpace(providerType))]
}
