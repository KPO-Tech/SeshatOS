package cloudautomation

import (
	"context"
	"encoding/json"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
)

// credentialKey is the single well-known key under which the (singleton)
// cloud connection is stored via the existing generic encrypted credential
// store (internal/db/credentials.go) — no dedicated table needed.
const credentialKey = "cloud_automation_connection"

type storedConnection struct {
	ServerURL         string    `json:"server_url"`
	DeviceID          string    `json:"device_id"`
	DeviceName        string    `json:"device_name"`
	DeviceToken       string    `json:"device_token"`
	ConnectedByUserID string    `json:"connected_by_user_id"`
	ConnectedAt       time.Time `json:"connected_at"`
}

// Store persists the one cloud connection this machine has, if any.
type Store struct {
	db *db.DB
}

func NewStore(database *db.DB) *Store {
	return &Store{db: database}
}

func (s *Store) Save(ctx context.Context, conn Connection) error {
	raw, err := json.Marshal(storedConnection(conn))
	if err != nil {
		return err
	}
	return s.db.UpsertCredential(ctx, credentialKey, string(raw))
}

// Load returns (nil, nil) when no connection has been established yet.
func (s *Store) Load(ctx context.Context) (*Connection, error) {
	raw, ok, err := s.db.GetCredential(ctx, credentialKey)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, nil
	}
	var sc storedConnection
	if err := json.Unmarshal([]byte(raw), &sc); err != nil {
		return nil, err
	}
	return &Connection{
		ServerURL:         sc.ServerURL,
		DeviceID:          sc.DeviceID,
		DeviceName:        sc.DeviceName,
		DeviceToken:       sc.DeviceToken,
		ConnectedByUserID: sc.ConnectedByUserID,
		ConnectedAt:       sc.ConnectedAt,
	}, nil
}

func (s *Store) Clear(ctx context.Context) error {
	return s.db.DeleteCredential(ctx, credentialKey)
}
