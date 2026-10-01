package settings

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
)

type OAuthClient interface {
	DeviceCode(ctx context.Context) (*OAuthDeviceCodeResponse, error)
	// ExchangeDeviceToken polls the provider's device token endpoint once.
	// Both deviceCode (device_auth_id) and userCode are required.
	// Returns "authorization_pending" error when the user has not yet authorised.
	ExchangeDeviceToken(ctx context.Context, deviceCode string, userCode string) (*OAuthTokenResponse, error)
	RefreshToken(ctx context.Context, refreshToken string) (*OAuthTokenResponse, error)
}

type OAuthClientFactory interface {
	NewClient(provider string) (OAuthClient, error)
}

type OAuthDeviceCodeResponse struct {
	DeviceCode      string
	UserCode        string
	VerificationURL string
	ExpiresIn       int
	Interval        int
}

type OAuthTokenResponse struct {
	AccessToken  string
	RefreshToken string
	IDToken      string
	Scope        string
	ExpiresIn    int
}

type LocalProvider struct {
	store        *db.ProviderSettingStore
	oauthStore   *db.ProviderOAuthConnectionStore
	oauthFactory OAuthClientFactory
}

func NewLocalProvider(store *db.ProviderSettingStore, oauthStore *db.ProviderOAuthConnectionStore, oauthFactory OAuthClientFactory) *LocalProvider {
	if oauthFactory == nil {
		oauthFactory = defaultOAuthClientFactory{}
	}
	return &LocalProvider{
		store:        store,
		oauthStore:   oauthStore,
		oauthFactory: oauthFactory,
	}
}

func (s *LocalProvider) Create(ctx context.Context, principal *backendauth.Principal, p CreateSettingParams) (*ProviderSetting, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("settings store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}
	if strings.TrimSpace(p.Provider) == "" {
		return nil, bkerr.InvalidInput("provider is required", nil)
	}
	if strings.TrimSpace(p.Name) == "" {
		return nil, bkerr.InvalidInput("name is required", nil)
	}

	authKind := normalizeAuthKind(p.Provider, p.AuthKind)
	if err := validateAuthKind(p.Provider, authKind); err != nil {
		return nil, err
	}
	if authKind == AuthKindOAuth && strings.TrimSpace(p.APIKey) != "" {
		return nil, bkerr.InvalidInput("api_key cannot be provided when auth_kind is oauth", nil)
	}

	rec, err := s.store.Create(ctx, db.CreateProviderSettingParams{
		UserID:   principal.User.ID,
		Provider: p.Provider,
		Name:     p.Name,
		AuthKind: authKind,
		BaseURL:  p.BaseURL,
		ModelID:  p.ModelID,
		APIKey:   p.APIKey,
	})
	if err != nil {
		return nil, bkerr.Internal("create provider setting: "+err.Error(), err)
	}
	return s.enrichSetting(ctx, *rec)
}

func (s *LocalProvider) Get(ctx context.Context, principal *backendauth.Principal, id string) (*ProviderSetting, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("settings store not configured", nil)
	}
	rec, err := s.store.GetByID(ctx, id)
	if err != nil {
		return nil, bkerr.NotFound("provider setting not found", err)
	}
	if err := s.checkAccess(principal, rec); err != nil {
		return nil, err
	}
	return s.enrichSetting(ctx, *rec)
}

func (s *LocalProvider) List(ctx context.Context, principal *backendauth.Principal) ([]ProviderSetting, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("settings store not configured", nil)
	}
	if principal == nil {
		return nil, bkerr.Unauthorized("authentication required", nil)
	}

	records, err := s.store.ListByUserID(ctx, principal.User.ID)
	if err != nil {
		return nil, bkerr.Internal("list provider settings: "+err.Error(), err)
	}

	oauthMap := map[string]db.ProviderOAuthConnection{}
	if s.oauthStore != nil {
		ids := make([]string, 0, len(records))
		for _, record := range records {
			if record.AuthKind == AuthKindOAuth {
				ids = append(ids, record.ID)
			}
		}
		oauthMap, err = s.oauthStore.ListBySettingIDs(ctx, ids)
		if err != nil {
			return nil, bkerr.Internal("list oauth connections: "+err.Error(), err)
		}
	}

	result := make([]ProviderSetting, 0, len(records))
	for _, record := range records {
		result = append(result, *settingFromDB(record, oauthMap[record.ID]))
	}
	return result, nil
}

func (s *LocalProvider) Update(ctx context.Context, principal *backendauth.Principal, id string, p UpdateSettingParams) (*ProviderSetting, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("settings store not configured", nil)
	}
	rec, err := s.store.GetByID(ctx, id)
	if err != nil {
		return nil, bkerr.NotFound("provider setting not found", err)
	}
	if err := s.checkAccess(principal, rec); err != nil {
		return nil, err
	}

	authKind := rec.AuthKind
	if p.AuthKind != nil {
		authKind = normalizeAuthKind(rec.Provider, *p.AuthKind)
		if err := validateAuthKind(rec.Provider, authKind); err != nil {
			return nil, err
		}
	}
	if authKind == AuthKindOAuth && p.APIKey != nil && strings.TrimSpace(*p.APIKey) != "" {
		return nil, bkerr.InvalidInput("api_key cannot be set when auth_kind is oauth", nil)
	}

	updated, err := s.store.Update(ctx, id, db.UpdateProviderSettingParams{
		Name:     p.Name,
		AuthKind: &authKind,
		BaseURL:  p.BaseURL,
		ModelID:  p.ModelID,
		APIKey:   p.APIKey,
	})
	if err != nil {
		return nil, bkerr.Internal("update provider setting: "+err.Error(), err)
	}
	return s.enrichSetting(ctx, *updated)
}

func (s *LocalProvider) Delete(ctx context.Context, principal *backendauth.Principal, id string) error {
	if s == nil || s.store == nil {
		return bkerr.Unavailable("settings store not configured", nil)
	}
	rec, err := s.store.GetByID(ctx, id)
	if err != nil {
		return bkerr.NotFound("provider setting not found", err)
	}
	if err := s.checkAccess(principal, rec); err != nil {
		return err
	}
	if s.oauthStore != nil {
		if err := s.oauthStore.DeleteBySettingID(ctx, id); err != nil {
			return bkerr.Internal("delete oauth connection: "+err.Error(), err)
		}
	}
	if err := s.store.Delete(ctx, id); err != nil {
		return bkerr.Internal("delete provider setting: "+err.Error(), err)
	}
	return nil
}

func (s *LocalProvider) SetDefault(ctx context.Context, principal *backendauth.Principal, id string) (*ProviderSetting, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("settings store not configured", nil)
	}
	rec, err := s.store.GetByID(ctx, id)
	if err != nil {
		return nil, bkerr.NotFound("provider setting not found", err)
	}
	if err := s.checkAccess(principal, rec); err != nil {
		return nil, err
	}
	if err := s.store.SetDefault(ctx, principal.User.ID, id); err != nil {
		return nil, bkerr.Internal("set default provider: "+err.Error(), err)
	}
	return s.enrichSetting(ctx, db.ProviderSetting{
		ID:        rec.ID,
		UserID:    rec.UserID,
		Provider:  rec.Provider,
		Name:      rec.Name,
		AuthKind:  rec.AuthKind,
		BaseURL:   rec.BaseURL,
		ModelID:   rec.ModelID,
		HasAPIKey: rec.HasAPIKey,
		IsDefault: true,
		CreatedAt: rec.CreatedAt,
		UpdatedAt: rec.UpdatedAt,
	})
}

func (s *LocalProvider) StartOAuth(ctx context.Context, principal *backendauth.Principal, id string) (*OAuthChallenge, error) {
	rec, err := s.requireOAuthSetting(ctx, principal, id)
	if err != nil {
		return nil, err
	}
	if s.oauthStore == nil {
		return nil, bkerr.Unavailable("oauth store not configured", nil)
	}
	client, err := s.oauthFactory.NewClient(rec.Provider)
	if err != nil {
		return nil, bkerr.InvalidInput(err.Error(), err)
	}
	deviceCode, err := client.DeviceCode(ctx)
	if err != nil {
		return nil, bkerr.Internal("start oauth device flow: "+err.Error(), err)
	}
	expiresAt := time.Now().UTC().Add(time.Duration(deviceCode.ExpiresIn) * time.Second)
	if _, err := s.oauthStore.UpsertPending(ctx, db.UpsertProviderOAuthPendingParams{
		SettingID:              rec.ID,
		UserID:                 rec.UserID,
		Provider:               rec.Provider,
		Status:                 ConnectionStatusPending,
		DeviceCode:             deviceCode.DeviceCode,
		UserCode:               deviceCode.UserCode,
		VerificationURL:        deviceCode.VerificationURL,
		ExpiresAt:              expiresAt,
		PendingIntervalSeconds: deviceCode.Interval,
		LastError:              "",
	}); err != nil {
		return nil, bkerr.Internal("store pending oauth flow: "+err.Error(), err)
	}
	return &OAuthChallenge{
		Status:              ConnectionStatusPending,
		UserCode:            deviceCode.UserCode,
		VerificationURL:     deviceCode.VerificationURL,
		PollIntervalSeconds: deviceCode.Interval,
		ExpiresAt:           expiresAt,
	}, nil
}

func (s *LocalProvider) PollOAuth(ctx context.Context, principal *backendauth.Principal, id string) (*ProviderSetting, error) {
	rec, err := s.requireOAuthSetting(ctx, principal, id)
	if err != nil {
		return nil, err
	}
	if s.oauthStore == nil {
		return nil, bkerr.Unavailable("oauth store not configured", nil)
	}
	secret, err := s.oauthStore.GetSecret(ctx, rec.ID)
	if err != nil {
		return nil, bkerr.NotFound("oauth flow not started", err)
	}
	if strings.TrimSpace(secret.PendingDeviceCode) == "" {
		return nil, bkerr.InvalidInput("oauth flow not started", nil)
	}

	client, err := s.oauthFactory.NewClient(rec.Provider)
	if err != nil {
		return nil, bkerr.InvalidInput(err.Error(), err)
	}
	token, err := client.ExchangeDeviceToken(ctx, secret.PendingDeviceCode, secret.PendingUserCode)
	if err != nil {
		errMsg := err.Error()
		switch {
		case strings.Contains(errMsg, "authorization_pending"), strings.Contains(errMsg, "slow_down"):
			if _, updateErr := s.oauthStore.UpdateStatus(ctx, db.UpdateProviderOAuthStatusParams{
				SettingID: rec.ID,
				Status:    ConnectionStatusPending,
				LastError: "",
			}); updateErr != nil {
				return nil, bkerr.Internal("update pending oauth state: "+updateErr.Error(), updateErr)
			}
			return s.Get(ctx, principal, rec.ID)
		default:
			if _, updateErr := s.oauthStore.UpdateStatus(ctx, db.UpdateProviderOAuthStatusParams{
				SettingID: rec.ID,
				Status:    ConnectionStatusError,
				LastError: errMsg,
			}); updateErr != nil {
				return nil, bkerr.Internal("update oauth error state: "+updateErr.Error(), updateErr)
			}
			return s.Get(ctx, principal, rec.ID)
		}
	}

	subject, email := claimsFromIDToken(token.IDToken)
	expiresAt := time.Time{}
	if token.ExpiresIn > 0 {
		expiresAt = time.Now().UTC().Add(time.Duration(token.ExpiresIn) * time.Second)
	}
	if _, err := s.oauthStore.UpdateConnected(ctx, db.UpdateProviderOAuthConnectedParams{
		SettingID:        rec.ID,
		Status:           ConnectionStatusConnected,
		AccessToken:      token.AccessToken,
		RefreshToken:     token.RefreshToken,
		IDToken:          token.IDToken,
		Scope:            token.Scope,
		Subject:          subject,
		AccountEmail:     email,
		ExpiresAt:        expiresAt,
		LastError:        "",
		ClearPendingFlow: true,
	}); err != nil {
		return nil, bkerr.Internal("store oauth token: "+err.Error(), err)
	}
	return s.Get(ctx, principal, rec.ID)
}

func (s *LocalProvider) DisconnectOAuth(ctx context.Context, principal *backendauth.Principal, id string) (*ProviderSetting, error) {
	rec, err := s.requireOAuthSetting(ctx, principal, id)
	if err != nil {
		return nil, err
	}
	if s.oauthStore == nil {
		return nil, bkerr.Unavailable("oauth store not configured", nil)
	}
	if err := s.oauthStore.DeleteBySettingID(ctx, rec.ID); err != nil {
		return nil, bkerr.Internal("disconnect oauth connection: "+err.Error(), err)
	}
	return s.Get(ctx, principal, rec.ID)
}

// GetDecryptedAPIKey returns the plaintext API key for internal runtime use.
func (s *LocalProvider) GetDecryptedAPIKey(ctx context.Context, principal *backendauth.Principal, id string) (string, error) {
	if s == nil || s.store == nil {
		return "", bkerr.Unavailable("settings store not configured", nil)
	}
	rec, err := s.store.GetByID(ctx, id)
	if err != nil {
		return "", bkerr.NotFound("provider setting not found", err)
	}
	if err := s.checkAccess(principal, rec); err != nil {
		return "", err
	}
	if normalizeAuthKind(rec.Provider, rec.AuthKind) != AuthKindAPIKey {
		return "", bkerr.InvalidInput("provider setting is not using api_key auth", nil)
	}
	key, err := s.store.GetDecryptedAPIKey(ctx, id)
	if err != nil {
		return "", bkerr.Internal("decrypt api key: "+err.Error(), err)
	}
	return key, nil
}

func (s *LocalProvider) ResolveRuntimeConfig(ctx context.Context, principal *backendauth.Principal, id string) (*ResolvedProviderConfig, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("settings store not configured", nil)
	}
	rec, err := s.store.GetByID(ctx, id)
	if err != nil {
		return nil, bkerr.NotFound("provider setting not found", err)
	}
	if err := s.checkAccess(principal, rec); err != nil {
		return nil, err
	}

	config := &ResolvedProviderConfig{
		SettingID: rec.ID,
		Provider:  rec.Provider,
		AuthKind:  normalizeAuthKind(rec.Provider, rec.AuthKind),
		BaseURL:   rec.BaseURL,
		ModelID:   rec.ModelID,
	}

	switch config.AuthKind {
	case AuthKindNone:
		return config, nil
	case AuthKindAPIKey:
		key, err := s.store.GetDecryptedAPIKey(ctx, rec.ID)
		if err != nil {
			return nil, bkerr.Internal("decrypt api key: "+err.Error(), err)
		}
		if strings.TrimSpace(key) == "" {
			return nil, bkerr.InvalidInput("provider setting has no api key", nil)
		}
		config.Secret = key
		return config, nil
	case AuthKindOAuth:
		accessToken, err := s.resolveOAuthAccessToken(ctx, rec)
		if err != nil {
			return nil, err
		}
		config.Secret = accessToken
		return config, nil
	default:
		return nil, bkerr.InvalidInput("unsupported auth kind", nil)
	}
}

func (s *LocalProvider) resolveOAuthAccessToken(ctx context.Context, rec *db.ProviderSetting) (string, error) {
	if s.oauthStore == nil {
		return "", bkerr.Unavailable("oauth store not configured", nil)
	}
	secret, err := s.oauthStore.GetSecret(ctx, rec.ID)
	if err != nil {
		// For Codex, fall back to the Codex CLI auth file (~/.codex/auth.json).
		// The CLI token is issued for the same OAuth client and is directly usable.
		if rec.Provider == "codex" {
			if token, fallbackErr := codexCLIAccessToken(); fallbackErr == nil && token != "" {
				return token, nil
			}
		}
		return "", bkerr.InvalidInput("provider oauth connection not found", err)
	}
	if strings.TrimSpace(secret.AccessToken) == "" {
		return "", bkerr.InvalidInput("provider oauth connection is not completed", nil)
	}
	if secret.ExpiresAt.IsZero() || time.Until(secret.ExpiresAt) > 5*time.Minute {
		return secret.AccessToken, nil
	}
	if strings.TrimSpace(secret.RefreshToken) == "" {
		return "", bkerr.InvalidInput("provider oauth token expired and cannot be refreshed", nil)
	}

	client, err := s.oauthFactory.NewClient(rec.Provider)
	if err != nil {
		return "", bkerr.InvalidInput(err.Error(), err)
	}
	token, err := client.RefreshToken(ctx, secret.RefreshToken)
	if err != nil {
		_, _ = s.oauthStore.UpdateStatus(ctx, db.UpdateProviderOAuthStatusParams{
			SettingID: rec.ID,
			Status:    ConnectionStatusExpired,
			LastError: err.Error(),
		})
		return "", bkerr.Internal("refresh oauth token: "+err.Error(), err)
	}

	subject, email := secret.Subject, secret.AccountEmail
	if token.IDToken != "" {
		tokenSubject, tokenEmail := claimsFromIDToken(token.IDToken)
		if tokenSubject != "" {
			subject = tokenSubject
		}
		if tokenEmail != "" {
			email = tokenEmail
		}
	}
	expiresAt := time.Time{}
	if token.ExpiresIn > 0 {
		expiresAt = time.Now().UTC().Add(time.Duration(token.ExpiresIn) * time.Second)
	}
	if _, err := s.oauthStore.UpdateConnected(ctx, db.UpdateProviderOAuthConnectedParams{
		SettingID:        rec.ID,
		Status:           ConnectionStatusConnected,
		AccessToken:      token.AccessToken,
		RefreshToken:     firstNonEmpty(token.RefreshToken, secret.RefreshToken),
		IDToken:          firstNonEmpty(token.IDToken, secret.IDToken),
		Scope:            firstNonEmpty(token.Scope, secret.Scope),
		Subject:          subject,
		AccountEmail:     email,
		ExpiresAt:        expiresAt,
		LastError:        "",
		ClearPendingFlow: false,
	}); err != nil {
		return "", bkerr.Internal("persist refreshed oauth token: "+err.Error(), err)
	}
	return token.AccessToken, nil
}

func (s *LocalProvider) requireOAuthSetting(ctx context.Context, principal *backendauth.Principal, id string) (*db.ProviderSetting, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("settings store not configured", nil)
	}
	rec, err := s.store.GetByID(ctx, id)
	if err != nil {
		return nil, bkerr.NotFound("provider setting not found", err)
	}
	if err := s.checkAccess(principal, rec); err != nil {
		return nil, err
	}
	if normalizeAuthKind(rec.Provider, rec.AuthKind) != AuthKindOAuth {
		return nil, bkerr.InvalidInput("provider setting is not using oauth auth", nil)
	}
	if err := validateAuthKind(rec.Provider, rec.AuthKind); err != nil {
		return nil, err
	}
	return rec, nil
}

// ResolveDefaultForUser resolves credentials for the user's default provider
// setting. Returns (nil, nil) when no default is configured — not an error.
func (s *LocalProvider) ResolveDefaultForUser(ctx context.Context, principal *backendauth.Principal) (*ResolvedProviderConfig, error) {
	if s == nil || s.store == nil || principal == nil {
		return nil, nil
	}
	rec, err := s.store.GetDefaultByUserID(ctx, principal.User.ID)
	if err != nil {
		return nil, bkerr.Internal("get default provider: "+err.Error(), err)
	}
	if rec == nil {
		return nil, nil
	}
	return s.ResolveRuntimeConfig(ctx, principal, rec.ID)
}

// ResolveDefaultForUserID resolves credentials for a user's default provider by
// user ID alone. Intended for internal daemon callbacks — bypasses principal checks.
func (s *LocalProvider) ResolveDefaultForUserID(ctx context.Context, userID string) (*ResolvedProviderConfig, error) {
	if s == nil || s.store == nil || userID == "" {
		return nil, nil
	}
	rec, err := s.store.GetDefaultByUserID(ctx, userID)
	if err != nil {
		return nil, bkerr.Internal("get default provider: "+err.Error(), err)
	}
	if rec == nil {
		return nil, nil
	}
	config := &ResolvedProviderConfig{
		SettingID: rec.ID,
		Provider:  rec.Provider,
		AuthKind:  normalizeAuthKind(rec.Provider, rec.AuthKind),
		BaseURL:   rec.BaseURL,
		ModelID:   rec.ModelID,
	}
	switch config.AuthKind {
	case AuthKindAPIKey:
		key, err := s.store.GetDecryptedAPIKey(ctx, rec.ID)
		if err != nil {
			return nil, bkerr.Internal("decrypt api key: "+err.Error(), err)
		}
		config.Secret = key
	case AuthKindOAuth:
		// OAuth access tokens require a live HTTP round-trip. Not available for
		// daemon use — callers should fall back to env-based config.
		token, _ := s.resolveOAuthAccessToken(ctx, rec)
		config.Secret = token
	}
	return config, nil
}

func (s *LocalProvider) checkAccess(principal *backendauth.Principal, rec *db.ProviderSetting) error {
	if principal == nil {
		return bkerr.Unauthorized("authentication required", nil)
	}
	if rec.UserID != principal.User.ID {
		return bkerr.Forbidden("provider setting belongs to another user", nil)
	}
	return nil
}

func (s *LocalProvider) enrichSetting(ctx context.Context, record db.ProviderSetting) (*ProviderSetting, error) {
	var oauthConn db.ProviderOAuthConnection
	if s.oauthStore != nil && normalizeAuthKind(record.Provider, record.AuthKind) == AuthKindOAuth {
		conn, err := s.oauthStore.GetBySettingID(ctx, record.ID)
		if err == nil {
			oauthConn = *conn
		}
	}
	return settingFromDB(record, oauthConn), nil
}

func settingFromDB(r db.ProviderSetting, oauthConn db.ProviderOAuthConnection) *ProviderSetting {
	result := &ProviderSetting{
		ID:        r.ID,
		UserID:    r.UserID,
		Provider:  r.Provider,
		Name:      r.Name,
		AuthKind:  normalizeAuthKind(r.Provider, r.AuthKind),
		BaseURL:   r.BaseURL,
		ModelID:   r.ModelID,
		HasAPIKey: r.HasAPIKey,
		IsDefault: r.IsDefault,
		CreatedAt: r.CreatedAt,
		UpdatedAt: r.UpdatedAt,
	}

	switch result.AuthKind {
	case AuthKindNone:
		result.ConnectionStatus = ConnectionStatusReady
	case AuthKindAPIKey:
		if r.HasAPIKey {
			result.ConnectionStatus = ConnectionStatusReady
		} else {
			result.ConnectionStatus = ConnectionStatusMissingCredentials
		}
	case AuthKindOAuth:
		result.ConnectionStatus = oauthConn.Status
		if result.ConnectionStatus == "" {
			result.ConnectionStatus = ConnectionStatusNotConnected
		}
		if result.ConnectionStatus == ConnectionStatusConnected && !oauthConn.ExpiresAt.IsZero() && time.Now().UTC().After(oauthConn.ExpiresAt) {
			result.ConnectionStatus = ConnectionStatusExpired
		}
		result.LastError = oauthConn.LastError
		result.OAuthAccountEmail = oauthConn.AccountEmail
		result.OAuthSubject = oauthConn.Subject
		result.OAuthExpiresAt = oauthConn.ExpiresAt
	default:
		result.ConnectionStatus = ConnectionStatusError
		result.LastError = "unsupported auth kind"
	}

	return result
}

func normalizeAuthKind(provider, authKind string) string {
	authKind = strings.TrimSpace(authKind)
	if authKind != "" {
		return authKind
	}
	if strings.EqualFold(strings.TrimSpace(provider), "ollama") {
		return AuthKindNone
	}
	return AuthKindAPIKey
}

func validateAuthKind(provider, authKind string) error {
	switch authKind {
	case AuthKindNone, AuthKindAPIKey:
		return nil
	case AuthKindOAuth:
		if supportsOAuthProvider(provider) {
			return nil
		}
		return bkerr.InvalidInput(fmt.Sprintf("provider %s does not support oauth connections yet", provider), nil)
	default:
		return bkerr.InvalidInput("unsupported auth_kind", nil)
	}
}

func supportsOAuthProvider(provider string) bool {
	switch strings.TrimSpace(strings.ToLower(provider)) {
	case "openai", "codex":
		return true
	default:
		return false
	}
}

func claimsFromIDToken(idToken string) (string, string) {
	parts := strings.Split(idToken, ".")
	if len(parts) < 2 {
		return "", ""
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", ""
	}
	var claims struct {
		Sub   string `json:"sub"`
		Email string `json:"email"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return "", ""
	}
	return claims.Sub, claims.Email
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

// codexCLIAccessToken reads the access token from the Codex CLI auth file
// (~/.codex/auth.json). Returns the token if present and not expired.
func codexCLIAccessToken() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(filepath.Join(home, ".codex", "auth.json"))
	if err != nil {
		return "", err
	}
	var f struct {
		Tokens struct {
			AccessToken string `json:"access_token"`
		} `json:"tokens"`
	}
	if err := json.Unmarshal(data, &f); err != nil {
		return "", err
	}
	token := strings.TrimSpace(f.Tokens.AccessToken)
	if token == "" {
		return "", fmt.Errorf("no access_token in ~/.codex/auth.json")
	}
	// Quick expiry check via JWT payload.
	parts := strings.Split(token, ".")
	if len(parts) == 3 {
		payload, decErr := base64.RawURLEncoding.DecodeString(parts[1])
		if decErr == nil {
			var claims struct {
				Exp int64 `json:"exp"`
			}
			if json.Unmarshal(payload, &claims) == nil && claims.Exp > 0 {
				if time.Until(time.Unix(claims.Exp, 0)) < 5*time.Minute {
					return "", fmt.Errorf("codex CLI token expires in less than 5 minutes")
				}
			}
		}
	}
	return token, nil
}
