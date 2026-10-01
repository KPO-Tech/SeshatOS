package db

import (
	"context"
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// gRemotePrincipalCache caches the last principal resolved from a connected
// seshat-server, keyed by a hash of the session token (never the raw token).
// One row per active local session — not a singleton, unlike gCredential.
// See internal/cloudidentity: freshness/grace-window logic lives there, this
// is just storage.
type gRemotePrincipalCache struct {
	TokenHash      string `gorm:"column:token_hash;primaryKey;size:191"`
	PrincipalJSON  string `gorm:"column:principal_json;not null"`
	ResolvedAtUnix int64  `gorm:"column:resolved_at_unix"`
	ExpiresAtUnix  int64  `gorm:"column:expires_at_unix"`
}

func (gRemotePrincipalCache) TableName() string { return "remote_principal_cache" }

// UpsertRemotePrincipalCache stores/refreshes the cached principal JSON for a token hash.
func (db *DB) UpsertRemotePrincipalCache(ctx context.Context, tokenHash, principalJSON string, resolvedAtUnix, expiresAtUnix int64) error {
	row := gRemotePrincipalCache{
		TokenHash:      tokenHash,
		PrincipalJSON:  principalJSON,
		ResolvedAtUnix: resolvedAtUnix,
		ExpiresAtUnix:  expiresAtUnix,
	}
	return db.gormDB.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "token_hash"}},
			DoUpdates: clause.AssignmentColumns([]string{"principal_json", "resolved_at_unix", "expires_at_unix"}),
		}).Create(&row).Error
}

// GetRemotePrincipalCache returns the cached entry for a token hash, if any.
func (db *DB) GetRemotePrincipalCache(ctx context.Context, tokenHash string) (principalJSON string, resolvedAtUnix int64, found bool, err error) {
	var row gRemotePrincipalCache
	dbErr := db.gormDB.WithContext(ctx).Where("token_hash = ?", tokenHash).First(&row).Error
	if dbErr != nil {
		if errors.Is(dbErr, gorm.ErrRecordNotFound) {
			return "", 0, false, nil
		}
		return "", 0, false, dbErr
	}
	return row.PrincipalJSON, row.ResolvedAtUnix, true, nil
}

// DeleteRemotePrincipalCache removes the cached entry for a token hash (e.g. on logout).
func (db *DB) DeleteRemotePrincipalCache(ctx context.Context, tokenHash string) error {
	return db.gormDB.WithContext(ctx).Delete(&gRemotePrincipalCache{}, "token_hash = ?", tokenHash).Error
}
