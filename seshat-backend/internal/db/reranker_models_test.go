package db

import (
	"context"
	"testing"
)

// Several rerank models can be set up and the one in use changed from one to another, without typing the endpoint again.
func TestRerankModelsAreListedAndOneIsUsed(t *testing.T) {
	ctx := context.Background()
	store, err := NewRerankerConfigStore(openTestDB(t))
	if err != nil {
		t.Fatal(err)
	}
	key := "sk-test"
	a, err := store.AddModel(ctx, "https://openrouter.ai/api/v1/rerank", "cohere/rerank-v3.5", &key)
	if err != nil {
		t.Fatal(err)
	}
	b, err := store.AddModel(ctx, "https://openrouter.ai/api/v1/rerank", "voyageai/rerank-2.5", &key)
	if err != nil {
		t.Fatal(err)
	}
	again, err := store.AddModel(ctx, "https://openrouter.ai/api/v1/rerank", "cohere/rerank-v3.5", nil)
	if err != nil || again.ID != a.ID || !again.HasAPIKey {
		t.Fatalf("the same model set up again gave %+v (err %v); want the first one, key kept", again, err)
	}
	if models, _ := store.ListModels(ctx); len(models) != 2 {
		t.Fatalf("%d models listed, want 2", len(models))
	}

	cfg, err := store.UseModel(ctx, b.ID)
	if err != nil || cfg == nil || cfg.Model != "voyageai/rerank-2.5" || !cfg.Enabled || !cfg.HasAPIKey {
		t.Fatalf("using the second gave %+v (err %v)", cfg, err)
	}
	if plain, _ := store.GetDecryptedAPIKey(ctx); plain != key {
		t.Fatalf("the key in use is %q, want the one set up", plain)
	}
	if missing, err := store.UseModel(ctx, "nope"); err != nil || missing != nil {
		t.Fatalf("an unknown model gave %+v (err %v), want nothing", missing, err)
	}

	if removed, _ := store.RemoveModel(ctx, a.ID); !removed {
		t.Fatal("the first model was not removed")
	}
	if models, _ := store.ListModels(ctx); len(models) != 1 || models[0].ID != b.ID {
		t.Fatalf("after removing the first, the list is %+v", models)
	}
}

// A model configured before the list existed shows in it.
func TestTheModelAlreadyConfiguredShowsInTheList(t *testing.T) {
	ctx := context.Background()
	store, _ := NewRerankerConfigStore(openTestDB(t))
	if _, err := store.Upsert(ctx, UpsertRerankerConfigParams{BaseURL: "http://localhost:8083/rerank", Model: "BAAI/bge-reranker-v2-m3", Enabled: true}); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		models, err := store.ListModels(ctx)
		if err != nil || len(models) != 1 || models[0].Model != "BAAI/bge-reranker-v2-m3" {
			t.Fatalf("list %+v (err %v), want the configured model once", models, err)
		}
	}
}
