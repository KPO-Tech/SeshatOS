package settings

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A stand-in for FreeLLMAPI: it wants the unified key, and without ?available=true it answers with its whole catalogue, most of it
// waiting for a key, as the real router does.
func fakeFreeLLMAPI(t *testing.T) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer freellmapi-good" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Query().Get("available") == "true" {
			_, _ = w.Write([]byte(`{"object":"list","data":[
				{"id":"mock-small","name":"Mock small","context_window":null,"available":true},
				{"id":"auto","name":"Auto (router picks the best available model)","context_window":null,"available":true},
				{"id":"gemini-flash","name":"Gemini Flash","context_window":1000000,"available":true},
				{"id":"keyless","name":"No key","available":false}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"object":"list","data":[{"id":"keyless","available":false},{"id":"mock-small","available":true},{"id":"other","available":false}]}`))
	}))
	t.Cleanup(server.Close)
	return server
}

func TestFreeLLMAPIIsHandedToTheRuntimeAsAnOpenAICompatibleServer(t *testing.T) {
	for _, name := range []string{"freellmapi", " FreeLLMAPI "} {
		if !IsFreeLLMAPI(name) || RuntimeProvider(name) != "openai" {
			t.Errorf("%q: IsFreeLLMAPI=%v RuntimeProvider=%q", name, IsFreeLLMAPI(name), RuntimeProvider(name))
		}
	}
	if IsFreeLLMAPI("openai") || RuntimeProvider("Anthropic") != "anthropic" {
		t.Error("another provider must keep its own name")
	}
}

func TestTheAddressOfFreeLLMAPIDefaultsToItsDesktopApplication(t *testing.T) {
	if got := EffectiveBaseURL("freellmapi", ""); got != FreeLLMAPIDefaultBaseURL {
		t.Errorf("default = %q", got)
	}
	if got := EffectiveBaseURL("freellmapi", " http://127.0.0.1:3001/v1/ "); got != "http://127.0.0.1:3001/v1" {
		t.Errorf("given address = %q", got)
	}
	if got := EffectiveBaseURL("openai", ""); got != "" {
		t.Errorf("another provider keeps the address of the runtime, got %q", got)
	}
}

func TestFreeLLMAPIIsInTheMainListOfProviders(t *testing.T) {
	var found *CatalogEntry
	seenMore := false
	for _, entry := range Catalog() {
		if entry.Main && seenMore {
			t.Fatalf("main provider %s comes after the catalog ones", entry.ID)
		}
		if !entry.Main {
			seenMore = true
		}
		if entry.ID == FreeLLMAPIProvider {
			e := entry
			found = &e
		}
	}
	if found == nil {
		t.Fatal("FreeLLMAPI is not in the catalogue")
	}
	if !found.Main || found.AuthType != "api_key" || found.BaseURL != FreeLLMAPIDefaultBaseURL || found.Unverified {
		t.Errorf("entry = %+v", *found)
	}
}

func TestOnlyTheModelsTheRouterCanServeAreListedAndAutoIsFirst(t *testing.T) {
	server := fakeFreeLLMAPI(t)
	models, err := FetchFreeLLMAPIModels(context.Background(), server.Client(), server.URL+"/v1", "freellmapi-good")
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, m := range models {
		ids = append(ids, m.ID)
	}
	if strings.Join(ids, ",") != "auto,mock-small,gemini-flash" {
		t.Fatalf("models = %v", ids)
	}
	if models[2].ContextWindow != 1000000 || models[1].ContextWindow != 0 {
		t.Errorf("context windows = %+v", models)
	}
}

func TestTheModelsOfARouterThatCannotBeReadAreSaidInWords(t *testing.T) {
	server := fakeFreeLLMAPI(t)
	if _, err := FetchFreeLLMAPIModels(context.Background(), server.Client(), server.URL+"/v1", "wrong"); err == nil || !strings.Contains(err.Error(), "refused the key") {
		t.Errorf("wrong key: %v", err)
	}
	if _, err := FetchFreeLLMAPIModels(context.Background(), http.DefaultClient, "http://127.0.0.1:1/v1", "freellmapi-good"); err == nil || !strings.Contains(err.Error(), "is it running") {
		t.Errorf("router not running: %v", err)
	}
}

func TestTheKeyOfFreeLLMAPIIsCheckedAgainstItsOwnAddress(t *testing.T) {
	server := fakeFreeLLMAPI(t)
	if got := CheckProviderKey(context.Background(), server.Client(), "freellmapi", server.URL+"/v1", "freellmapi-good"); got.Status != KeyOK {
		t.Errorf("good key: %+v", got)
	}
	if got := CheckProviderKey(context.Background(), server.Client(), "freellmapi", server.URL+"/v1", "wrong"); got.Status != KeyRejected {
		t.Errorf("wrong key: %+v", got)
	}
}
