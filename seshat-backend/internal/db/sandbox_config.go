package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

const sandboxConfigID = "default"

// SandboxModeDocker routes bash-tool execution through the SDK's Docker
// sandbox (falling back to unconfined local execution if Docker isn't
// installed/running - see bootstrap.go's queryClientConfig comment).
const SandboxModeDocker = "docker"

// SandboxModeLocal skips the Docker sandbox entirely and runs bash directly
// on the host, unconfined (Landlock on Linux) - the desktop default: an
// agent helping write documents, move files, or run/test code the user
// asked for needs real access to the user's own machine, not an isolated
// container that can't see any of it.
const SandboxModeLocal = "local"

type gSandboxConfig struct {
	ID            string `gorm:"primaryKey;size:64"`
	Mode          string `gorm:"column:mode;type:text;not null;default:''"`
	UpdatedAtUnix int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gSandboxConfig) TableName() string { return "sandbox_config" }

// SandboxConfig is the persisted user choice for where bash-tool commands
// execute - see Settings > Environment in the desktop app. No stored row
// (a fresh install) means SandboxModeLocal, not SandboxModeDocker - see
// resolveSandboxMode in bootstrap.go, which applies that default.
type SandboxConfig struct {
	Mode      string
	UpdatedAt time.Time
	CreatedAt time.Time
}

type UpsertSandboxConfigParams struct {
	Mode string
}

type SandboxConfigStore struct {
	db *DB
}

func NewSandboxConfigStore(database *DB) (*SandboxConfigStore, error) {
	if database == nil {
		return nil, fmt.Errorf("sandbox config store: database is required")
	}
	return &SandboxConfigStore{db: database}, nil
}

func (s *SandboxConfigStore) Get(ctx context.Context) (*SandboxConfig, error) {
	var row gSandboxConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", sandboxConfigID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	cfg := sandboxConfigFromModel(row)
	return &cfg, nil
}

func (s *SandboxConfigStore) Upsert(ctx context.Context, p UpsertSandboxConfigParams) (*SandboxConfig, error) {
	mode := strings.ToLower(strings.TrimSpace(p.Mode))
	if mode != SandboxModeDocker && mode != SandboxModeLocal {
		return nil, fmt.Errorf("sandbox mode must be %q or %q, got %q", SandboxModeDocker, SandboxModeLocal, p.Mode)
	}

	var row gSandboxConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", sandboxConfigID).First(&row).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		row = gSandboxConfig{ID: sandboxConfigID, Mode: mode}
		if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
			return nil, err
		}
		cfg := sandboxConfigFromModel(row)
		return &cfg, nil
	}
	if err != nil {
		return nil, err
	}

	if err := s.db.gormDB.WithContext(ctx).
		Model(&gSandboxConfig{}).
		Where("id = ?", sandboxConfigID).
		Update("mode", mode).Error; err != nil {
		return nil, err
	}

	return s.Get(ctx)
}

func sandboxConfigFromModel(row gSandboxConfig) SandboxConfig {
	return SandboxConfig{
		Mode:      row.Mode,
		UpdatedAt: time.Unix(row.UpdatedAtUnix, 0).UTC(),
		CreatedAt: time.Unix(row.CreatedAtUnix, 0).UTC(),
	}
}
