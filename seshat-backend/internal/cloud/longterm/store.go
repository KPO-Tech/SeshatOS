// Package cloudlongterm makes seshat-backend's long-term memory graph a
// real client of seshat-server in "connected" mode. RemoteStore implements
// the SDK's longterm.Store interface — the same interface
// *db.LongTermMemoryStore implements for standalone mode — so swapping one
// for the other in internal/memories.Service is a one-line change.
//
// The server-side implementation (seshat-server's internal/server/longtermmemory)
// deliberately reproduces the exact same case-insensitive substring search
// the local store already does — this is a storage location change, not a
// new relevance/retrieval design.
package cloudlongterm

import (
	"context"

	longterm "github.com/KPO-Tech/seshat/pkg/memory/longterm"
)

// RemoteStore implements longterm.Store against a remote seshat-server.
// Every method reads its caller's bearer token from ctx (see
// ContextWithToken) rather than a field on the struct — a single
// seshat-backend process can serve multiple local users concurrently, so
// the token must travel with each request, not live in shared state.
type RemoteStore struct {
	client *Client
}

func NewRemoteStore(serverURL string) *RemoteStore {
	return &RemoteStore{client: NewClient(serverURL)}
}

var _ longterm.Store = (*RemoteStore)(nil)

func (s *RemoteStore) UpsertEntities(ctx context.Context, userID string, inputs []longterm.EntityInput) ([]longterm.Entity, error) {
	return s.client.UpsertEntities(ctx, tokenFromContext(ctx), inputs)
}

func (s *RemoteStore) AddObservations(ctx context.Context, userID string, inputs []longterm.ObservationInput) ([]longterm.ObservationResult, error) {
	return s.client.AddObservations(ctx, tokenFromContext(ctx), inputs)
}

func (s *RemoteStore) SearchNodes(ctx context.Context, userID, query string) (*longterm.Graph, error) {
	return s.client.SearchNodes(ctx, tokenFromContext(ctx), query)
}

func (s *RemoteStore) OpenNodes(ctx context.Context, userID string, names []string) (*longterm.Graph, error) {
	return s.client.OpenNodes(ctx, tokenFromContext(ctx), names)
}

func (s *RemoteStore) RetrieveForContext(ctx context.Context, userID, query string, maxTokens int) (string, error) {
	return s.client.RetrieveForContext(ctx, tokenFromContext(ctx), query, maxTokens)
}
