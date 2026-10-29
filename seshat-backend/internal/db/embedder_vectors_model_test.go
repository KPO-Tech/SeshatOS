package db

import (
	"context"
	"testing"
)

// The store remembers which model the vectors of the collections were made with, so that changing the model can say the search by
// meaning is wrong until they are made again.
func TestTheEmbedderRemembersTheModelTheVectorsWereMadeWith(t *testing.T) {
	ctx := context.Background()
	store, err := NewEmbedderConfigStore(openTestDB(t))
	if err != nil {
		t.Fatal(err)
	}
	mistral := UpsertEmbedderConfigParams{Provider: "mistral", BaseURL: "https://api.mistral.ai/v1", Model: "mistral-embed", Enabled: true}
	cfg, err := store.Upsert(ctx, mistral)
	if err != nil || cfg.VectorsModel != cfg.Key() {
		t.Fatalf("a first model owns the vectors: %+v (err %v)", cfg, err)
	}

	// Saving the same model again changes nothing.
	if cfg, _ = store.Upsert(ctx, mistral); cfg.VectorsModel != cfg.Key() {
		t.Fatalf("saving again moved the vectors to %q", cfg.VectorsModel)
	}

	// Another model: the vectors stay the ones of the first.
	other := UpsertEmbedderConfigParams{Provider: "openrouter", BaseURL: "https://openrouter.ai/api/v1", Model: "qwen/qwen3-embedding-8b", Enabled: true}
	cfg, _ = store.Upsert(ctx, other)
	if cfg.VectorsModel != EmbedderKey("mistral", "https://api.mistral.ai/v1", "mistral-embed") || cfg.VectorsModel == cfg.Key() {
		t.Fatalf("after the change the vectors are of %q, the model in use is %q", cfg.VectorsModel, cfg.Key())
	}

	// A change of the key only, with the model unchanged, leaves it alone; making the vectors again moves it.
	cfg, _ = store.Upsert(ctx, other)
	if cfg.VectorsModel == cfg.Key() {
		t.Fatal("saving the new model again must not claim its vectors exist")
	}
	if err := store.SetVectorsModel(ctx, cfg.Key()); err != nil {
		t.Fatal(err)
	}
	if cfg, _ = store.Get(ctx); cfg.VectorsModel != cfg.Key() {
		t.Fatalf("after the re-embedding the vectors are of %q", cfg.VectorsModel)
	}
}
