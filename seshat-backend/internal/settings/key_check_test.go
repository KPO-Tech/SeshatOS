package settings

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func providerThatAccepts(t *testing.T, header, value string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get(header) != value {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	t.Cleanup(server.Close)
	return server
}

func TestAGoodKeyIsAccepted(t *testing.T) {
	server := providerThatAccepts(t, "Authorization", "Bearer sk-good")
	got := CheckProviderKey(context.Background(), server.Client(), "openai", server.URL, "sk-good")
	if got.Status != KeyOK {
		t.Fatalf("got %+v, want ok", got)
	}
}

func TestAnthropicIsAskedWithItsOwnHeader(t *testing.T) {
	server := providerThatAccepts(t, "x-api-key", "sk-ant-good")
	if got := CheckProviderKey(context.Background(), server.Client(), "anthropic", server.URL, "sk-ant-good"); got.Status != KeyOK {
		t.Fatalf("good key: got %+v, want ok", got)
	}
	if got := CheckProviderKey(context.Background(), server.Client(), "anthropic", server.URL, "sk-ant-bad"); got.Status != KeyRejected {
		t.Fatalf("bad key: got %+v, want rejected", got)
	}
}

func TestARefusalIsOnlyAVerdictForProvidersThatAreKnownToAnswerSo(t *testing.T) {
	server := providerThatAccepts(t, "Authorization", "Bearer sk-good")
	if got := CheckProviderKey(context.Background(), server.Client(), "openai", server.URL, "sk-bad"); got.Status != KeyRejected {
		t.Fatalf("known provider: got %+v, want rejected", got)
	}
	if got := CheckProviderKey(context.Background(), server.Client(), "google", server.URL, "sk-bad"); got.Status != KeyUnchecked {
		t.Fatalf("other provider: got %+v, want unchecked", got)
	}
}

func TestAProviderThatCannotBeReachedIsNotAVerdictOnTheKey(t *testing.T) {
	server := httptest.NewServer(http.NotFoundHandler())
	url := server.URL
	server.Close()
	got := CheckProviderKey(context.Background(), http.DefaultClient, "openai", url, "sk-good")
	if got.Status != KeyUnreachable {
		t.Fatalf("got %+v, want unreachable", got)
	}
}

func TestOllamaIsAskedForItsTags(t *testing.T) {
	var path string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		_, _ = w.Write([]byte(`{"models":[]}`))
	}))
	t.Cleanup(server.Close)
	if got := CheckProviderKey(context.Background(), server.Client(), "ollama", server.URL, ""); got.Status != KeyOK || path != "/api/tags" {
		t.Fatalf("got %+v on %q, want ok on /api/tags", got, path)
	}
}

func TestAVersionedAddressGetsItsModelsRoute(t *testing.T) {
	if got := modelsRoute("groq", "https://api.groq.com/openai/v1"); got != "https://api.groq.com/openai/v1/models" {
		t.Fatalf("got %q", got)
	}
	if got := modelsRoute("openai", "https://api.openai.com"); got != "https://api.openai.com/v1/models" {
		t.Fatalf("got %q", got)
	}
}

func TestTheKeyIsNotInTheMessage(t *testing.T) {
	server := providerThatAccepts(t, "Authorization", "Bearer other")
	got := CheckProviderKey(context.Background(), server.Client(), "openai", server.URL, "sk-secret-value")
	if got.Message == "" || strings.Contains(got.Message, "sk-secret-value") {
		t.Fatalf("message %q must say something and not carry the key", got.Message)
	}
}
