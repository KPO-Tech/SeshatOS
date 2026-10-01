package settings

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/KPO-Tech/seshat/pkg/auth/oauth"
)

type defaultOAuthClientFactory struct{}

func (defaultOAuthClientFactory) NewClient(provider string) (OAuthClient, error) {
	switch strings.ToLower(provider) {
	case "openai", "codex":
		// oauth.DefaultOpenAIConfig already carries a working, public
		// ClientID (the same one the real Codex CLI uses for its PKCE/device
		// flow - not a secret, safe to ship). OPENAI_CLIENT_ID is only for
		// an operator who has registered their own OpenAI OAuth app and
		// wants requests to go through it instead - optional, not required.
		config := oauth.DefaultOpenAIConfig()
		if clientID := os.Getenv("OPENAI_CLIENT_ID"); clientID != "" {
			config.ClientID = clientID
		}
		return oauthClientAdapter{client: oauth.NewClient(config)}, nil
	default:
		return nil, fmt.Errorf("oauth not supported for provider %s", provider)
	}
}

type oauthClientAdapter struct {
	client *oauth.Client
}

func (a oauthClientAdapter) DeviceCode(ctx context.Context) (*OAuthDeviceCodeResponse, error) {
	resp, err := a.client.DeviceCode(ctx)
	if err != nil {
		return nil, err
	}
	return &OAuthDeviceCodeResponse{
		DeviceCode:      resp.DeviceCode,
		UserCode:        resp.UserCode,
		VerificationURL: firstNonEmpty(resp.VerificationURIComplete, resp.VerificationURI),
		ExpiresIn:       resp.ExpiresIn,
		Interval:        resp.Interval,
	}, nil
}

func (a oauthClientAdapter) ExchangeDeviceToken(ctx context.Context, deviceCode string, userCode string) (*OAuthTokenResponse, error) {
	resp, err := a.client.ExchangeDeviceToken(ctx, deviceCode, userCode)
	if err != nil {
		return nil, err
	}
	return &OAuthTokenResponse{
		AccessToken:  resp.AccessToken,
		RefreshToken: resp.RefreshToken,
		IDToken:      resp.IDToken,
		Scope:        resp.Scope,
		ExpiresIn:    resp.ExpiresIn,
	}, nil
}

func (a oauthClientAdapter) RefreshToken(ctx context.Context, refreshToken string) (*OAuthTokenResponse, error) {
	resp, err := a.client.RefreshToken(ctx, refreshToken)
	if err != nil {
		return nil, err
	}
	return &OAuthTokenResponse{
		AccessToken:  resp.AccessToken,
		RefreshToken: resp.RefreshToken,
		IDToken:      resp.IDToken,
		Scope:        resp.Scope,
		ExpiresIn:    resp.ExpiresIn,
	}, nil
}
