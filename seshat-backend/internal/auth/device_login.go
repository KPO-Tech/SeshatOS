package auth

import (
	"context"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
)

// Device sign-in (RFC 8628, as implemented by seshat-server): the desktop asks the organization's server for
// a short code, shows it, and polls. The person opens the server's console in a browser, where they are
// already signed in with their second factor, checks the code and approves it. The password never reaches
// this process. It exists only when the install is connected to an organization.

// DeviceLogin is what the desktop shows the person while it waits.
type DeviceLogin struct {
	// DeviceCode is the secret the poll uses. It is kept by the desktop's main process and never displayed.
	DeviceCode              string `json:"device_code"`
	UserCode                string `json:"user_code"`
	VerificationURI         string `json:"verification_uri"`
	VerificationURIComplete string `json:"verification_uri_complete"`
	ExpiresIn               int    `json:"expires_in"`
	Interval                int    `json:"interval"`
}

// The states a poll can report. Pending and slow-down mean "keep waiting"; denied and expired mean stop.
const (
	DevicePending  = "pending"
	DeviceSlowDown = "slow_down"
	DeviceApproved = "approved"
	DeviceDenied   = "denied"
	DeviceExpired  = "expired"
)

// DevicePoll is one answer of the server. Login is set only when Status is DeviceApproved.
type DevicePoll struct {
	Status string
	Login  *LoginResult
}

// DeviceLoginProvider is implemented by the provider of a connected install. The local provider does not.
type DeviceLoginProvider interface {
	StartDeviceLogin(ctx context.Context, clientName string) (*DeviceLogin, error)
	PollDeviceLogin(ctx context.Context, deviceCode string) (*DevicePoll, error)
}

func (s *Service) deviceProvider() (DeviceLoginProvider, error) {
	if s == nil || s.provider == nil {
		return nil, bkerr.Unavailable("auth not configured", nil)
	}
	provider, ok := s.provider.(DeviceLoginProvider)
	if !ok {
		return nil, bkerr.Forbidden("device sign-in is only available when this install is connected to an organization", nil)
	}
	return provider, nil
}

// StartDeviceLogin asks the organization's server for a code to show.
func (s *Service) StartDeviceLogin(ctx context.Context, clientName string) (*DeviceLogin, error) {
	provider, err := s.deviceProvider()
	if err != nil {
		return nil, err
	}
	return provider.StartDeviceLogin(ctx, clientName)
}

// PollDeviceLogin asks whether the person has approved the code yet.
func (s *Service) PollDeviceLogin(ctx context.Context, deviceCode string) (*DevicePoll, error) {
	provider, err := s.deviceProvider()
	if err != nil {
		return nil, err
	}
	return provider.PollDeviceLogin(ctx, deviceCode)
}
