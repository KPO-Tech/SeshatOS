package db

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

const (
	AuthSessionStatusActive  = "active"
	AuthSessionStatusRevoked = "revoked"
)

// ─── Public types ─────────────────────────────────────────────────────────────

type AuthSession struct {
	ID         string
	UserID     string
	TokenHash  string
	Status     string
	ExpiresAt  time.Time
	LastUsedAt *time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
	Metadata   map[string]any
}

type CreateAuthSessionParams struct {
	UserID         string
	PlaintextToken string
	ExpiresAt      time.Time
	Metadata       map[string]any
}

type AuthPrincipal struct {
	User                 *User
	AuthSession          *AuthSession
	Roles                []Role
	WorkspaceMemberships []WorkspaceMembership
}

// ─── GORM private model ───────────────────────────────────────────────────────

type gAuthSession struct {
	ID             string `gorm:"primaryKey;size:64"`
	UserID         string `gorm:"column:user_id;size:64;not null"`
	TokenHash      string `gorm:"column:token_hash;uniqueIndex;size:191;not null"`
	Status         string `gorm:"not null"`
	ExpiresAtUnix  int64  `gorm:"column:expires_at_unix;not null"`
	LastUsedAtUnix *int64 `gorm:"column:last_used_at_unix"`
	CreatedAtUnix  int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix  int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
	MetadataJSON   string `gorm:"column:metadata_json;not null;default:'{}'"`
}

func (gAuthSession) TableName() string { return "auth_sessions" }

func authSessionFromGorm(g gAuthSession) (*AuthSession, error) {
	metadata, err := unmarshalJSONMap(g.MetadataJSON)
	if err != nil {
		return nil, fmt.Errorf("unmarshal auth session metadata: %w", err)
	}
	s := &AuthSession{
		ID:        g.ID,
		UserID:    g.UserID,
		TokenHash: g.TokenHash,
		Status:    g.Status,
		ExpiresAt: time.Unix(g.ExpiresAtUnix, 0).UTC(),
		CreatedAt: time.Unix(g.CreatedAtUnix, 0).UTC(),
		UpdatedAt: time.Unix(g.UpdatedAtUnix, 0).UTC(),
		Metadata:  metadata,
	}
	if g.LastUsedAtUnix != nil {
		t := time.Unix(*g.LastUsedAtUnix, 0).UTC()
		s.LastUsedAt = &t
	}
	return s, nil
}

// ─── Methods on IdentityStore ─────────────────────────────────────────────────

func (s *IdentityStore) CreateAuthSession(ctx context.Context, params CreateAuthSessionParams) (*AuthSession, error) {
	if strings.TrimSpace(params.UserID) == "" {
		return nil, fmt.Errorf("user id is required")
	}
	if params.PlaintextToken == "" {
		return nil, fmt.Errorf("plaintext token is required")
	}
	if params.ExpiresAt.IsZero() {
		return nil, fmt.Errorf("expires at is required")
	}
	metadata, err := normalizeJSONMap(params.Metadata)
	if err != nil {
		return nil, fmt.Errorf("normalize auth session metadata: %w", err)
	}
	metadataJSON, err := marshalJSONMap(metadata)
	if err != nil {
		return nil, fmt.Errorf("marshal auth session metadata: %w", err)
	}
	now := time.Now().UTC()
	row := gAuthSession{
		ID:            newIdentityID("as"),
		UserID:        params.UserID,
		TokenHash:     hashToken(params.PlaintextToken),
		Status:        AuthSessionStatusActive,
		ExpiresAtUnix: params.ExpiresAt.UTC().Unix(),
		CreatedAtUnix: now.Unix(),
		UpdatedAtUnix: now.Unix(),
		MetadataJSON:  metadataJSON,
	}
	if err := s.db.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("insert auth session: %w", err)
	}
	return &AuthSession{
		ID:        row.ID,
		UserID:    row.UserID,
		TokenHash: row.TokenHash,
		Status:    row.Status,
		ExpiresAt: params.ExpiresAt.UTC(),
		CreatedAt: now,
		UpdatedAt: now,
		Metadata:  metadata,
	}, nil
}

func (s *IdentityStore) GetAuthSessionByToken(ctx context.Context, plaintextToken string) (*AuthSession, error) {
	var row gAuthSession
	err := s.db.GormDB().WithContext(ctx).
		Where("token_hash = ?", hashToken(plaintextToken)).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("auth session not found")
		}
		return nil, fmt.Errorf("get auth session by token: %w", err)
	}
	return authSessionFromGorm(row)
}

func (s *IdentityStore) CreateLoginSession(ctx context.Context, userID string, expiresIn time.Duration, metadata map[string]any) (*AuthSession, string, error) {
	if expiresIn <= 0 {
		expiresIn = 24 * time.Hour
	}
	token, err := GenerateSessionToken()
	if err != nil {
		return nil, "", err
	}
	session, err := s.CreateAuthSession(ctx, CreateAuthSessionParams{
		UserID:         userID,
		PlaintextToken: token,
		ExpiresAt:      time.Now().UTC().Add(expiresIn),
		Metadata:       metadata,
	})
	if err != nil {
		return nil, "", err
	}
	return session, token, nil
}

func (s *IdentityStore) ResolvePrincipalFromToken(ctx context.Context, plaintextToken string) (*AuthPrincipal, error) {
	authSession, err := s.GetAuthSessionByToken(ctx, plaintextToken)
	if err != nil {
		return nil, err
	}
	if authSession.Status != AuthSessionStatusActive {
		return nil, fmt.Errorf("auth session is not active")
	}
	if time.Now().UTC().After(authSession.ExpiresAt) {
		return nil, fmt.Errorf("auth session expired")
	}
	user, err := s.GetUserByID(ctx, authSession.UserID)
	if err != nil {
		return nil, err
	}
	if user.Status != UserStatusActive {
		return nil, fmt.Errorf("user is not active")
	}
	roles, err := s.ListUserRoles(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	memberships, err := s.ListUserWorkspaceMemberships(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	return &AuthPrincipal{
		User:                 user,
		AuthSession:          authSession,
		Roles:                roles,
		WorkspaceMemberships: memberships,
	}, nil
}

func (s *IdentityStore) TouchAuthSession(ctx context.Context, sessionID string, extendBy time.Duration) error {
	now := time.Now().UTC()
	updates := map[string]any{
		"last_used_at_unix": now.Unix(),
		"updated_at_unix":   now.Unix(),
	}
	if extendBy > 0 {
		updates["expires_at_unix"] = now.Add(extendBy).Unix()
	}
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gAuthSession{}).Where("id = ?", sessionID).
		Updates(updates).Error; err != nil {
		return fmt.Errorf("touch auth session: %w", err)
	}
	return nil
}

func (s *IdentityStore) RevokeAuthSession(ctx context.Context, sessionID string) error {
	now := time.Now().UTC().Unix()
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gAuthSession{}).Where("id = ?", sessionID).
		Updates(map[string]any{
			"status":          AuthSessionStatusRevoked,
			"updated_at_unix": now,
		}).Error; err != nil {
		return fmt.Errorf("revoke auth session: %w", err)
	}
	return nil
}

func (s *IdentityStore) RevokeAuthSessionsForUser(ctx context.Context, userID string) error {
	now := time.Now().UTC().Unix()
	if err := s.db.GormDB().WithContext(ctx).
		Model(&gAuthSession{}).
		Where("user_id = ? AND status = ?", strings.TrimSpace(userID), AuthSessionStatusActive).
		Updates(map[string]any{
			"status":          AuthSessionStatusRevoked,
			"updated_at_unix": now,
		}).Error; err != nil {
		return fmt.Errorf("revoke auth sessions for user: %w", err)
	}
	return nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
