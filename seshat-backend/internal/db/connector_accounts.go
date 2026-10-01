package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

// ConnectorAccountStatus values mirror ChannelAccountStatus's - a connector
// account goes through the same pending/connected/error/disconnected
// lifecycle as an inbox channel account.
const (
	ConnectorAccountStatusPending      = "pending"
	ConnectorAccountStatusConnected    = "connected"
	ConnectorAccountStatusError        = "error"
	ConnectorAccountStatusDisconnected = "disconnected"
)

// gConnectorAccount is one connected external-source account for a
// connector.KnowledgeConnector/ActionConnector (a Google Drive account, a
// future SharePoint site, ...). Encryption approach: AES-GCM via
// loadOrCreateEncryptionKey/encryptAESGCM, package-private to internal/db.
type gConnectorAccount struct {
	ID                    string  `gorm:"primaryKey;size:64"`
	UserID                string  `gorm:"column:user_id;size:64;not null;index"`
	WorkspaceID           *string `gorm:"column:workspace_id;size:64;index"`
	Kind                  string  `gorm:"column:kind;size:32;not null;index"` // e.g. "gdrive" - see connector.Kind
	DisplayName           string  `gorm:"column:display_name;not null;default:''"`
	ExternalAccountID     string  `gorm:"column:external_account_id;not null;default:''"` // e.g. the connected Google account's email
	Status                string  `gorm:"column:status;size:32;not null;default:'pending';index"`
	AccessTokenEncrypted  string  `gorm:"column:access_token_encrypted;not null;default:''"`
	RefreshTokenEncrypted string  `gorm:"column:refresh_token_encrypted;not null;default:''"`
	Scope                 string  `gorm:"column:scope;not null;default:''"`
	ExpiresAtUnix         int64   `gorm:"column:expires_at_unix;not null;default:0"`
	// SyncCursor is opaque per connector kind (a Google Drive changes.list
	// page token, ...) - only the connector that owns this account
	// interprets it.
	SyncCursor       string `gorm:"column:sync_cursor;not null;default:''"`
	LastSyncedAtUnix int64  `gorm:"column:last_synced_at_unix;not null;default:0"`
	LastError        string `gorm:"column:last_error;not null;default:''"`
	CreatedAtUnix    int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
	UpdatedAtUnix    int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
}

func (gConnectorAccount) TableName() string { return "connector_accounts" }

type ConnectorAccount struct {
	ID                string
	UserID            string
	WorkspaceID       string
	Kind              string
	DisplayName       string
	ExternalAccountID string
	Status            string
	HasRefreshToken   bool
	Scope             string
	ExpiresAt         time.Time
	SyncCursor        string
	LastSyncedAt      time.Time
	LastError         string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

type ConnectorAccountSecret struct {
	AccessToken  string
	RefreshToken string
	ExpiresAt    time.Time
}

type CreateConnectorAccountParams struct {
	UserID            string
	WorkspaceID       string
	Kind              string
	DisplayName       string
	ExternalAccountID string
}

type UpdateConnectorAccountConnectedParams struct {
	ID                string
	DisplayName       string
	ExternalAccountID string
	AccessToken       string
	RefreshToken      string
	Scope             string
	ExpiresAt         time.Time
}

type UpdateConnectorAccountSyncParams struct {
	ID           string
	SyncCursor   string
	LastSyncedAt time.Time
	LastError    string
}

// ─── ConnectorAccountStore ──────────────────────────────────────────────────

type ConnectorAccountStore struct {
	db *DB
}

func NewConnectorAccountStore(database *DB) (*ConnectorAccountStore, error) {
	if database == nil {
		return nil, fmt.Errorf("connector account store: database is required")
	}
	return &ConnectorAccountStore{db: database}, nil
}

func (s *ConnectorAccountStore) Create(ctx context.Context, p CreateConnectorAccountParams) (*ConnectorAccount, error) {
	if strings.TrimSpace(p.UserID) == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	if strings.TrimSpace(p.Kind) == "" {
		return nil, fmt.Errorf("kind is required")
	}
	row := gConnectorAccount{
		ID:                newIdentityID("connacc"),
		UserID:            p.UserID,
		Kind:              strings.TrimSpace(p.Kind),
		DisplayName:       strings.TrimSpace(p.DisplayName),
		ExternalAccountID: strings.TrimSpace(p.ExternalAccountID),
		Status:            ConnectorAccountStatusPending,
	}
	if p.WorkspaceID != "" {
		row.WorkspaceID = &p.WorkspaceID
	}
	if err := s.db.GormDB().WithContext(ctx).Create(&row).Error; err != nil {
		return nil, fmt.Errorf("create connector account: %w", err)
	}
	return connectorAccountFromModel(row), nil
}

func (s *ConnectorAccountStore) GetByID(ctx context.Context, id string) (*ConnectorAccount, error) {
	var row gConnectorAccount
	if err := s.db.GormDB().WithContext(ctx).Where("id = ?", id).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("connector account not found")
		}
		return nil, err
	}
	return connectorAccountFromModel(row), nil
}

// GetByKindAndExternalID looks up an already-connected account for (userID,
// kind, externalAccountID) - lets reconnecting (redoing OAuth after a
// refresh token expires) update the existing row instead of creating a
// duplicate. found=false (not an error) means no prior account.
func (s *ConnectorAccountStore) GetByKindAndExternalID(ctx context.Context, userID, kind, externalAccountID string) (*ConnectorAccount, bool, error) {
	var row gConnectorAccount
	err := s.db.GormDB().WithContext(ctx).
		Where("user_id = ? AND kind = ? AND external_account_id = ?", userID, kind, externalAccountID).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return connectorAccountFromModel(row), true, nil
}

func (s *ConnectorAccountStore) ListByUserID(ctx context.Context, userID string) ([]ConnectorAccount, error) {
	var rows []gConnectorAccount
	if err := s.db.GormDB().WithContext(ctx).Where("user_id = ?", userID).Order("created_at_unix asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]ConnectorAccount, 0, len(rows))
	for _, row := range rows {
		out = append(out, *connectorAccountFromModel(row))
	}
	return out, nil
}

func (s *ConnectorAccountStore) UpdateConnected(ctx context.Context, p UpdateConnectorAccountConnectedParams) (*ConnectorAccount, error) {
	accessEnc, err := encryptOptionalSecret(p.AccessToken)
	if err != nil {
		return nil, err
	}
	refreshEnc, err := encryptOptionalSecret(p.RefreshToken)
	if err != nil {
		return nil, err
	}
	updates := map[string]any{
		"status":                  ConnectorAccountStatusConnected,
		"display_name":            strings.TrimSpace(p.DisplayName),
		"external_account_id":     strings.TrimSpace(p.ExternalAccountID),
		"access_token_encrypted":  accessEnc,
		"refresh_token_encrypted": refreshEnc,
		"scope":                   strings.TrimSpace(p.Scope),
		"expires_at_unix":         unixOrZero(p.ExpiresAt),
		"last_error":              "",
	}
	if err := s.db.GormDB().WithContext(ctx).Model(&gConnectorAccount{}).Where("id = ?", p.ID).Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.GetByID(ctx, p.ID)
}

func (s *ConnectorAccountStore) UpdateSyncState(ctx context.Context, p UpdateConnectorAccountSyncParams) error {
	updates := map[string]any{
		"sync_cursor":         p.SyncCursor,
		"last_synced_at_unix": unixOrZero(p.LastSyncedAt),
		"last_error":          strings.TrimSpace(p.LastError),
	}
	return s.db.GormDB().WithContext(ctx).Model(&gConnectorAccount{}).Where("id = ?", p.ID).Updates(updates).Error
}

func (s *ConnectorAccountStore) UpdateStatus(ctx context.Context, id, status, lastError string) error {
	updates := map[string]any{
		"status":     status,
		"last_error": strings.TrimSpace(lastError),
	}
	return s.db.GormDB().WithContext(ctx).Model(&gConnectorAccount{}).Where("id = ?", id).Updates(updates).Error
}

func (s *ConnectorAccountStore) Delete(ctx context.Context, id string) error {
	return s.db.GormDB().WithContext(ctx).Delete(&gConnectorAccount{}, "id = ?", id).Error
}

// GetSecret returns the decrypted OAuth material for a connector account -
// only ever called from within a connector's own Discover/Sync path.
func (s *ConnectorAccountStore) GetSecret(ctx context.Context, id string) (*ConnectorAccountSecret, error) {
	var row gConnectorAccount
	if err := s.db.GormDB().WithContext(ctx).Where("id = ?", id).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("connector account not found")
		}
		return nil, err
	}
	key, err := loadOrCreateEncryptionKey()
	if err != nil {
		return nil, err
	}
	accessToken, err := decryptOptionalSecret(key, row.AccessTokenEncrypted)
	if err != nil {
		return nil, err
	}
	refreshToken, err := decryptOptionalSecret(key, row.RefreshTokenEncrypted)
	if err != nil {
		return nil, err
	}
	return &ConnectorAccountSecret{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresAt:    timeOrZero(row.ExpiresAtUnix),
	}, nil
}

func connectorAccountFromModel(row gConnectorAccount) *ConnectorAccount {
	a := &ConnectorAccount{
		ID:                row.ID,
		UserID:            row.UserID,
		Kind:              row.Kind,
		DisplayName:       row.DisplayName,
		ExternalAccountID: row.ExternalAccountID,
		Status:            row.Status,
		HasRefreshToken:   row.RefreshTokenEncrypted != "",
		Scope:             row.Scope,
		ExpiresAt:         timeOrZero(row.ExpiresAtUnix),
		SyncCursor:        row.SyncCursor,
		LastSyncedAt:      timeOrZero(row.LastSyncedAtUnix),
		LastError:         row.LastError,
		CreatedAt:         timeOrZero(row.CreatedAtUnix),
		UpdatedAt:         timeOrZero(row.UpdatedAtUnix),
	}
	if row.WorkspaceID != nil {
		a.WorkspaceID = *row.WorkspaceID
	}
	return a
}
