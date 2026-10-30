package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/seshat-runtime/pkg/rag/reranker"
)

// openRouterAPI is where the models OpenRouter offers for embedding and reranking are listed: public pages, no key needed. A variable so
// that a test can point it at a local server.
var openRouterAPI = "https://openrouter.ai/api/v1"

// fetchOpenRouterModels reads the ids of the models a public OpenRouter listing returns.
func fetchOpenRouterModels(ctx context.Context, path string) ([]string, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, openRouterAPI+path, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("OpenRouter answered %d", resp.StatusCode)
	}
	var body struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&body); err != nil {
		return nil, fmt.Errorf("OpenRouter sent a list that could not be read: %w", err)
	}
	ids := make([]string, 0, len(body.Data))
	for _, item := range body.Data {
		if item.ID != "" {
			ids = append(ids, item.ID)
		}
	}
	return ids, nil
}

func openRouterEmbeddingModels(ctx context.Context) ([]string, error) {
	return fetchOpenRouterModels(ctx, "/embeddings/models")
}

func openRouterRerankModels(ctx context.Context) ([]string, error) {
	return fetchOpenRouterModels(ctx, "/models?"+url.Values{"output_modalities": {"rerank"}}.Encode())
}

// providerKeyFor returns the API key of one of the person's own providers (the ones of Config > Providers), so that the embedding and
// reranking models of the same company do not need the key typed a second time. A provider that is not theirs gives nothing.
func (a *App) providerKeyFor(ctx context.Context, principal *backendauth.Principal, settingID string) (string, error) {
	settingID = strings.TrimSpace(settingID)
	if settingID == "" {
		return "", nil
	}
	if a.providerSettingStore == nil {
		return "", bkerr.Unavailable("provider settings are not available", nil)
	}
	setting, err := a.providerSettingStore.GetByID(ctx, settingID)
	if err != nil || principal == nil || setting.UserID != principal.User.ID {
		return "", bkerr.NotFound("that provider was not found", err)
	}
	key, err := a.providerSettingStore.GetDecryptedAPIKey(ctx, settingID)
	if err != nil {
		return "", bkerr.Internal("the key of that provider could not be read", err)
	}
	return key, nil
}

// rerankStyleFor is the request shape a rerank endpoint expects, from where it is: the hosted services with a strict schema get exactly
// their own fields, anything else (a local TEI or vLLM server) gets the fields of every known server.
func rerankStyleFor(baseURL string) string {
	host := strings.ToLower(baseURL)
	switch {
	case strings.Contains(host, "openrouter.ai"), strings.Contains(host, "api.cohere.com"), strings.Contains(host, "api.jina.ai"):
		return "cohere"
	case strings.Contains(host, "voyageai.com"):
		return "voyage"
	}
	return ""
}

// handleRerankerListModels handles POST /settings/reranker/list-models: the rerank models of a hosted provider (OpenRouter's from its
// public listing, the others from the catalog of the runtime).
func (a *App) handleRerankerListModels(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Provider string `json:"provider"`
	}
	if !decodeOptionalJSONBody(w, r, &body) {
		return
	}
	provider := strings.ToLower(strings.TrimSpace(body.Provider))

	var fromCatalog []string
	for _, profile := range reranker.Profiles() {
		if profile.ID == provider {
			fromCatalog = profile.Models
		}
	}
	if provider == "openrouter" {
		models, err := openRouterRerankModels(r.Context())
		if err != nil || len(models) == 0 {
			// The listing could not be read: the models the runtime knows are still offered.
			message := "the list of OpenRouter could not be read: the models known to this version are offered"
			if err != nil {
				message += " (" + err.Error() + ")"
			}
			writeJSON(w, http.StatusOK, map[string]any{"models": fromCatalog, "error": message})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"models": models, "error": nil})
		return
	}
	if fromCatalog == nil {
		fromCatalog = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"models": fromCatalog, "error": nil})
}
