package settings

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// FreeLLMAPI (github.com/tashfeenahmed/freellmapi) is a router that the person runs on this computer: one OpenAI-compatible address in
// front of the free tiers of many providers. The runtime does not know it, and does not have to: it is an OpenAI-compatible server, so it
// is stored under its own name (it has its own place in the list of providers and its own logo) and is handed to the runtime as "openai"
// with its address. Nothing of FreeLLMAPI is installed or started by SeshatOS.
const (
	FreeLLMAPIProvider = "freellmapi"
	// FreeLLMAPIDefaultBaseURL is where its desktop application listens. The server and the Docker image use port 3001.
	FreeLLMAPIDefaultBaseURL = "http://127.0.0.1:31415/v1"
	// FreeLLMAPIAutoModel is the model that lets the router choose the best free model that can answer.
	FreeLLMAPIAutoModel = "auto"
)

// IsFreeLLMAPI reports whether the provider is FreeLLMAPI, under any spelling the user or an older client used.
func IsFreeLLMAPI(provider string) bool {
	return CanonicalProvider(provider) == FreeLLMAPIProvider
}

// RuntimeProvider is the name the runtime knows for a provider the user set up: FreeLLMAPI is an OpenAI-compatible server for it.
func RuntimeProvider(provider string) string {
	if IsFreeLLMAPI(provider) {
		return "openai"
	}
	return CanonicalProvider(provider)
}

// EffectiveBaseURL is the address to call for a provider: the one the user gave, else the default of FreeLLMAPI, else "" (the runtime
// knows the address of its own providers).
func EffectiveBaseURL(provider, baseURL string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" && IsFreeLLMAPI(provider) {
		return FreeLLMAPIDefaultBaseURL
	}
	return baseURL
}

// FreeLLMAPIModel is a model of the router, with what it says about it.
type FreeLLMAPIModel struct {
	ID            string
	Name          string
	ContextWindow int
}

// FetchFreeLLMAPIModels lists the models the router can serve right now. Without the filter it answers with its whole catalogue (hundreds
// of models, most of them waiting for a key that was not given), so the list is asked with ?available=true and the models it still flags
// as unavailable are left out. "auto" comes first: it is the model that lets the router choose.
func FetchFreeLLMAPIModels(ctx context.Context, client *http.Client, baseURL, apiKey string) ([]FreeLLMAPIModel, error) {
	baseURL = EffectiveBaseURL(FreeLLMAPIProvider, baseURL)
	if _, err := url.Parse(baseURL); err != nil {
		return nil, fmt.Errorf("the address of FreeLLMAPI is not valid")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/models?available=true", nil)
	if err != nil {
		return nil, fmt.Errorf("the address of FreeLLMAPI is not valid")
	}
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("FreeLLMAPI does not answer at %s: is it running?", baseURL)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("FreeLLMAPI refused the key: copy the unified key from its dashboard")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("FreeLLMAPI answered with status %d", resp.StatusCode)
	}
	var body struct {
		Data []struct {
			ID            string `json:"id"`
			Name          string `json:"name"`
			ContextWindow *int   `json:"context_window"`
			Available     *bool  `json:"available"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("FreeLLMAPI answered with something that is not a list of models")
	}
	models := make([]FreeLLMAPIModel, 0, len(body.Data))
	for _, entry := range body.Data {
		if strings.TrimSpace(entry.ID) == "" || (entry.Available != nil && !*entry.Available) {
			continue
		}
		model := FreeLLMAPIModel{ID: entry.ID, Name: entry.Name}
		if entry.ContextWindow != nil {
			model.ContextWindow = *entry.ContextWindow
		}
		if entry.ID == FreeLLMAPIAutoModel {
			models = append([]FreeLLMAPIModel{model}, models...)
		} else {
			models = append(models, model)
		}
	}
	return models, nil
}
