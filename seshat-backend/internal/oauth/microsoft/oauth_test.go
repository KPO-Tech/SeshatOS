package microsoft

import (
	"strings"
	"testing"
)

func TestNotConfiguredWithoutAClientID(t *testing.T) {
	t.Setenv("MICROSOFT_OAUTH_CLIENT_ID", "")
	if IsConfigured() {
		t.Fatal("no client id: not configured")
	}
	if _, err := BaseConfig([]string{"Sites.Read.All"}); err == nil {
		t.Fatal("a configuration must not be built without a client id")
	}
	t.Setenv("MICROSOFT_OAUTH_CLIENT_ID", "   ")
	if IsConfigured() {
		t.Fatal("a client id of spaces is not a client id")
	}
}

// The registration must be a public client: Entra ID refuses a secret at the redemption of the code, and PKCE replaces it. A secret that
// happened to be in the environment must never be sent.
func TestThePublicClientNeverCarriesASecret(t *testing.T) {
	t.Setenv("MICROSOFT_OAUTH_CLIENT_ID", " the-client-id ")
	t.Setenv("MICROSOFT_OAUTH_CLIENT_SECRET", "must-not-be-used")
	if !IsConfigured() {
		t.Fatal("a client id is enough")
	}
	config, err := BaseConfig([]string{"Sites.Read.All", "offline_access"})
	if err != nil {
		t.Fatal(err)
	}
	if config.ClientID != "the-client-id" {
		t.Errorf("the client id is trimmed, got %q", config.ClientID)
	}
	if config.ClientSecret != "" {
		t.Error("a public client presents no secret: PKCE takes its place")
	}
	if config.RedirectURL != "" {
		t.Error("the redirect address is filled in by the caller, from the port of the running server")
	}
	if len(config.Scopes) != 2 || config.Scopes[0] != "Sites.Read.All" {
		t.Errorf("scopes are the caller's, got %v", config.Scopes)
	}
}

// "organizations" means work and school accounts of any tenant, never a personal account, and never a tenant named at deploy time.
func TestTheEndpointsAreThoseOfWorkAndSchoolAccounts(t *testing.T) {
	t.Setenv("MICROSOFT_OAUTH_CLIENT_ID", "id")
	config, err := BaseConfig(nil)
	if err != nil {
		t.Fatal(err)
	}
	for name, endpoint := range map[string]string{"authorize": config.Endpoint.AuthURL, "token": config.Endpoint.TokenURL} {
		if !strings.HasPrefix(endpoint, "https://login.microsoftonline.com/organizations/oauth2/v2.0/") {
			t.Errorf("the %s endpoint must be the organizations tenant over https, got %q", name, endpoint)
		}
	}
}
