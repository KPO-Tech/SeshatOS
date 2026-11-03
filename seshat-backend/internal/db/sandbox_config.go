package db

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

const sandboxConfigID = "default"

// sandboxModeRemovedDocker is what an install saved when the app still had a Docker mode.
const sandboxModeRemovedDocker = "docker"

// SandboxModeLocal runs bash directly on the host, under Landlock on Linux - the desktop
// default: an agent helping write documents, move files, or run/test code the user asked
// for needs real access to the user's own machine.
const SandboxModeLocal = "local"

// SandboxModeProject runs bash through the runtime's sidecar on this computer: commands
// can write only in the session's folder and cannot read what the user keeps protected.
// It is off until the user chooses it, and it does not cover the file tools.
const SandboxModeProject = "project"

// ValidSandboxMode says whether mode is one this store accepts.
func ValidSandboxMode(mode string) bool {
	return mode == SandboxModeLocal || mode == SandboxModeProject
}

type gSandboxConfig struct {
	ID            string `gorm:"primaryKey;size:64"`
	Mode          string `gorm:"column:mode;type:text;not null;default:''"`
	CapabilitySID string `gorm:"column:capability_sid;type:text;not null;default:''"`
	DenyRead      string `gorm:"column:deny_read;type:text;not null;default:''"`
	UpdatedAtUnix int64  `gorm:"column:updated_at_unix;autoUpdateTime:unix"`
	CreatedAtUnix int64  `gorm:"column:created_at_unix;autoCreateTime:unix"`
}

func (gSandboxConfig) TableName() string { return "sandbox_config" }

// SandboxConfig is the persisted user choice for where bash-tool commands
// execute - see Settings > Environment in the desktop app. No stored row
// (a fresh install) means SandboxModeLocal.
type SandboxConfig struct {
	Mode string
	// DockerModeRemoved says this install had chosen the Docker mode, which no longer
	// exists. It now runs direct, and someone who chose isolation has to be told.
	DockerModeRemoved bool
	// CapabilitySID is the identity the project sandbox's refusals name, made once for
	// this install. It has to stay the same: taking a refusal back needs it.
	CapabilitySID string
	// DenyRead is what the user keeps from commands. Without DenyReadSet they never
	// changed it, and the defaults apply.
	DenyRead    []string
	DenyReadSet bool
	UpdatedAt   time.Time
	CreatedAt   time.Time
}

type UpsertSandboxConfigParams struct {
	Mode string
	// DenyRead, when not nil, replaces the protected list.
	DenyRead *[]string
}

// newCapabilitySID makes a SID no account has, in the form the project sandbox parses.
func newCapabilitySID() (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return fmt.Sprintf("S-1-5-21-%d-%d-%d-%d",
		binary.LittleEndian.Uint32(raw[0:]),
		binary.LittleEndian.Uint32(raw[4:]),
		binary.LittleEndian.Uint32(raw[8:]),
		binary.LittleEndian.Uint32(raw[12:])), nil
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
	if !ValidSandboxMode(mode) {
		return nil, fmt.Errorf("sandbox mode must be %q or %q, got %q", SandboxModeLocal, SandboxModeProject, p.Mode)
	}

	values := map[string]any{"mode": mode}
	if p.DenyRead != nil {
		encoded, err := json.Marshal(*p.DenyRead)
		if err != nil {
			return nil, err
		}
		values["deny_read"] = string(encoded)
	}

	var row gSandboxConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", sandboxConfigID).First(&row).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		row = gSandboxConfig{ID: sandboxConfigID, Mode: mode}
		if encoded, ok := values["deny_read"].(string); ok {
			row.DenyRead = encoded
		}
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
		Updates(values).Error; err != nil {
		return nil, err
	}

	return s.Get(ctx)
}

// EnsureCapabilitySID returns this install's SID, making it the first time. No mode is
// chosen by doing so: a row made here keeps the desktop default.
func (s *SandboxConfigStore) EnsureCapabilitySID(ctx context.Context) (string, error) {
	var row gSandboxConfig
	err := s.db.gormDB.WithContext(ctx).Where("id = ?", sandboxConfigID).First(&row).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return "", err
	}
	missing := errors.Is(err, gorm.ErrRecordNotFound)
	if !missing && row.CapabilitySID != "" {
		return row.CapabilitySID, nil
	}
	sid, err := newCapabilitySID()
	if err != nil {
		return "", err
	}
	if missing {
		row = gSandboxConfig{ID: sandboxConfigID, Mode: SandboxModeLocal, CapabilitySID: sid}
		if err := s.db.gormDB.WithContext(ctx).Create(&row).Error; err != nil {
			return "", err
		}
		return sid, nil
	}
	if err := s.db.gormDB.WithContext(ctx).
		Model(&gSandboxConfig{}).
		Where("id = ?", sandboxConfigID).
		Update("capability_sid", sid).Error; err != nil {
		return "", err
	}
	return sid, nil
}

func sandboxConfigFromModel(row gSandboxConfig) SandboxConfig {
	cfg := SandboxConfig{
		Mode:          row.Mode,
		CapabilitySID: row.CapabilitySID,
		UpdatedAt:     time.Unix(row.UpdatedAtUnix, 0).UTC(),
		CreatedAt:     time.Unix(row.CreatedAtUnix, 0).UTC(),
	}
	if row.Mode == sandboxModeRemovedDocker {
		cfg.Mode = SandboxModeLocal
		cfg.DockerModeRemoved = true
	}
	if row.DenyRead != "" {
		// An unreadable list falls back to the defaults, which protect more than none.
		if err := json.Unmarshal([]byte(row.DenyRead), &cfg.DenyRead); err == nil {
			cfg.DenyReadSet = true
		}
	}
	return cfg
}
