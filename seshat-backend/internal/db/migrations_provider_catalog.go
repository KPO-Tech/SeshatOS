package db

import (
	"context"
	"strings"

	"github.com/KPO-Tech/seshat-runtime/pkg/config"
	"github.com/KPO-Tech/seshat-runtime/pkg/providers"
	"github.com/KPO-Tech/seshat-runtime/pkg/sdk"
)

// formerProviderNames are the names under which Cloudflare Workers AI was stored while it was a built-in provider of the runtime. Since
// the runtime v1.11 it is the generic provider "cloudflare-workers-ai" of the models.dev catalog.
var formerProviderNames = []string{"workers-ai", "workers_ai", "workersai", "cloudflare"}

// migrateProviderCatalog brings the provider settings made before the runtime v1.11 in line with it:
//
//  1. a setting stored under a former built-in name takes the name the runtime has now;
//  2. the models of every provider the runtime describes (built-in or from the catalog) are read again from the runtime's catalog. The
//     lists used to be written by hand and stopped at a few models; the catalog replaces the rows whose source is "catalog" and leaves
//     the models the user added, and the model the user chose as the default stays the default when the catalog still has it.
//
// A provider the runtime does not describe (a custom endpoint the user added) is left alone: asking the runtime for the models of a
// name it does not know would give Anthropic's.
func migrateProviderCatalog(ctx context.Context, db *DB) error {
	if err := db.gormDB.WithContext(ctx).Model(&gProviderSetting{}).
		Where("provider IN ?", formerProviderNames).
		Update("provider", "cloudflare-workers-ai").Error; err != nil {
		return err
	}

	var settings []gProviderSetting
	if err := db.gormDB.WithContext(ctx).Find(&settings).Error; err != nil {
		return err
	}
	store, err := NewProviderModelStore(db)
	if err != nil {
		return err
	}
	catalogProviders := map[string]bool{}
	for _, p := range sdk.CatalogProviders() {
		if !p.Unverified {
			catalogProviders[p.ID] = true
		}
	}
	for _, setting := range settings {
		name := strings.ToLower(strings.TrimSpace(setting.Provider))
		if name == "ollama" || !(config.IsKnownProvider(sdk.APIProvider(name)) || catalogProviders[name]) {
			continue
		}
		static := providers.StaticModels(name)
		if len(static) == 0 {
			continue
		}
		existing, err := store.ListBySettingID(ctx, setting.ID)
		if err != nil {
			return err
		}
		if _, err := store.BulkReplaceCatalog(ctx, setting.ID, catalogParamsKeepingDefault(static, existing)); err != nil {
			return err
		}
	}
	return nil
}

// catalogParamsKeepingDefault turns the runtime's models into rows. The first model is the default unless the setting already had a
// default that the new list still contains: the user's choice is kept.
func catalogParamsKeepingDefault(static []providers.FetchedModel, existing []ProviderModel) []CreateProviderModelParams {
	keep := ""
	for _, row := range existing {
		if row.IsDefault {
			keep = row.ModelID
		}
	}
	if keep != "" {
		found := false
		for _, m := range static {
			found = found || m.ModelID == keep
		}
		if !found {
			keep = ""
		}
	}
	out := make([]CreateProviderModelParams, 0, len(static))
	for i, m := range static {
		isDefault := m.IsDefault
		if keep != "" {
			isDefault = m.ModelID == keep
		}
		out = append(out, CreateProviderModelParams{
			ModelID:       m.ModelID,
			DisplayName:   m.DisplayName,
			ContextWindow: m.ContextWindow,
			MaxOutput:     m.MaxOutput,
			IsDefault:     isDefault,
			SortOrder:     i,
		})
	}
	return out
}
