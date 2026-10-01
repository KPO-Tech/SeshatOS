package cloudlongterm

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
	longterm "github.com/KPO-Tech/seshat/pkg/memory/longterm"
)

// Client is a thin, stateless HTTP client for seshat-server's
// /users/me/memory-graph endpoints — same convention as every other cloud*
// client: no fixed token, each call takes the caller's own session token
// explicitly. The SDK's longterm types (Entity/Graph/...) already carry the
// right JSON tags to decode these responses directly, no separate mirror
// DTOs needed.
type Client struct {
	serverURL  string
	httpClient *http.Client
}

func NewClient(serverURL string) *Client {
	return &Client{
		serverURL:  strings.TrimRight(strings.TrimSpace(serverURL), "/"),
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *Client) UpsertEntities(ctx context.Context, token string, inputs []longterm.EntityInput) ([]longterm.Entity, error) {
	var result struct {
		Entities []longterm.Entity `json:"entities"`
	}
	body := map[string]any{"entities": inputs}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.serverURL+"/api/v1/users/me/memory-graph/entities", token, body, &result); err != nil {
		return nil, err
	}
	return result.Entities, nil
}

func (c *Client) AddObservations(ctx context.Context, token string, inputs []longterm.ObservationInput) ([]longterm.ObservationResult, error) {
	var result struct {
		Results []longterm.ObservationResult `json:"results"`
	}
	body := map[string]any{"observations": inputs}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.serverURL+"/api/v1/users/me/memory-graph/observations", token, body, &result); err != nil {
		return nil, err
	}
	return result.Results, nil
}

func (c *Client) SearchNodes(ctx context.Context, token, query string) (*longterm.Graph, error) {
	q := url.Values{"query": {query}}
	var graph longterm.Graph
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/users/me/memory-graph/search?"+q.Encode(), token, nil, &graph); err != nil {
		return nil, err
	}
	return &graph, nil
}

func (c *Client) OpenNodes(ctx context.Context, token string, names []string) (*longterm.Graph, error) {
	var graph longterm.Graph
	body := map[string]any{"names": names}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodPost, c.serverURL+"/api/v1/users/me/memory-graph/open", token, body, &graph); err != nil {
		return nil, err
	}
	return &graph, nil
}

func (c *Client) RetrieveForContext(ctx context.Context, token, query string, maxTokens int) (string, error) {
	q := url.Values{"query": {query}, "max_tokens": {strconv.Itoa(maxTokens)}}
	var result struct {
		Context string `json:"context"`
	}
	if _, err := cloudhttp.Do(ctx, c.httpClient, http.MethodGet, c.serverURL+"/api/v1/users/me/memory-graph/context?"+q.Encode(), token, nil, &result); err != nil {
		return "", err
	}
	return result.Context, nil
}
