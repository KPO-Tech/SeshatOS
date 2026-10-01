// Package cloudidentity makes seshat-backend a real identity client of
// seshat-server's IAM in "connected" mode (see
// helps/seshat-architecture-target.md §2-4). It implements auth.Provider,
// the same interface auth.LocalProvider implements for standalone mode —
// selected once at bootstrap, never swapped at runtime.
package cloudidentity

import "time"

// AuthResult mirrors seshat-server's iam.AuthResult (Login/Bootstrap response).
type AuthResult struct {
	Token         string         `json:"token"`
	User          User           `json:"user"`
	Organizations []Organization `json:"organizations"`
	Memberships   []Membership   `json:"memberships"`
}

// User mirrors seshat-server's iam.User — only the fields this package uses.
type User struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	IsAdmin     bool   `json:"is_admin"`
}

// Organization mirrors seshat-server's iam.Organization.
type Organization struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

// Membership mirrors seshat-server's iam.Membership.
type Membership struct {
	ID             string `json:"id"`
	UserID         string `json:"user_id"`
	OrganizationID string `json:"organization_id"`
	Role           string `json:"role"`
}

// sessionInfo mirrors the redacted iam.Session embedded in GET /auth/me.
type sessionInfo struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

// meResponse mirrors GET /api/v1/auth/me.
type meResponse struct {
	User          User           `json:"user"`
	Memberships   []Membership   `json:"memberships"`
	Organizations []Organization `json:"organizations"`
	Session       sessionInfo    `json:"session"`
}

type listUsersResponse struct {
	Users []User `json:"users"`
	Total int64  `json:"total"`
}

type listOrganizationsResponse struct {
	Organizations []Organization `json:"organizations"`
}
