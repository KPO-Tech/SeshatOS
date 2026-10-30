package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
)

func embeddingModelsOf(t *testing.T, provider string) []string {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/settings/embedder/detect-models", strings.NewReader(`{"provider":"`+provider+`","base_url":"https://example.com/v1"}`))
	recorder := httptest.NewRecorder()
	(&App{}).handleEmbedderDetectModels(recorder, request, nil)
	if recorder.Code != http.StatusOK {
		t.Fatalf("%s: %d %s", provider, recorder.Code, recorder.Body.String())
	}
	var body struct {
		Models []string `json:"embedding_models"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body.Models
}

// Each hosted provider is offered its own models: Gemini used to be offered OpenAI's.
func TestEmbedderDetectModelsAnswersWithTheModelsOfTheProvider(t *testing.T) {
	cases := map[string]string{
		"gemini":  "gemini-embedding-001",
		"voyage":  "voyage-4",
		"jina":    "jina-embeddings-v5-text-small",
		"mistral": "mistral-embed",
		"openai":  "text-embedding-3-small",
	}
	for provider, want := range cases {
		models := embeddingModelsOf(t, provider)
		if !slices.Contains(models, want) {
			t.Errorf("%s: %q missing from %v", provider, want, models)
		}
		if provider != "openai" && slices.Contains(models, "text-embedding-3-small") {
			t.Errorf("%s was offered an OpenAI model: %v", provider, models)
		}
	}
}
