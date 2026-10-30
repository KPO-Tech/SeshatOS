package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestTheModelsOfOpenRouterAreReadFromItsPublicListing(t *testing.T) {
	var asked []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asked = append(asked, r.URL.RequestURI())
		_, _ = w.Write([]byte(`{"data":[{"id":"openai/text-embedding-3-small"},{"id":""},{"id":"qwen/qwen3-embedding-8b"}]}`))
	}))
	defer server.Close()
	previous := openRouterAPI
	openRouterAPI = server.URL
	t.Cleanup(func() { openRouterAPI = previous })

	embedding, err := openRouterEmbeddingModels(context.Background())
	require.NoError(t, err)
	require.Equal(t, []string{"openai/text-embedding-3-small", "qwen/qwen3-embedding-8b"}, embedding, "an entry with no id is left out")

	_, err = openRouterRerankModels(context.Background())
	require.NoError(t, err)
	require.Equal(t, []string{"/embeddings/models", "/models?output_modalities=rerank"}, asked)
}

func TestTheRerankModelsOfAProviderFallBackToTheCatalogWhenItsListCannotBeRead(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { http.Error(w, "down", http.StatusBadGateway) }))
	defer server.Close()
	previous := openRouterAPI
	openRouterAPI = server.URL
	t.Cleanup(func() { openRouterAPI = previous })

	ask := func(provider string) (models []string, message any) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/settings/reranker/list-models", strings.NewReader(`{"provider":"`+provider+`"}`))
		(&App{}).handleRerankerListModels(recorder, request)
		var body struct {
			Models []string `json:"models"`
			Error  any      `json:"error"`
		}
		require.NoError(t, json.NewDecoder(recorder.Body).Decode(&body))
		return body.Models, body.Error
	}

	models, message := ask("openrouter")
	require.Contains(t, models, "cohere/rerank-v3.5", "the models the runtime knows are still offered")
	require.NotNil(t, message, "and the person is told why the list is not the live one")

	models, message = ask("cohere")
	require.Contains(t, models, "rerank-v3.5")
	require.Nil(t, message)

	models, _ = ask("nobody")
	require.Empty(t, models)
}

func TestTheShapeOfARerankRequestFollowsTheServiceTheEndpointBelongsTo(t *testing.T) {
	require.Equal(t, "cohere", rerankStyleFor("https://openrouter.ai/api/v1/rerank"))
	require.Equal(t, "cohere", rerankStyleFor("https://api.cohere.com/v2/rerank"))
	require.Equal(t, "cohere", rerankStyleFor("https://api.jina.ai/v1/rerank"))
	require.Equal(t, "voyage", rerankStyleFor("https://api.voyageai.com/v1/rerank"))
	require.Equal(t, "", rerankStyleFor("http://localhost:8083/rerank"), "a local server gets the fields of every known server")
}
