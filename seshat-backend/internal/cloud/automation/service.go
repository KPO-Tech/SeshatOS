package cloudautomation

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"
)

// Service backs the local /cloud/* HTTP handlers (status, connect,
// disconnect, recent runs). Job management itself is not exposed here — it
// happens exclusively in seshat-console once connected.
type Service struct {
	store    *Store
	policies *PolicyStore
	versions *VersionStore
	rules    *RuleStore
}

// SetRules lets the service store the organization's rules brought by the heartbeat.
func (s *Service) SetRules(rules *RuleStore) { s.rules = rules }

func NewService(store *Store, policies *PolicyStore, versions *VersionStore) *Service {
	return &Service{store: store, policies: policies, versions: versions}
}

// Connect validates the pasted device token by heartbeating with it, then
// persists the connection. userID is whichever local seshat-backend user
// performed this action — captured so the JobExecutor knows whose local
// credentials/context to run claimed jobs under.
func (s *Service) Connect(ctx context.Context, userID, serverURL, deviceToken string) (*Status, error) {
	serverURL = strings.TrimSpace(serverURL)
	deviceToken = strings.TrimSpace(deviceToken)
	if serverURL == "" || deviceToken == "" {
		return nil, fmt.Errorf("server_url and device_token are required")
	}

	client := NewClient(serverURL, deviceToken)
	device, err := client.Heartbeat(ctx)
	if err != nil {
		return nil, fmt.Errorf("could not reach seshat-server with this token: %w", err)
	}
	if s.policies != nil {
		if err := s.policies.Save(ctx, device.Policies); err != nil {
			return nil, fmt.Errorf("save desktop policies: %w", err)
		}
	}
	if s.versions != nil {
		if err := s.versions.Save(ctx, device.MinAppVersion, device.AppVersionOutdated); err != nil {
			return nil, fmt.Errorf("save app version status: %w", err)
		}
	}
	if s.rules != nil {
		if err := s.rules.Save(ctx, device.Rules); err != nil {
			return nil, fmt.Errorf("save organization rules: %w", err)
		}
	}

	conn := Connection{
		ServerURL:         serverURL,
		DeviceID:          device.ID,
		DeviceName:        device.Name,
		DeviceToken:       deviceToken,
		ConnectedByUserID: userID,
		ConnectedAt:       time.Now().UTC(),
	}
	if err := s.store.Save(ctx, conn); err != nil {
		return nil, err
	}
	return s.Status(ctx)
}

// RegisterAndConnect self-registers this machine as a device with serverURL
// using the caller's own session token (no device token exists yet; that's
// what this call produces), then persists the result exactly like a manually
// pasted token would via Connect. name defaults to the local hostname when
// the caller doesn't supply one. Safe to call when already connected: it
// just returns the existing status without registering a second device.
func (s *Service) RegisterAndConnect(ctx context.Context, userID, serverURL, userToken, organizationID, name string) (*Status, error) {
	if existing, err := s.Status(ctx); err == nil && existing.Connected {
		return existing, nil
	}

	serverURL = strings.TrimSpace(serverURL)
	userToken = strings.TrimSpace(userToken)
	organizationID = strings.TrimSpace(organizationID)
	if serverURL == "" || userToken == "" || organizationID == "" {
		return nil, fmt.Errorf("server_url, session token and organization are required")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		if hostname, err := os.Hostname(); err == nil && hostname != "" {
			name = hostname
		} else {
			name = "seshat-backend device"
		}
	}

	result, err := registerDevice(ctx, &http.Client{Timeout: 15 * time.Second}, serverURL, userToken, registerDeviceParams{
		OrganizationID: organizationID,
		Name:           name,
		Platform:       runtime.GOOS,
	})
	if err != nil {
		return nil, fmt.Errorf("could not register this device: %w", err)
	}

	return s.Connect(ctx, userID, serverURL, result.Token)
}

func (s *Service) Disconnect(ctx context.Context) error {
	if s.policies != nil {
		if err := s.policies.Clear(ctx); err != nil {
			return err
		}
	}
	if s.versions != nil {
		if err := s.versions.Clear(ctx); err != nil {
			return err
		}
	}
	if s.rules != nil {
		if err := s.rules.Clear(ctx); err != nil {
			return err
		}
	}
	return s.store.Clear(ctx)
}

func (s *Service) Status(ctx context.Context) (*Status, error) {
	policies := map[string]bool{}
	if s.policies != nil {
		policies = s.policies.All(ctx)
	}
	var minAppVersion *string
	var appVersionOutdated bool
	if s.versions != nil {
		minAppVersion, appVersionOutdated = s.versions.Status(ctx)
	}
	var rules *DeviceRules
	if s.rules != nil {
		if stored := s.rules.Get(ctx); stored != nil && (strings.TrimSpace(stored.Instructions) != "" || len(stored.ForbiddenTools) > 0) {
			rules = stored
		}
	}
	conn, err := s.store.Load(ctx)
	if err != nil {
		return nil, err
	}
	if conn == nil {
		return &Status{Connected: false, Policies: policies, MinAppVersion: minAppVersion, AppVersionOutdated: appVersionOutdated, Rules: rules}, nil
	}
	connectedAt := conn.ConnectedAt
	return &Status{
		Connected:          true,
		ServerURL:          conn.ServerURL,
		DeviceID:           conn.DeviceID,
		DeviceName:         conn.DeviceName,
		ConnectedByUserID:  conn.ConnectedByUserID,
		ConnectedAt:        &connectedAt,
		Policies:           policies,
		MinAppVersion:      minAppVersion,
		AppVersionOutdated: appVersionOutdated,
		Rules:              rules,
	}, nil
}
