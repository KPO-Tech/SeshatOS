package settings

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/KPO-Tech/seshat-runtime/pkg/providers"
)

// What a key check found. Only "rejected" is a verdict on the key: the others say the provider could not be asked, or answered in a way
// this check does not understand, and the caller decides whether to save anyway.
const (
	KeyOK          = "ok"
	KeyRejected    = "rejected"
	KeyUnreachable = "unreachable"
	KeyUnchecked   = "unchecked"
)

type KeyCheck struct {
	Status  string `json:"status"`
	Message string `json:"message,omitempty"`
}

// keyChecked lists the providers whose models route answers 401 or 403 to a bad key and 200 to a good one with the headers sent below.
// For the others a refusal can only mean the check asked the wrong way, so it is not taken for a verdict.
var keyChecked = map[string]bool{
	"anthropic": true, "openai": true, "openrouter": true, "mistral": true, "deepseek": true,
	"z-ai": true, "kimi": true, "minimax": true, "opencode": true,
}

var versionedBase = regexp.MustCompile(`/v\d+[a-z0-9]*$`)

func modelsRoute(provider, baseURL string) string {
	if provider == "ollama" {
		return baseURL + "/api/tags"
	}
	if versionedBase.MatchString(baseURL) {
		return baseURL + "/models"
	}
	return baseURL + "/v1/models"
}

// CheckProviderKey asks the provider for its model list with the key, which is the cheapest call that needs one, and says what came back.
// Nothing is stored and the key appears in no message.
func CheckProviderKey(ctx context.Context, client *http.Client, provider, baseURL, apiKey string) KeyCheck {
	provider = CanonicalProvider(provider)
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = providers.DefaultBaseURL(provider)
	}
	if baseURL == "" {
		return KeyCheck{Status: KeyUnchecked, Message: "This provider has no address to check the key against."}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, modelsRoute(provider, baseURL), nil)
	if err != nil {
		return KeyCheck{Status: KeyUnreachable, Message: "The provider address is not valid."}
	}
	switch {
	case apiKey == "":
	case provider == "anthropic":
		req.Header.Set("x-api-key", apiKey)
		req.Header.Set("anthropic-version", "2023-06-01")
	default:
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		host := baseURL
		if u, perr := url.Parse(baseURL); perr == nil && u.Host != "" {
			host = u.Host
		}
		return KeyCheck{Status: KeyUnreachable, Message: fmt.Sprintf("Could not reach %s.", host)}
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusOK:
		return KeyCheck{Status: KeyOK}
	case (resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden) && keyChecked[provider]:
		return KeyCheck{Status: KeyRejected, Message: "The provider rejected this key."}
	default:
		return KeyCheck{Status: KeyUnchecked, Message: fmt.Sprintf("The provider answered with status %d, so the key could not be checked.", resp.StatusCode)}
	}
}
