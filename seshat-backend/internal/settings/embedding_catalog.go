package settings

import "strings"

// EmbeddingModel is one embedding model of a hosted provider. Dimensions is what the model returns by default (0 when the provider's page
// does not say), shown to the person; the vectors are made with whatever the model returns.
type EmbeddingModel struct {
	ID         string
	Dimensions int
	// Note says what to know before choosing it, when there is something.
	Note string
}

// EmbeddingProfile is a hosted provider whose embeddings the Knowledge search can use through the OpenAI-shaped POST {BaseURL}/embeddings
// that the runtime's embedder sends. A provider that needs more in its request (NVIDIA's input_type, Cohere's input_type) is not here until
// the embedder can send it.
type EmbeddingProfile struct {
	ID          string
	DisplayName string
	BaseURL     string
	// Models lists the models the provider publishes for this use, from its own documentation (read 2026-10-30); the first is the default.
	Models []EmbeddingModel
}

var embeddingProfiles = []EmbeddingProfile{
	{
		ID: "openai", DisplayName: "OpenAI", BaseURL: "https://api.openai.com/v1",
		Models: []EmbeddingModel{
			{ID: "text-embedding-3-small", Dimensions: 1536},
			{ID: "text-embedding-3-large", Dimensions: 3072},
			{ID: "text-embedding-ada-002", Dimensions: 1536, Note: "previous generation"},
		},
	},
	{
		ID: "mistral", DisplayName: "Mistral", BaseURL: "https://api.mistral.ai/v1",
		Models: []EmbeddingModel{{ID: "mistral-embed", Dimensions: 1024}},
	},
	{
		ID: "gemini", DisplayName: "Google Gemini", BaseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
		Models: []EmbeddingModel{
			{ID: "gemini-embedding-001", Dimensions: 3072, Note: "text, 2,048 tokens"},
			{ID: "gemini-embedding-2", Dimensions: 3072, Note: "text, images, audio, video and PDF, 8,192 tokens; not tried on the OpenAI-compatible endpoint yet"},
		},
	},
	{
		ID: "voyage", DisplayName: "Voyage AI", BaseURL: "https://api.voyageai.com/v1",
		Models: []EmbeddingModel{
			{ID: "voyage-4", Dimensions: 1024},
			{ID: "voyage-4-large", Dimensions: 1024},
			{ID: "voyage-4-lite", Dimensions: 1024},
			{ID: "voyage-law-2", Dimensions: 1024, Note: "legal documents"},
			{ID: "voyage-finance-2", Dimensions: 1024, Note: "financial documents"},
		},
	},
	{
		ID: "jina", DisplayName: "Jina AI", BaseURL: "https://api.jina.ai/v1",
		Models: []EmbeddingModel{
			{ID: "jina-embeddings-v5-text-small", Dimensions: 1024},
			{ID: "jina-embeddings-v5-text-nano", Dimensions: 768},
			{ID: "jina-embeddings-v4", Dimensions: 2048},
			{ID: "jina-embeddings-v3", Dimensions: 1024},
		},
	},
}

// EmbeddingProfiles returns the hosted embedding providers this build knows.
func EmbeddingProfiles() []EmbeddingProfile {
	out := make([]EmbeddingProfile, len(embeddingProfiles))
	copy(out, embeddingProfiles)
	return out
}

// EmbeddingProfileFor returns the profile of a provider ID, case-insensitively.
func EmbeddingProfileFor(id string) (EmbeddingProfile, bool) {
	id = strings.ToLower(strings.TrimSpace(id))
	for _, profile := range embeddingProfiles {
		if profile.ID == id {
			return profile, true
		}
	}
	return EmbeddingProfile{}, false
}

// ModelIDs lists the ids of the models of a profile, in the order they are offered.
func (p EmbeddingProfile) ModelIDs() []string {
	ids := make([]string, 0, len(p.Models))
	for _, model := range p.Models {
		ids = append(ids, model.ID)
	}
	return ids
}
