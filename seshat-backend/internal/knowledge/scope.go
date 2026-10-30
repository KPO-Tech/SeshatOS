package knowledge

import (
	"context"
	"strings"
)

type scopeKey struct{}

// WithScope returns a context in which knowledge searches are limited to one corpus: the collection the person chose for the
// conversation. The limit is applied by the search tool itself, not asked of the model, so a model that passes another corpus_id, or none,
// still searches only this one. Whether the person may read the corpus is still decided by the backend on every search.
func WithScope(ctx context.Context, corpusID string) context.Context {
	corpusID = strings.TrimSpace(corpusID)
	if corpusID == "" {
		return ctx
	}
	return context.WithValue(ctx, scopeKey{}, corpusID)
}

// ScopeFromContext returns the corpus a search is limited to, or "" when it is not.
func ScopeFromContext(ctx context.Context) string {
	corpusID, _ := ctx.Value(scopeKey{}).(string)
	return corpusID
}
