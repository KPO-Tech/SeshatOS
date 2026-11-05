package cloudidentity

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/cloud/http"
)

var _ auth.DeviceLoginProvider = (*Provider)(nil)

// The codes seshat-server puts in an error body while a device sign-in is not finished.
const (
	codeDevicePending  = "auth.device_authorization_pending"
	codeDeviceSlowDown = "auth.device_slow_down"
	codeDeviceDenied   = "auth.device_access_denied"
	codeDeviceExpired  = "auth.device_code_expired"
)

// DeviceCode is seshat-server's answer to POST /auth/device/code.
type DeviceCode struct {
	DeviceCode              string `json:"device_code"`
	UserCode                string `json:"user_code"`
	VerificationURI         string `json:"verification_uri"`
	VerificationURIComplete string `json:"verification_uri_complete"`
	ExpiresIn               int    `json:"expires_in"`
	Interval                int    `json:"interval"`
}

// StartDeviceCode asks the server for a code. No credential is involved.
func (c *Client) StartDeviceCode(ctx context.Context, clientName string) (*DeviceCode, error) {
	var out DeviceCode
	if err := c.do(ctx, http.MethodPost, "/api/v1/auth/device/code", "", map[string]string{"client_name": clientName}, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// PollDeviceToken asks whether the code was approved. The session comes back once; until then the
// server answers with an error whose body carries a stable code, which is returned next to the error.
func (c *Client) PollDeviceToken(ctx context.Context, deviceCode string) (*AuthResult, string, error) {
	var out AuthResult
	if err := c.do(ctx, http.MethodPost, "/api/v1/auth/device/token", "", map[string]string{"device_code": deviceCode}, &out); err != nil {
		return nil, errorCode(err), err
	}
	return &out, "", nil
}

// errorCode reads error.code from a seshat-server error body, or "" when there is none.
func errorCode(err error) string {
	var httpErr *cloudhttp.HTTPError
	if !errors.As(err, &httpErr) {
		return ""
	}
	var body struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if json.Unmarshal([]byte(strings.TrimSpace(httpErr.Body)), &body) != nil {
		return ""
	}
	return body.Error.Code
}

// StartDeviceLogin implements auth.DeviceLoginProvider.
func (p *Provider) StartDeviceLogin(ctx context.Context, clientName string) (*auth.DeviceLogin, error) {
	code, err := p.client.StartDeviceCode(ctx, clientName)
	if err != nil {
		return nil, cloudhttp.Translate(err)
	}
	return &auth.DeviceLogin{
		DeviceCode: code.DeviceCode, UserCode: code.UserCode,
		VerificationURI: code.VerificationURI, VerificationURIComplete: code.VerificationURIComplete,
		ExpiresIn: code.ExpiresIn, Interval: code.Interval,
	}, nil
}

// PollDeviceLogin implements auth.DeviceLoginProvider. Waiting, slowing down, a refusal and an expiry are
// answers, not failures; anything else (the server unreachable, a bad request) is an error.
func (p *Provider) PollDeviceLogin(ctx context.Context, deviceCode string) (*auth.DevicePoll, error) {
	result, code, err := p.client.PollDeviceToken(ctx, deviceCode)
	if err != nil {
		switch code {
		case codeDevicePending:
			return &auth.DevicePoll{Status: auth.DevicePending}, nil
		case codeDeviceSlowDown:
			return &auth.DevicePoll{Status: auth.DeviceSlowDown}, nil
		case codeDeviceDenied:
			return &auth.DevicePoll{Status: auth.DeviceDenied}, nil
		case codeDeviceExpired:
			return &auth.DevicePoll{Status: auth.DeviceExpired}, nil
		}
		return nil, cloudhttp.Translate(err)
	}
	if result.Token == "" {
		return nil, bkerr.Internal("the server approved the sign-in but sent no session", nil)
	}
	login, err := p.openSession(ctx, result.Token)
	if err != nil {
		return nil, err
	}
	return &auth.DevicePoll{Status: auth.DeviceApproved, Login: login}, nil
}
