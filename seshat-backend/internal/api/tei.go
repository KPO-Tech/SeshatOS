package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// teiInfo mirrors the one field of TEI's GET /info response this package
// needs - the real response carries many more (max_input_length,
// docker_label, model_dtype, ...) that nothing here reads.
type teiInfo struct {
	ModelID string `json:"model_id"`
}

// teiInfoURL derives a TEI server's /info endpoint from whatever route- or
// provider-shaped base_url a Settings card actually stores: the Embedding
// card's is an OpenAI-compatible ".../v1" base, the Reranker card's is the
// full ".../rerank" endpoint - /info always lives at the bare server root
// regardless of which route the caller talks to for real requests.
func teiInfoURL(baseURL string) string {
	u := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	for _, suffix := range []string{"/v1", "/rerank", "/embed"} {
		u = strings.TrimSuffix(u, suffix)
	}
	return u + "/info"
}

// detectTEIModel probes baseURL's TEI /info endpoint and returns the
// model_id it reports. A fast, harmless GET either way - a non-TEI server
// (or any other failure) just surfaces as an error here rather than a
// false-positive detection, the same "stateless probe" contract as the
// existing Ollama detect-models path.
func detectTEIModel(ctx context.Context, baseURL string) (string, error) {
	if strings.TrimSpace(baseURL) == "" {
		return "", fmt.Errorf("base_url is required")
	}
	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, teiInfoURL(baseURL), nil)
	if err != nil {
		return "", fmt.Errorf("invalid base_url: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("TEI /info returned %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("read TEI /info response: %w", err)
	}
	var info teiInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return "", fmt.Errorf("parse TEI /info response: %w", err)
	}
	if info.ModelID == "" {
		return "", fmt.Errorf("no model_id in TEI /info response")
	}
	return info.ModelID, nil
}
