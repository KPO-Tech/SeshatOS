package db

import (
	"context"
	"strings"
	"testing"
)

func addProviderSetting(t *testing.T, db *DB, id, provider string) {
	t.Helper()
	if err := db.gormDB.Create(&gProviderSetting{ID: id, UserID: "user_1", Provider: provider, Name: id}).Error; err != nil {
		t.Fatalf("create setting %s: %v", id, err)
	}
}

func modelIDs(rows []ProviderModel) map[string]ProviderModel {
	out := map[string]ProviderModel{}
	for _, r := range rows {
		out[r.ModelID] = r
	}
	return out
}

func TestProviderCatalogMigrationRenamesTheFormerBuiltInAndReadsTheCatalogAgain(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)
	store, err := NewProviderModelStore(db)
	if err != nil {
		t.Fatal(err)
	}

	// Cloudflare Workers AI, stored under its former built-in name.
	addProviderSetting(t, db, "ps_cf", "workers-ai")
	// Anthropic, with a list written by hand long ago, a default the user chose and a model the user added.
	addProviderSetting(t, db, "ps_anthropic", "anthropic")
	if _, err := store.BulkReplaceCatalog(ctx, "ps_anthropic", []CreateProviderModelParams{
		{ModelID: "claude-sonnet-4-20250514"}, {ModelID: "claude-haiku-5-5", IsDefault: true},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Create(ctx, CreateProviderModelParams{ProviderSettingID: "ps_anthropic", ModelID: "my-finetune"}); err != nil {
		t.Fatal(err)
	}
	// A custom endpoint the runtime does not know: its models must not be touched, and must never become Anthropic's.
	addProviderSetting(t, db, "ps_custom", "my-llm")
	if _, err := store.BulkReplaceCatalog(ctx, "ps_custom", []CreateProviderModelParams{{ModelID: "local-model", IsDefault: true}}); err != nil {
		t.Fatal(err)
	}

	if err := migrateProviderCatalog(ctx, db); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	var cf gProviderSetting
	if err := db.gormDB.First(&cf, "id = ?", "ps_cf").Error; err != nil || cf.Provider != "cloudflare-workers-ai" {
		t.Fatalf("workers-ai must be stored as cloudflare-workers-ai, got %q (%v)", cf.Provider, err)
	}
	cfModels, _ := store.ListBySettingID(ctx, "ps_cf")
	if len(cfModels) == 0 {
		t.Fatal("the generic provider must be given its models from the catalog")
	}
	for _, m := range cfModels {
		if strings.HasPrefix(m.ModelID, "claude-") {
			t.Fatalf("a generic provider was given Anthropic's models: %s", m.ModelID)
		}
	}

	anthropic := modelIDs(mustList(t, store, "ps_anthropic"))
	if _, stale := anthropic["claude-sonnet-4-20250514"]; stale {
		t.Error("a model that left the catalog must not stay among the catalog rows")
	}
	if _, ok := anthropic["claude-sonnet-5-5"]; !ok {
		t.Error("the catalog's models must be there")
	}
	if row, ok := anthropic["my-finetune"]; !ok || row.Source != "user" {
		t.Errorf("the model the user added must survive: %+v, %v", row, ok)
	}
	if !anthropic["claude-haiku-5-5"].IsDefault || anthropic["claude-sonnet-5-5"].IsDefault {
		t.Error("the default the user chose must stay the default while the catalog still has it")
	}

	custom := mustList(t, store, "ps_custom")
	if len(custom) != 1 || custom[0].ModelID != "local-model" {
		t.Fatalf("a custom provider's models must be left alone: %+v", custom)
	}
}

func TestProviderCatalogMigrationFallsBackToTheCatalogDefaultWhenTheChosenOneIsGone(t *testing.T) {
	ctx := context.Background()
	db := openTestDB(t)
	store, _ := NewProviderModelStore(db)
	addProviderSetting(t, db, "ps_anthropic", "anthropic")
	if _, err := store.BulkReplaceCatalog(ctx, "ps_anthropic", []CreateProviderModelParams{{ModelID: "claude-sonnet-4-20250514", IsDefault: true}}); err != nil {
		t.Fatal(err)
	}
	if err := migrateProviderCatalog(ctx, db); err != nil {
		t.Fatal(err)
	}
	defaults := 0
	for _, m := range mustList(t, store, "ps_anthropic") {
		if m.IsDefault {
			defaults++
			if m.ModelID == "claude-sonnet-4-20250514" {
				t.Fatal("the default points at a model that is no longer listed")
			}
		}
	}
	if defaults != 1 {
		t.Fatalf("%d defaults, want exactly one", defaults)
	}
}

func mustList(t *testing.T, store *ProviderModelStore, settingID string) []ProviderModel {
	t.Helper()
	rows, err := store.ListBySettingID(context.Background(), settingID)
	if err != nil {
		t.Fatal(err)
	}
	return rows
}
