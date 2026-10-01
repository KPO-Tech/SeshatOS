package api

import (
	"context"
	"strings"

	"github.com/KPO-Tech/SeshatOS/seshat-backend/internal/db"
	backendsettings "github.com/KPO-Tech/SeshatOS/seshat-backend/internal/settings"
)

// autoLinkCapabilitiesFromProvider mirrors seshat-server's
// internal/server/api/provider_embedder_link.go: saving a chat provider's
// API key should make it usable for image generation, audio, and (for any
// embeddings-compatible vendor - see EmbedderDefaultsFor) Knowledge
// embeddings without a second manual setup step - see the 2026-08-13
// product decision that removed the standalone
// OPENAI_API_KEY/GOOGLE_API_KEY fields from Settings > Environment in favor
// of this. Called after every provider create/update; cheap no-op once a
// capability is already linked or embedder_config is already usable - never
// overwrites an existing link or config (first-configured wins, same rule
// as seshat-server).
func (a *App) autoLinkCapabilitiesFromProvider(ctx context.Context, settingID, providerType string, hasAPIKey bool) {
	if !hasAPIKey || settingID == "" {
		return
	}
	providerType = strings.ToLower(strings.TrimSpace(providerType))

	if a.capabilityLinkStore != nil {
		for _, capability := range allCapabilities {
			// Embeddings needs a full embedder_config (provider/base_url/model),
			// not just a key link - handled by autoConfigureEmbedderFromProvider
			// below, which also creates this same link once the config exists.
			if capability == backendsettings.CapabilityEmbeddings {
				continue
			}
			if !backendsettings.SupportsCapability(providerType, capability) {
				continue
			}
			if _, linked, err := a.capabilityLinkStore.Get(ctx, string(capability)); err != nil || linked {
				continue
			}
			_ = a.capabilityLinkStore.Set(ctx, string(capability), settingID)
		}
	}

	a.autoConfigureEmbedderFromProvider(ctx, settingID, providerType)
}

// autoConfigureEmbedderFromProvider is the embeddings-specific half of
// autoLinkCapabilitiesFromProvider - see its doc comment and
// EmbedderDefaultsFor's doc comment for which provider types this covers
// and why. Ollama is deliberately not handled here even though it's a real
// embedder target: its installed embedding models vary per install and need
// the existing live "detect models" probe in Knowledge settings, unlike the
// vendors in EmbedderDefaultsFor which each have one well-known default
// model safe to derive without a network round-trip during the
// provider-save request.
func (a *App) autoConfigureEmbedderFromProvider(ctx context.Context, settingID, providerType string) {
	defaults, ok := backendsettings.EmbedderDefaultsFor(providerType)
	if !ok {
		return
	}
	if a.embedderStore == nil || a.providerSettingStore == nil {
		return
	}
	if existing, err := a.embedderStore.Get(ctx); err == nil && existing != nil &&
		existing.Enabled && existing.BaseURL != "" && existing.Model != "" {
		return // already usable - don't clobber a manual config (e.g. Ollama)
	}
	setting, err := a.providerSettingStore.GetByID(ctx, settingID)
	if err != nil || !setting.HasAPIKey {
		return
	}
	apiKey, err := a.providerSettingStore.GetDecryptedAPIKey(ctx, settingID)
	if err != nil || apiKey == "" {
		return
	}
	if _, err := a.embedderStore.Upsert(ctx, db.UpsertEmbedderConfigParams{
		// The real vendor name, not a literal "openai" tag: the embedder's
		// dispatch only special-cases "ollama", everything else (including
		// "mistral", "gemini", ...) already falls through to its
		// openai-schema client - see EmbedderDefaultsFor's doc comment.
		Provider: strings.ToLower(strings.TrimSpace(providerType)),
		BaseURL:  defaults.BaseURL,
		APIKey:   &apiKey,
		Model:    defaults.Model,
		Enabled:  true,
	}); err != nil {
		return
	}
	if a.capabilityLinkStore != nil {
		if _, linked, err := a.capabilityLinkStore.Get(ctx, string(backendsettings.CapabilityEmbeddings)); err == nil && !linked {
			_ = a.capabilityLinkStore.Set(ctx, string(backendsettings.CapabilityEmbeddings), settingID)
		}
	}
}
