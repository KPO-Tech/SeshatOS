package api

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"

	backendauth "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/auth"
	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/bkerr"
	backendsettings "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/settings"
	audioproviders "github.com/KPO-Tech/seshat-runtime/pkg/audio/providers"
	"github.com/KPO-Tech/seshat-runtime/pkg/sdk"
)

const maxTranscribeUploadSize = 26 << 20 // ~26 MB, headroom over OpenAI's 25 MB cap

// handleTranscribe — POST /api/v1/transcribe. Voice-input control: takes a
// recorded audio clip and returns its transcript, independent of any chat
// session (compare the engine's agent-facing speech_to_text tool, which
// only runs when the model itself decides to call it mid-turn). Prefers a
// locally running whisper.cpp server when one has been configured (see
// local_stt.go, set by the Electron main process); otherwise transcribes
// with whichever configured provider the runtime's audio catalog knows how
// to reach (see resolveTranscriptionTarget).
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

	target, err := a.resolveTranscriptionTarget(r, principal)
	if err != nil {
		writeBackendError(w, bkerr.InvalidInput(err.Error(), err))
		return
	}
	target.language = normalizeSpokenLanguage(r.FormValue("language"))

	result, err := a.transcribeAudio(r.Context(), target, audioData)
	if err != nil {
		writeBackendError(w, bkerr.BadGateway("transcription failed: "+err.Error(), err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"text":     cleanTranscript(result.Text),
		"language": result.Language,
		"duration": result.Duration,
	})
}

// transcriptionTarget says where a voice-input clip should be transcribed,
// so the request handler never holds provider-specific knowledge. A local
// whisper.cpp server is baseURL alone (no key: it doesn't check the
// Authorization header); a cloud provider carries the provider type, model
// and response format the runtime's audio catalog declares for it.
type transcriptionTarget struct {
	apiKey     string
	baseURL    string
	provider   string
	model      string
	format     string
	elevenLabs bool
	// language is the spoken language the person chose (an IETF tag such as fr); empty lets the server detect it.
	language string
}

// resolveTranscriptionTarget picks a locally running whisper.cpp server when
// one is configured and enabled (no API key needed), and otherwise the first
// usable provider setting: the one the user explicitly linked for the audio
// capability, then any other configured provider with a speech-to-text
// profile. Which provider types can transcribe is decided by the runtime's
// catalog (transcriptionTargetForProvider), never by a list kept here - a
// provider type that is not in the catalog, or that has no speech-to-text
// direction, is simply skipped.
func (a *App) resolveTranscriptionTarget(r *http.Request, principal *backendauth.Principal) (transcriptionTarget, error) {
	if a.localSTTStore != nil {
		if cfg, err := a.localSTTStore.Get(r.Context()); err == nil && cfg != nil && cfg.Enabled && cfg.BaseURL != "" {
			return transcriptionTarget{baseURL: cfg.BaseURL}, nil
		}
	}

	settingsList, err := a.backend.Settings.List(r.Context(), principal)
	if err != nil {
		return transcriptionTarget{}, fmt.Errorf("could not look up your providers: %w", err)
	}

	// The provider linked for the audio capability is an explicit opt-in
	// ("use this key for audio"), so it wins over the order the settings
	// happen to come back in - the same link the agent's own
	// speech_to_text tool resolves through, see internal/config/bootstrap.go.
	linkedID := ""
	if a.capabilityLinkStore != nil {
		if id, ok, err := a.capabilityLinkStore.Get(r.Context(), string(backendsettings.CapabilityAudio)); err == nil && ok {
			linkedID = id
		}
	}

	ordered := settingsList
	if linkedID != "" {
		ordered = linkedSettingFirst(settingsList, linkedID)
	}
	for _, setting := range ordered {
		target, ok, err := a.transcriptionTargetFromSetting(r.Context(), principal, setting)
		if err != nil {
			return transcriptionTarget{}, err
		}
		if ok {
			return target, nil
		}
	}

	return transcriptionTarget{}, fmt.Errorf(
		"configure a provider that can transcribe speech in Settings to use voice input (%s, or a local whisper-server)",
		strings.Join(transcribableProviderNames(), ", "))
}

// transcriptionTargetFromSetting resolves one provider setting into a
// transcription target, or reports that it can't serve as one - either
// because the catalog doesn't know its type, or because it has no readable
// key.
func (a *App) transcriptionTargetFromSetting(ctx context.Context, principal *backendauth.Principal, setting backendsettings.ProviderSetting) (transcriptionTarget, bool, error) {
	target, ok := transcriptionTargetForProvider(setting.Provider)
	if !ok {
		return transcriptionTarget{}, false, nil
	}
	apiKey, err := a.backend.Settings.GetDecryptedAPIKey(ctx, principal, setting.ID)
	if err != nil {
		return transcriptionTarget{}, false, fmt.Errorf("could not read the %s provider's key: %w", setting.Provider, err)
	}
	if apiKey == "" {
		return transcriptionTarget{}, false, nil
	}
	target.apiKey = apiKey
	return target, true, nil
}

// transcriptionTargetForProvider asks the runtime's audio catalog where a
// provider type transcribes and with which model and response format,
// instead of listing the supported providers in this repo. The catalog's
// BaseURL is the provider's own documented endpoint; the setting's own
// BaseURL is not used here, since a chat base URL (a proxy, a gateway) is
// not necessarily one that serves audio.
func transcriptionTargetForProvider(providerType string) (transcriptionTarget, bool) {
	profile, ok := audioproviders.ProfileFor(providerType)
	if !ok || profile.STT == nil {
		return transcriptionTarget{}, false
	}
	return transcriptionTarget{
		provider:   profile.ID,
		baseURL:    profile.BaseURL,
		model:      profile.STT.DefaultModel(),
		format:     profile.STTResponseFormat,
		elevenLabs: profile.API == audioproviders.APIElevenLabs,
	}, true
}

// transcribableProviderNames lists the provider types the catalog can
// transcribe with, for the message a user sees when none is configured.
func transcribableProviderNames() []string {
	names := make([]string, 0, 4)
	for _, profile := range audioproviders.Profiles() {
		if profile.STT != nil {
			names = append(names, profile.ID)
		}
	}
	return names
}

// linkedSettingFirst returns the settings with the linked one moved to the
// front, leaving the relative order of the rest untouched.
func linkedSettingFirst(list []backendsettings.ProviderSetting, linkedID string) []backendsettings.ProviderSetting {
	for i, setting := range list {
		if setting.ID != linkedID {
			continue
		}
		if i == 0 {
			return list
		}
		reordered := make([]backendsettings.ProviderSetting, 0, len(list))
		reordered = append(reordered, setting)
		reordered = append(reordered, list[:i]...)
		reordered = append(reordered, list[i+1:]...)
		return reordered
	}
	return list
}

// transcribeAudioWithTarget is the App's default transcription call: it runs
// the clip through the runtime's own audio clients, so the provider type,
// model and response format come from the same catalog the agent's
// speech_to_text tool uses. ElevenLabs speaks its own API and has its own
// client; every other profile is OpenAI-compatible. An empty provider means
// the local whisper.cpp server reached through baseURL.
func transcribeAudioWithTarget(ctx context.Context, target transcriptionTarget, audioData []byte) (*sdk.TranscriptionResult, error) {
	if target.elevenLabs {
		opts := make([]audioproviders.ElevenLabsSTTOption, 0, 1)
		if target.model != "" {
			opts = append(opts, audioproviders.WithElevenLabsSTTModel(target.model))
		}
		return audioproviders.NewElevenLabsSTT(target.apiKey, opts...).Transcribe(ctx, audioData)
	}

	opts := make([]audioproviders.OpenAISTTOption, 0, 4)
	if target.provider != "" {
		opts = append(opts, audioproviders.WithSTTProviderName(target.provider))
	}
	if target.baseURL != "" {
		opts = append(opts, audioproviders.WithSTTBaseURL(target.baseURL))
	}
	if target.model != "" {
		opts = append(opts, audioproviders.WithSTTModel(target.model))
	}
	if target.format != "" {
		opts = append(opts, audioproviders.WithSTTResponseFormat(target.format))
	}
	if target.language != "" {
		opts = append(opts, audioproviders.WithSTTLanguage(target.language))
	}
	return audioproviders.NewOpenAISTT(target.apiKey, opts...).Transcribe(ctx, audioData)
}
