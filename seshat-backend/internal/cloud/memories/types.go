// Package cloudmemories makes seshat-backend a real flat-memory-list client
// of seshat-server in "connected" mode. It implements memories.Provider, the
// same interface memories.LocalProvider implements for standalone mode.
// Unlike provider settings, there is no org/platform hierarchy here —
// memories are strictly personal, so "connected" simply means "stored on
// the server instead of locally" (see helps/seshat-architecture-target.md §3).
package cloudmemories

import "time"

// remoteMemory mirrors seshat-server's memories.UserMemory.
type remoteMemory struct {
	ID         string    `json:"id"`
	UserID     string    `json:"user_id"`
	Type       string    `json:"type"`
	Key        string    `json:"key"`
	Value      string    `json:"value"`
	Importance float64   `json:"importance"`
	Source     string    `json:"source,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type listResponse struct {
	Memories []remoteMemory `json:"memories"`
}

type createRequest struct {
	Type       string  `json:"type"`
	Key        string  `json:"key"`
	Value      string  `json:"value"`
	Importance float64 `json:"importance"`
	Source     string  `json:"source"`
}

type updateRequest struct {
	Type       *string  `json:"type,omitempty"`
	Key        *string  `json:"key,omitempty"`
	Value      *string  `json:"value,omitempty"`
	Importance *float64 `json:"importance,omitempty"`
	Source     *string  `json:"source,omitempty"`
}

type deleteAllResponse struct {
	Deleted int64 `json:"deleted"`
}
