package api

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	backendsettings "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/settings"
	audioproviders "github.com/KPO-Tech/seshat-runtime/pkg/audio/providers"
	"github.com/KPO-Tech/seshat-runtime/pkg/sdk"
)

func newTranscribeRequest(t *testing.T, token string) *http.Request {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, err := mw.CreateFormFile("audio", "clip.webm")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := fw.Write([]byte("fake-audio-bytes")); err != nil {
		t.Fatalf("write audio: %v", err)
	}
	mw.Close()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/transcribe", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return req
}

func TestHandleTranscribeRequiresAuth(t *testing.T) {
	fx := newSecurityTestFixture(t)
	req := newTranscribeRequest(t, "")
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)
	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestHandleTranscribeRequiresAudioField(t *testing.T) {
	fx := newSecurityTestFixture(t)
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	mw.Close()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/transcribe", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for a missing audio field, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestHandleTranscribeRequiresATranscribableProvider(t *testing.T) {
	fx := newSecurityTestFixture(t)
	// No provider settings configured for this user at all.
	req := newTranscribeRequest(t, fx.adminToken)
	resp := httptest.NewRecorder()
	fx.router.ServeHTTP(resp, req)
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when no transcribable provider is configured, got %d: %s", resp.Code, resp.Body.String())
	}
}

func TestHandleTranscribeReturnsTranscript(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings.test", "adminpass")
	createProviderSettingWithKeyForTest(t, router, token, "openai", "My OpenAI", "sk-test-key")

	var gotTarget transcriptionTarget
	app.transcribeAudio = func(ctx context.Context, target transcriptionTarget, audioData []byte) (*sdk.TranscriptionResult, error) {
		gotTarget = target
		return &sdk.TranscriptionResult{Text: "hello from the test", Language: "en", Duration: 2.5}, nil
	}

	req := newTranscribeRequest(t, token)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.Code, resp.Body.String())
	}
	var payload map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload["text"] != "hello from the test" {
		t.Fatalf("expected the transcript text, got %+v", payload)
	}
	if gotTarget.apiKey != "sk-test-key" {
		t.Fatalf("expected the configured OpenAI key to be used, got %q", gotTarget.apiKey)
	}
	if gotTarget.provider != "openai" || gotTarget.baseURL == "" || gotTarget.model == "" {
		t.Fatalf("expected the audio catalog's OpenAI endpoint and default model, got %+v", gotTarget)
	}
	if gotTarget.elevenLabs {
		t.Fatalf("expected an OpenAI-compatible target, got %+v", gotTarget)
	}
}

func TestHandleTranscribePrefersLocalWhisperServer(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings.test", "adminpass")
	// Deliberately no OpenAI provider configured - proves the local path
	// doesn't fall back to (or need) one.

	sttDB, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "local-stt-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { sttDB.Close() })
	localSTTStore, err := db.NewLocalSTTConfigStore(sttDB)
	if err != nil {
		t.Fatalf("NewLocalSTTConfigStore: %v", err)
	}
	if _, err := localSTTStore.Upsert(context.Background(), db.UpsertLocalSTTConfigParams{
		BaseURL: "http://127.0.0.1:7890",
		Enabled: true,
	}); err != nil {
		t.Fatalf("upsert local stt config: %v", err)
	}
	app.localSTTStore = localSTTStore

	var gotTarget transcriptionTarget
	app.transcribeAudio = func(ctx context.Context, target transcriptionTarget, audioData []byte) (*sdk.TranscriptionResult, error) {
		gotTarget = target
		return &sdk.TranscriptionResult{Text: "local transcript"}, nil
	}

	req := newTranscribeRequest(t, token)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.Code, resp.Body.String())
	}
	if gotTarget.baseURL != "http://127.0.0.1:7890" {
		t.Fatalf("expected the local whisper-server URL to be used, got %q", gotTarget.baseURL)
	}
	if gotTarget.apiKey != "" {
		t.Fatalf("expected no API key to be needed for the local server, got %q", gotTarget.apiKey)
	}
}

func TestHandleTranscribePropagatesTranscriptionFailure(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings.test", "adminpass")
	createProviderSettingWithKeyForTest(t, router, token, "openai", "My OpenAI", "sk-test-key")
	app.transcribeAudio = func(ctx context.Context, target transcriptionTarget, audioData []byte) (*sdk.TranscriptionResult, error) {
		return nil, errTranscribeTest
	}

	req := newTranscribeRequest(t, token)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	if resp.Code != http.StatusBadGateway {
		t.Fatalf("expected 502 when the transcription call fails, got %d: %s", resp.Code, resp.Body.String())
	}
}

// A provider other than OpenAI is a transcription target too, as long as the
// runtime's audio catalog has a speech-to-text profile for it. Groq is the
// one that used to be refused outright.
func TestHandleTranscribeAcceptsNonOpenAIProvider(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings.test", "adminpass")
	createProviderSettingWithKeyForTest(t, router, token, "groq", "My Groq", "gsk-test-key")

	var gotTarget transcriptionTarget
	app.transcribeAudio = func(ctx context.Context, target transcriptionTarget, audioData []byte) (*sdk.TranscriptionResult, error) {
		gotTarget = target
		return &sdk.TranscriptionResult{Text: "transcribed by groq"}, nil
	}

	req := newTranscribeRequest(t, token)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200 with a Groq provider configured, got %d: %s", resp.Code, resp.Body.String())
	}
	if gotTarget.apiKey != "gsk-test-key" {
		t.Fatalf("expected the configured Groq key, got %q", gotTarget.apiKey)
	}
	if gotTarget.provider != "groq" {
		t.Fatalf("expected the groq profile to be used, got %+v", gotTarget)
	}
	if gotTarget.baseURL == "" || gotTarget.model == "" {
		t.Fatalf("expected the catalog's endpoint and default model, got %+v", gotTarget)
	}
	if gotTarget.elevenLabs {
		t.Fatalf("expected an OpenAI-compatible target, got %+v", gotTarget)
	}
}

// The provider linked for the audio capability is an explicit opt-in, so it
// must win over whichever order the settings come back in - here the OpenAI
// setting is created first and would otherwise be picked.
func TestHandleTranscribePrefersProviderLinkedForAudio(t *testing.T) {
	app, _ := newSettingsTestApp(t, nil)
	router := CreateRouter(defaultAPIConfig, app)
	token := loginAs(t, router, "admin@settings.test", "adminpass")
	createProviderSettingWithKeyForTest(t, router, token, "openai", "My OpenAI", "sk-test-key")
	groqID := createProviderSettingWithKeyForTest(t, router, token, "groq", "My Groq", "gsk-test-key")

	// newSettingsTestApp doesn't wire a capability-link store, so this opens
	// one and assigns it - the same way the local whisper-server test above
	// assigns app.localSTTStore.
	linkDB, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "capability-links-test.db")))
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(func() { linkDB.Close() })
	linkStore, err := db.NewCapabilityLinkStore(linkDB)
	if err != nil {
		t.Fatalf("NewCapabilityLinkStore: %v", err)
	}
	if err := linkStore.Set(context.Background(), string(backendsettings.CapabilityAudio), groqID); err != nil {
		t.Fatalf("link the audio provider: %v", err)
	}
	app.capabilityLinkStore = linkStore

	var gotTarget transcriptionTarget
	app.transcribeAudio = func(ctx context.Context, target transcriptionTarget, audioData []byte) (*sdk.TranscriptionResult, error) {
		gotTarget = target
		return &sdk.TranscriptionResult{Text: "transcribed by the linked provider"}, nil
	}

	req := newTranscribeRequest(t, token)
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	if resp.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", resp.Code, resp.Body.String())
	}
	if gotTarget.provider != "groq" {
		t.Fatalf("expected the provider linked for audio, got %+v", gotTarget)
	}
}

// transcriptionTargetForProvider reads the catalog rather than a list kept in
// this repo, so the test states the property (every profile with a
// speech-to-text direction is usable, nothing else is) instead of copying
// provider names and endpoints a second time.
func TestTranscriptionTargetForProviderFollowsAudioCatalog(t *testing.T) {
	profiles := audioproviders.Profiles()
	if len(profiles) == 0 {
		t.Fatal("expected the runtime's audio catalog to be non-empty")
	}

	transcribable := 0
	for _, profile := range profiles {
		target, ok := transcriptionTargetForProvider(profile.ID)
		if profile.STT == nil {
			if ok {
				t.Fatalf("expected %s to have no transcription target (no STT capability)", profile.ID)
			}
			continue
		}
		transcribable++
		if !ok {
			t.Fatalf("expected %s to be transcribable", profile.ID)
		}
		if target.provider != profile.ID || target.baseURL != profile.BaseURL {
			t.Fatalf("expected the catalog's own provider and endpoint for %s, got %+v", profile.ID, target)
		}
		if target.model != profile.STT.DefaultModel() {
			t.Fatalf("expected %s's default model, got %q", profile.ID, target.model)
		}
		if target.format != profile.STTResponseFormat {
			t.Fatalf("expected %s's response format, got %q", profile.ID, target.format)
		}
		if target.elevenLabs != (profile.API == audioproviders.APIElevenLabs) {
			t.Fatalf("expected %s's wire protocol to be honoured, got %+v", profile.ID, target)
		}
	}

	if transcribable == 0 {
		t.Fatal("expected at least one profile to offer speech-to-text")
	}

	// Case-insensitive, like the catalog itself.
	if _, ok := transcriptionTargetForProvider("GROQ"); !ok {
		t.Fatal("expected the provider lookup to be case-insensitive")
	}
	if _, ok := transcriptionTargetForProvider("ollama"); ok {
		t.Fatal("expected a provider outside the audio catalog to have no target")
	}
}

// The default implementation - not the override the handler tests install -
// must actually reach the endpoint the target describes: its baseURL, model
// and key are what the request carries.
func TestTranscribeAudioWithTargetPostsToTheResolvedEndpoint(t *testing.T) {
	var gotPath, gotModel, gotAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		if err := r.ParseMultipartForm(1 << 20); err == nil {
			gotModel = r.FormValue("model")
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"text": "bonjour", "language": "fr", "duration": 1.5})
	}))
	defer server.Close()

	result, err := transcribeAudioWithTarget(context.Background(), transcriptionTarget{
		apiKey:   "gsk-local-key",
		baseURL:  server.URL + "/openai/v1",
		provider: "groq",
		model:    "whisper-large-v3-turbo",
	}, []byte("fake-audio"))
	if err != nil {
		t.Fatalf("transcribeAudioWithTarget: %v", err)
	}
	if result.Text != "bonjour" || result.Language != "fr" {
		t.Fatalf("expected the server's transcript, got %+v", result)
	}
	if gotPath != "/openai/v1/audio/transcriptions" {
		t.Fatalf("expected the target's baseURL to be used, got %q", gotPath)
	}
	if gotModel != "whisper-large-v3-turbo" {
		t.Fatalf("expected the resolved model to be sent, got %q", gotModel)
	}
	if gotAuth != "Bearer gsk-local-key" {
		t.Fatalf("expected the resolved key to be sent, got %q", gotAuth)
	}
}

var errTranscribeTest = &transcribeTestError{"whisper unavailable"}

type transcribeTestError struct{ msg string }

func (e *transcribeTestError) Error() string { return e.msg }

// createProviderSettingWithKeyForTest mirrors createProviderSettingForTest
// but also sets an api_key, since transcription needs a real decryptable
// secret to resolve.
func createProviderSettingWithKeyForTest(t *testing.T, router http.Handler, token, provider, name, apiKey string) string {
	t.Helper()
	body, _ := json.Marshal(map[string]string{
		"provider": provider,
		"name":     name,
		"api_key":  apiKey,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/settings/providers", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create setting: got %d, body=%s", rec.Code, rec.Body.String())
	}
	var payload map[string]any
	json.NewDecoder(rec.Body).Decode(&payload)
	return payload["id"].(string)
}
