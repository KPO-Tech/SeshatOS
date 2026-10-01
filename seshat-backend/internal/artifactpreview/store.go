// Package artifactpreview holds short-lived, self-contained HTML documents
// (agent-written artifacts - see write_file's .html detection in the UI) so
// they can be served to a sandboxed <iframe> for a live preview.
//
// This is deliberately NOT served via the file's own content or a
// data:/srcdoc URL: an iframe loaded that way inherits the main app's own
// CSP (script-src 'self' etc.), which would silently block any inline
// <script> in the agent-generated HTML - the whole point of the preview.
// Serving it from this store's own HTTP endpoint (see internal/api) lets
// that one response carry its own, separately scoped CSP header instead,
// while the rest of the app keeps its strict one untouched. The iframe
// element itself still uses sandbox="allow-scripts" (no allow-same-origin),
// so even with a permissive CSP the preview can never reach the parent
// window, IPC bridge, or filesystem.
package artifactpreview

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
	"time"
)

const (
	// TTL is how long a preview stays servable after being created. Long
	// enough to survive a user reading it slowly, short enough that a
	// long-running app doesn't accumulate an unbounded number of entries
	// from a chatty session.
	TTL = 30 * time.Minute
	// MaxHTMLBytes caps a single artifact - generous for a self-contained
	// single-file demo/tool, not meant for large embedded assets (which
	// should be data: URIs the caller already sized-checked, or just
	// aren't a good fit for this feature).
	MaxHTMLBytes = 2 << 20 // 2 MiB
)

type entry struct {
	html      string
	expiresAt time.Time
}

// Store is an in-memory, process-lifetime cache of preview HTML keyed by an
// unguessable ID. Not persisted - previews don't need to survive a restart.
type Store struct {
	mu      sync.Mutex
	entries map[string]entry
}

func NewStore() *Store {
	return &Store{entries: make(map[string]entry)}
}

// Put stores html and returns a fresh capability ID for it.
func (s *Store) Put(html string) (string, error) {
	if len(html) > MaxHTMLBytes {
		return "", fmt.Errorf("artifact exceeds %d bytes", MaxHTMLBytes)
	}
	id, err := randomID()
	if err != nil {
		return "", fmt.Errorf("generate artifact id: %w", err)
	}
	s.mu.Lock()
	s.entries[id] = entry{html: html, expiresAt: time.Now().Add(TTL)}
	s.mu.Unlock()
	return id, nil
}

// Get returns the stored HTML for id, if it exists and hasn't expired.
func (s *Store) Get(id string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.entries[id]
	if !ok {
		return "", false
	}
	if time.Now().After(e.expiresAt) {
		delete(s.entries, id)
		return "", false
	}
	return e.html, true
}

// Sweep removes expired entries. Intended to be called periodically (see
// bootstrap.go) - Get already self-cleans on access, this only matters for
// entries nobody ever re-requests.
func (s *Store) Sweep() {
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, e := range s.entries {
		if now.After(e.expiresAt) {
			delete(s.entries, id)
		}
	}
}

func randomID() (string, error) {
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
