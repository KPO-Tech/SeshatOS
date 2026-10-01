package cloudidentity

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

// Freshness and grace windows for the principal cache — see
// helps/seshat-architecture-target.md §4.4: re-validate against the server
// every few minutes rather than every request, but tolerate a real network
// outage for a while before locking the user out of local chat/tools.
const (
	freshnessWindow = 5 * time.Minute
	graceWindow     = 48 * time.Hour
)

// Cache persists the last principal resolved from seshat-server, keyed by a
// hash of the session token (never the raw token). One row per active local
// session — see internal/db/remote_principal_cache.go.
type Cache struct {
	db *db.DB
}

func NewCache(database *db.DB) *Cache {
	return &Cache{db: database}
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// Get returns the cached principal for token and how long ago it was
// resolved. found is false if there is no cache entry at all.
func (c *Cache) Get(ctx context.Context, token string) (principal *auth.Principal, age time.Duration, found bool, err error) {
	raw, resolvedAtUnix, found, err := c.db.GetRemotePrincipalCache(ctx, hashToken(token))
	if err != nil || !found {
		return nil, 0, found, err
	}
	var p auth.Principal
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return nil, 0, false, nil // corrupt entry — treat as a cache miss, not a hard error
	}
	return &p, time.Since(time.Unix(resolvedAtUnix, 0)), true, nil
}

// Put stores/refreshes the cached principal for token.
func (c *Cache) Put(ctx context.Context, token string, principal *auth.Principal) error {
	raw, err := json.Marshal(principal)
	if err != nil {
		return err
	}
	now := time.Now()
	return c.db.UpsertRemotePrincipalCache(ctx, hashToken(token), string(raw), now.Unix(), principal.AuthSession.ExpiresAt.Unix())
}

// Delete removes the cached entry for token (e.g. on logout).
func (c *Cache) Delete(ctx context.Context, token string) error {
	return c.db.DeleteRemotePrincipalCache(ctx, hashToken(token))
}
