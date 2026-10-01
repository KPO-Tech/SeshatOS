package api

import (
	"fmt"
	"io"
	"net/http"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
)

const maxTranscribeUploadSize = 26 << 20 // ~26 MB, headroom over OpenAI's 25 MB cap

// handleTranscribe — POST /api/v1/transcribe. Voice-input control: takes a
// recorded audio clip and returns its transcript, independent of any chat
// session (compare the engine's agent-facing speech_to_text tool, which
// only runs when the model itself decides to call it mid-turn). Prefers a
// locally running whisper.cpp server when one has been configured (see
// local_stt.go, set by the Electron main process); falls back to the
// caller's own configured OpenAI provider key otherwise.
func (a *App) handleTranscribe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeBackendError(w, bkerr.Unauthorized("unauthorized", nil))
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxTranscribeUploadSize)
	if err := r.ParseMultipartForm(maxTranscribeUploadSize); err != nil {
		writeBackendError(w, bkerr.InvalidInput("failed to parse multipart form: "+err.Error(), err))
		return
	}
	mpFile, _, err := r.FormFile("audio")
	if err != nil {
		writeBackendError(w, bkerr.InvalidInput("missing 'audio' field in form", err))
		return
	}
	defer mpFile.Close()
	audioData, err := io.ReadAll(mpFile)
	if err != nil {
		writeBackendError(w, bkerr.Internal("failed to read uploaded audio", err))
		return
	}

	apiKey, baseURL, err := a.resolveTranscriptionTarget(r, principal)
	if err != nil {
		writeBackendError(w, bkerr.InvalidInput(err.Error(), err))
		return
	}

	result, err := a.transcribeAudio(r.Context(), apiKey, audioData, baseURL)
	if err != nil {
		writeBackendError(w, bkerr.BadGateway("transcription failed: "+err.Error(), err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"text":     result.Text,
		"language": result.Language,
		"duration": result.Duration,
	})
}

// resolveTranscriptionTarget picks a locally running whisper.cpp server
// when one is configured and enabled (no API key needed - whisper-server
// doesn't check auth), otherwise falls back to the caller's OpenAI provider
// key against the default cloud API (empty baseURL).
func (a *App) resolveTranscriptionTarget(r *http.Request, principal *backendauth.Principal) (apiKey, baseURL string, err error) {
	if a.localSTTStore != nil {
		if cfg, err := a.localSTTStore.Get(r.Context()); err == nil && cfg != nil && cfg.Enabled && cfg.BaseURL != "" {
			return "", cfg.BaseURL, nil
		}
	}
	apiKey, err = a.resolveOpenAIKeyForTranscription(r, principal)
	return apiKey, "", err
}

// resolveOpenAIKeyForTranscription finds the caller's configured OpenAI
// provider setting and decrypts its API key — voice transcription is
// Whisper-only today, so any other provider type doesn't help here even if
// it's the user's default for chat.
func (a *App) resolveOpenAIKeyForTranscription(r *http.Request, principal *backendauth.Principal) (string, error) {
	settingsList, err := a.backend.Settings.List(r.Context(), principal)
	if err != nil {
		return "", fmt.Errorf("could not look up your providers: %w", err)
	}
	for _, setting := range settingsList {
		if setting.Provider != "openai" {
			continue
		}
		apiKey, err := a.backend.Settings.GetDecryptedAPIKey(r.Context(), principal, setting.ID)
		if err != nil {
			return "", fmt.Errorf("could not read the OpenAI provider's key: %w", err)
		}
		if apiKey != "" {
			return apiKey, nil
		}
	}
	return "", fmt.Errorf("configure an OpenAI provider in Settings to use voice transcription")
}
