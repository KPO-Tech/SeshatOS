package knowledge

import (
	"context"
	"errors"
	"sync"
)

// ErrNoEmbedder is what embedding says while no embedding model is set up.
var ErrNoEmbedder = errors.New("no embedding model is set up: choose one in Config > Search")

// Embedder turns texts into vectors, one per text and in the same order.
type Embedder interface {
	EmbedTexts(ctx context.Context, texts []string) ([][]float32, error)
}

// LiveEmbedder is the embedder the app hands to everything that embeds, and it can be replaced while the app runs: changing the
// model in Config > Search takes effect at once, for indexing and for the questions of a search, with no restart. Until a model is
// set it fails with ErrNoEmbedder, which a search answers by looking for words only.
type LiveEmbedder struct {
	mu    sync.RWMutex
	inner Embedder
	key   string
}

// Set replaces the model in use. The key names it (provider, endpoint and model), so that what was embedded with it can be told apart
// from what was embedded with another. A nil embedder unsets the model.
func (l *LiveEmbedder) Set(inner Embedder, key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.inner, l.key = inner, key
}

// Key names the model in use, or is empty when none is set.
func (l *LiveEmbedder) Key() string {
	if l == nil {
		return ""
	}
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.key
}

func (l *LiveEmbedder) EmbedTexts(ctx context.Context, texts []string) ([][]float32, error) {
	l.mu.RLock()
	inner := l.inner
	l.mu.RUnlock()
	if inner == nil {
		return nil, ErrNoEmbedder
	}
	return inner.EmbedTexts(ctx, texts)
}
