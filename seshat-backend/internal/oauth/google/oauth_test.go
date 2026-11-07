package google

import (
	"strings"
	"testing"
)

func TestNeedsBothTheClientIDAndItsSecret(t *testing.T) {
	cases := []struct{ id, secret string }{{"", ""}, {"id", ""}, {"", "secret"}, {"  ", "secret"}, {"id", "   "}}
	for _, c := range cases {
		t.Setenv("GOOGLE_OAUTH_CLIENT_ID", c.id)
		t.Setenv("GOOGLE_OAUTH_CLIENT_SECRET", c.secret)
		if IsConfigured() {
			t.Errorf("id %q and secret %q: not configured", c.id, c.secret)
		}
		if _, err := BaseConfig([]string{"scope"}); err == nil {
			t.Errorf("id %q and secret %q: no configuration may be built", c.id, c.secret)
		}
	}
}

func TestTheConfigurationIsGoogleTheClientIsSharedAndTheRedirectIsLeftToTheCaller(t *testing.T) {
	t.Setenv("GOOGLE_OAUTH_CLIENT_ID", " the-id ")
	t.Setenv("GOOGLE_OAUTH_CLIENT_SECRET", " the-secret ")
	if !IsConfigured() {
		t.Fatal("an id and a secret are enough")
	}
	config, err := BaseConfig([]string{"https://www.googleapis.com/auth/gmail.readonly"})
	if err != nil {
		t.Fatal(err)
	}
	if config.ClientID != "the-id" || config.ClientSecret != "the-secret" {
		t.Errorf("the values are trimmed, got %q and %q", config.ClientID, config.ClientSecret)
	}
	if !strings.HasPrefix(config.Endpoint.AuthURL, "https://accounts.google.com/") || !strings.HasPrefix(config.Endpoint.TokenURL, "https://") {
		t.Errorf("the endpoints are those of Google over https, got %+v", config.Endpoint)
	}
	if config.RedirectURL != "" {
		t.Error("the redirect address depends on the port the local server got: the caller fills it in")
	}
	if len(config.Scopes) != 1 {
		t.Errorf("the scopes are the connector's own, got %v", config.Scopes)
	}
}
